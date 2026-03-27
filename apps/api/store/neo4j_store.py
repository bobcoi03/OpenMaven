"""Neo4j-backed object and link store."""

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase, Driver

from ontology.types import LinkInstance, ObjectInstance
from store.base import BaseStore

logger = logging.getLogger(__name__)

# Namespace for deterministic UUID generation from old-style RIDs
_RID_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def _ensure_stix_rid(rid: str, obj_type: str) -> str:
    if "--" in rid:
        return rid
    type_slug = obj_type.lower()
    return f"{type_slug}--{uuid.uuid5(_RID_NAMESPACE, rid)}"


class Neo4jStore(BaseStore):
    """Persistent store backed by Neo4j graph database."""

    def __init__(self, uri: str, user: str, password: str) -> None:
        self._driver: Driver = GraphDatabase.driver(uri, auth=(user, password))
        self._ensure_indexes()

    def close(self) -> None:
        self._driver.close()

    def _ensure_indexes(self) -> None:
        """Create indexes for fast lookups on first connection."""
        with self._driver.session() as session:
            session.run(
                "CREATE INDEX IF NOT EXISTS FOR (n:Object) ON (n.rid)"
            )
            session.run(
                "CREATE INDEX IF NOT EXISTS FOR (n:Source) ON (n.source_id)"
            )
            session.run(
                "CREATE INDEX IF NOT EXISTS FOR (n:Object) ON (n.source_id)"
            )

    # ── Load ────────────────────────────────────────────────────────────────

    def load_seed(self, path: Path) -> None:
        data = json.loads(path.read_text())

        rid_map: dict[str, str] = {}
        for obj in data.get("objects", []):
            old_rid = obj["rid"]
            new_rid = _ensure_stix_rid(old_rid, obj["type"])
            rid_map[old_rid] = new_rid

        objects = []
        for obj in data.get("objects", []):
            obj["rid"] = rid_map.get(obj["rid"], obj["rid"])
            objects.append(ObjectInstance(**obj))

        links = []
        for link in data.get("links", []):
            link["source_rid"] = rid_map.get(link["source_rid"], link["source_rid"])
            link["target_rid"] = rid_map.get(link["target_rid"], link["target_rid"])
            links.append(LinkInstance(**link))

        self.add_objects_bulk(objects, links)
        logger.info("Loaded seed: %d objects, %d links", len(objects), len(links))

    # ── Write ───────────────────────────────────────────────────────────────

    def add_object(self, obj: ObjectInstance) -> None:
        obj.modified = datetime.now(timezone.utc)
        with self._driver.session() as session:
            session.run(
                """
                MERGE (n:Object {rid: $rid})
                SET n.type = $type,
                    n.properties = $properties,
                    n.created = $created,
                    n.modified = $modified,
                    n.created_by = $created_by,
                    n.source_id = $source_id
                """,
                rid=obj.rid,
                type=obj.type,
                properties=json.dumps(obj.properties),
                created=obj.created.isoformat(),
                modified=obj.modified.isoformat(),
                created_by=obj.created_by,
                source_id=obj.source_id,
            )

    def add_link(self, link: LinkInstance) -> None:
        with self._driver.session() as session:
            session.run(
                """
                MATCH (a:Object {rid: $source_rid})
                MATCH (b:Object {rid: $target_rid})
                MERGE (a)-[r:LINK {link_type: $link_type}]->(b)
                SET r.description = $description
                """,
                source_rid=link.source_rid,
                target_rid=link.target_rid,
                link_type=link.link_type,
                description=link.description,
            )

    def add_objects_bulk(
        self,
        objects: list[ObjectInstance],
        links: list[LinkInstance],
    ) -> dict[str, int]:
        obj_count = 0
        with self._driver.session() as session:
            # Batch objects with UNWIND for performance
            if objects:
                obj_data = [
                    {
                        "rid": o.rid,
                        "type": o.type,
                        "properties": json.dumps(o.properties),
                        "created": o.created.isoformat(),
                        "modified": datetime.now(timezone.utc).isoformat(),
                        "created_by": o.created_by,
                        "source_id": o.source_id,
                    }
                    for o in objects
                ]
                session.run(
                    """
                    UNWIND $batch AS row
                    MERGE (n:Object {rid: row.rid})
                    SET n.type = row.type,
                        n.properties = row.properties,
                        n.created = row.created,
                        n.modified = row.modified,
                        n.created_by = row.created_by,
                        n.source_id = row.source_id
                    """,
                    batch=obj_data,
                )
                obj_count = len(objects)

        link_count = 0
        if links:
            with self._driver.session() as session:
                link_data = [
                    {
                        "source_rid": l.source_rid,
                        "target_rid": l.target_rid,
                        "link_type": l.link_type,
                        "description": l.description,
                    }
                    for l in links
                ]
                session.run(
                    """
                    UNWIND $batch AS row
                    MATCH (a:Object {rid: row.source_rid})
                    MATCH (b:Object {rid: row.target_rid})
                    MERGE (a)-[r:LINK {link_type: row.link_type}]->(b)
                    SET r.description = row.description
                    """,
                    batch=link_data,
                )
                link_count = len(links)

        return {"objects_added": obj_count, "links_added": link_count}

    # ── Sources ─────────────────────────────────────────────────────────────

    def add_source(self, source: dict[str, Any]) -> None:
        with self._driver.session() as session:
            session.run(
                """
                CREATE (s:Source {
                    source_id: $source_id,
                    data: $data
                })
                """,
                source_id=source.get("id", ""),
                data=json.dumps(source),
            )

    def list_sources(self) -> list[dict[str, Any]]:
        with self._driver.session() as session:
            result = session.run("MATCH (s:Source) RETURN s.data AS data")
            return [json.loads(record["data"]) for record in result]

    def delete_source(self, source_id: str) -> dict[str, int]:
        """Delete all objects and links belonging to a source."""
        with self._driver.session() as session:
            # Count objects and links before deletion
            counts = session.run(
                """
                OPTIONAL MATCH (n:Object {source_id: $sid})
                WITH count(n) AS obj_count
                OPTIONAL MATCH (:Object {source_id: $sid})-[r:LINK]-()
                RETURN obj_count, count(r) AS link_count
                """,
                sid=source_id,
            ).single()
            objects_deleted = counts["obj_count"] if counts else 0
            links_deleted = counts["link_count"] if counts else 0

            # Delete objects (DETACH DELETE removes their relationships too)
            session.run(
                "MATCH (n:Object {source_id: $sid}) DETACH DELETE n",
                sid=source_id,
            )

            # Delete the source record
            session.run(
                "MATCH (s:Source {source_id: $sid}) DELETE s",
                sid=source_id,
            )

        return {"objects_deleted": objects_deleted, "links_deleted": links_deleted}

    # ── Objects ─────────────────────────────────────────────────────────────

    def list_objects(self, type_filter: str | None = None) -> list[ObjectInstance]:
        query = "MATCH (n:Object)"
        params: dict[str, Any] = {}
        if type_filter:
            query += " WHERE n.type = $type_filter"
            params["type_filter"] = type_filter
        query += " RETURN n"

        with self._driver.session() as session:
            result = session.run(query, **params)
            return [_record_to_object(record["n"]) for record in result]

    def get_object(self, rid: str) -> ObjectInstance | None:
        with self._driver.session() as session:
            result = session.run(
                "MATCH (n:Object {rid: $rid}) RETURN n", rid=rid
            )
            record = result.single()
            if record is None:
                return None
            return _record_to_object(record["n"])

    # ── Links ───────────────────────────────────────────────────────────────

    def get_links_for(self, rid: str) -> list[LinkInstance]:
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (a:Object)-[r:LINK]-(b:Object)
                WHERE a.rid = $rid
                RETURN a.rid AS source, b.rid AS target,
                       r.link_type AS link_type, r.description AS description,
                       startNode(r).rid AS start_rid
                """,
                rid=rid,
            )
            links = []
            for record in result:
                # Preserve directionality: if we matched via target, flip
                if record["start_rid"] == rid:
                    source_rid = rid
                    target_rid = record["target"]
                else:
                    source_rid = record["target"]
                    target_rid = rid
                links.append(LinkInstance(
                    source_rid=source_rid,
                    target_rid=target_rid,
                    link_type=record["link_type"],
                    description=record["description"],
                ))
            return links

    def list_links(self, link_type: str | None = None) -> list[LinkInstance]:
        query = "MATCH (a:Object)-[r:LINK]->(b:Object)"
        params: dict[str, Any] = {}
        if link_type:
            query += " WHERE r.link_type = $link_type"
            params["link_type"] = link_type
        query += " RETURN a.rid AS source, b.rid AS target, r.link_type AS link_type, r.description AS description"

        with self._driver.session() as session:
            result = session.run(query, **params)
            return [
                LinkInstance(
                    source_rid=record["source"],
                    target_rid=record["target"],
                    link_type=record["link_type"],
                    description=record["description"],
                )
                for record in result
            ]

    # ── Graph ───────────────────────────────────────────────────────────────

    def get_graph(
        self,
        type_filters: list[str] | None = None,
    ) -> dict[str, Any]:
        # Fetch nodes
        if type_filters:
            node_query = "MATCH (n:Object) WHERE n.type IN $types RETURN n"
            node_params: dict[str, Any] = {"types": type_filters}
        else:
            node_query = "MATCH (n:Object) RETURN n"
            node_params = {}

        with self._driver.session() as session:
            node_result = session.run(node_query, **node_params)
            objects = [_record_to_object(r["n"]) for r in node_result]
            object_rids = {o.rid for o in objects}

            nodes = [_object_to_node(o) for o in objects]

            # Fetch edges between these nodes
            if type_filters:
                edge_query = """
                    MATCH (a:Object)-[r:LINK]->(b:Object)
                    WHERE a.type IN $types AND b.type IN $types
                    RETURN a.rid AS source, b.rid AS target,
                           r.link_type AS link_type
                """
                edge_result = session.run(edge_query, types=type_filters)
            else:
                edge_query = """
                    MATCH (a:Object)-[r:LINK]->(b:Object)
                    RETURN a.rid AS source, b.rid AS target,
                           r.link_type AS link_type
                """
                edge_result = session.run(edge_query)

            edges = []
            for record in edge_result:
                src, tgt = record["source"], record["target"]
                if src in object_rids and tgt in object_rids:
                    edges.append({
                        "id": f"{src}-{record['link_type']}-{tgt}",
                        "source": src,
                        "target": tgt,
                        "label": record["link_type"],
                    })

        return {"nodes": nodes, "edges": edges}

    def get_neighbors(self, rid: str) -> dict[str, Any]:
        """Return neighbor nodes + edges for a given RID."""
        center = self.get_object(rid)
        if center is None:
            return {"nodes": [], "edges": []}

        nodes_map: dict[str, dict[str, Any]] = {
            center.rid: _object_to_node(center),
        }
        edges = []

        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (center:Object {rid: $rid})-[r:LINK]-(neighbor:Object)
                RETURN neighbor,
                       startNode(r).rid AS start_rid,
                       endNode(r).rid AS end_rid,
                       r.link_type AS link_type
                """,
                rid=rid,
            )

            for record in result:
                neighbor_obj = _record_to_object(record["neighbor"])
                nodes_map[neighbor_obj.rid] = _object_to_node(neighbor_obj)

                src = record["start_rid"]
                tgt = record["end_rid"]
                lt = record["link_type"]
                edges.append({
                    "id": f"{src}-{lt}-{tgt}",
                    "source": src,
                    "target": tgt,
                    "label": lt,
                })

        return {"nodes": list(nodes_map.values()), "edges": edges}

    # ── Search ──────────────────────────────────────────────────────────────

    def search(
        self,
        query: str,
        type_filter: str | None = None,
    ) -> list[ObjectInstance]:
        cypher = "MATCH (n:Object) WHERE toLower(n.properties) CONTAINS $query"
        params: dict[str, Any] = {"query": query.lower()}
        if type_filter:
            cypher += " AND n.type = $type_filter"
            params["type_filter"] = type_filter
        cypher += " RETURN n"

        with self._driver.session() as session:
            result = session.run(cypher, parameters=params)
            return [_record_to_object(record["n"]) for record in result]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _record_to_object(node: Any) -> ObjectInstance:
    """Convert a Neo4j node to an ObjectInstance."""
    props = json.loads(node["properties"]) if isinstance(node["properties"], str) else node["properties"]
    created_str = node.get("created")
    modified_str = node.get("modified")
    return ObjectInstance(
        rid=node["rid"],
        type=node["type"],
        properties=props,
        created=datetime.fromisoformat(created_str) if created_str else datetime.now(timezone.utc),
        modified=datetime.fromisoformat(modified_str) if modified_str else datetime.now(timezone.utc),
        created_by=node.get("created_by"),
        source_id=node.get("source_id"),
    )


def _object_to_node(obj: ObjectInstance) -> dict[str, Any]:
    """Convert an ObjectInstance to a graph node dict."""
    return {
        "id": obj.rid,
        "label": _pick_label(obj),
        "type": obj.type.lower(),
        "properties": obj.properties,
    }


def _pick_label(obj: ObjectInstance) -> str:
    for key in ("name", "title", "label", "display_name", "company_name", "full_name"):
        val = obj.properties.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    for val in obj.properties.values():
        if isinstance(val, str) and val.strip() and len(val) < 100:
            return val.strip()
    return obj.rid.split("--")[-1][:8]
