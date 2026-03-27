"""In-memory object and link store — loaded from seed JSON."""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ontology.types import LinkInstance, ObjectInstance
from store.base import BaseStore

# Namespace for deterministic UUID generation from old-style RIDs
_RID_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def _ensure_stix_rid(rid: str, obj_type: str) -> str:
    """Convert old-style RID to STIX format if needed."""
    if "--" in rid:
        return rid
    type_slug = obj_type.lower()
    return f"{type_slug}--{uuid.uuid5(_RID_NAMESPACE, rid)}"


class MemoryStore(BaseStore):
    """Simple in-memory store for object and link instances."""

    def __init__(self) -> None:
        self._objects: dict[str, ObjectInstance] = {}
        self._links: list[LinkInstance] = []
        self._sources: list[dict[str, Any]] = []

    # ── Load ────────────────────────────────────────────────────────────────

    def load_seed(self, path: Path) -> None:
        """Load seed data from a JSON file. Handles both old and STIX-style RIDs."""
        data = json.loads(path.read_text())

        # First pass: build RID mapping for backward compat
        rid_map: dict[str, str] = {}
        for obj in data.get("objects", []):
            old_rid = obj["rid"]
            new_rid = _ensure_stix_rid(old_rid, obj["type"])
            rid_map[old_rid] = new_rid

        for obj in data.get("objects", []):
            obj["rid"] = rid_map.get(obj["rid"], obj["rid"])
            instance = ObjectInstance(**obj)
            self._objects[instance.rid] = instance

        for link in data.get("links", []):
            link["source_rid"] = rid_map.get(link["source_rid"], link["source_rid"])
            link["target_rid"] = rid_map.get(link["target_rid"], link["target_rid"])
            self._links.append(LinkInstance(**link))

    # ── Write ───────────────────────────────────────────────────────────────

    def add_object(self, obj: ObjectInstance) -> None:
        """Upsert an object by RID."""
        obj.modified = datetime.now(timezone.utc)
        self._objects[obj.rid] = obj

    def add_link(self, link: LinkInstance) -> None:
        """Append a link, skipping exact duplicates."""
        for existing in self._links:
            if (existing.source_rid == link.source_rid
                    and existing.target_rid == link.target_rid
                    and existing.link_type == link.link_type):
                return
        self._links.append(link)

    def add_objects_bulk(
        self,
        objects: list[ObjectInstance],
        links: list[LinkInstance],
    ) -> dict[str, int]:
        """Bulk add objects and links. Returns counts."""
        obj_count = 0
        for obj in objects:
            self.add_object(obj)
            obj_count += 1
        link_count = 0
        for link in links:
            before = len(self._links)
            self.add_link(link)
            if len(self._links) > before:
                link_count += 1
        return {"objects_added": obj_count, "links_added": link_count}

    # ── Sources ─────────────────────────────────────────────────────────────

    def add_source(self, source: dict[str, Any]) -> None:
        self._sources.append(source)

    def list_sources(self) -> list[dict[str, Any]]:
        return list(self._sources)

    def delete_source(self, source_id: str) -> dict[str, int]:
        """Delete all objects and links belonging to a source."""
        # Find object RIDs to delete
        deleted_rids: set[str] = set()
        for rid, obj in list(self._objects.items()):
            if obj.source_id == source_id:
                deleted_rids.add(rid)
                del self._objects[rid]

        # Remove links belonging to this source or referencing deleted objects
        orig_link_count = len(self._links)
        self._links = [
            link for link in self._links
            if link.source_id != source_id
            and link.source_rid not in deleted_rids
            and link.target_rid not in deleted_rids
        ]
        links_deleted = orig_link_count - len(self._links)

        # Remove source record
        self._sources = [s for s in self._sources if s.get("id") != source_id]

        return {"objects_deleted": len(deleted_rids), "links_deleted": links_deleted}

    # ── Objects ─────────────────────────────────────────────────────────────

    def list_objects(self, type_filter: str | None = None) -> list[ObjectInstance]:
        objects = list(self._objects.values())
        if type_filter:
            objects = [o for o in objects if o.type == type_filter]
        return objects

    def get_object(self, rid: str) -> ObjectInstance | None:
        return self._objects.get(rid)

    # ── Links ───────────────────────────────────────────────────────────────

    def get_links_for(self, rid: str) -> list[LinkInstance]:
        return [
            link for link in self._links
            if link.source_rid == rid or link.target_rid == rid
        ]

    def list_links(self, link_type: str | None = None) -> list[LinkInstance]:
        if link_type:
            return [l for l in self._links if l.link_type == link_type]
        return list(self._links)

    # ── Graph ───────────────────────────────────────────────────────────────

    def get_graph(
        self,
        type_filters: list[str] | None = None,
    ) -> dict[str, Any]:
        """Return nodes + edges for the graph view."""
        objects = self.list_objects()
        if type_filters:
            objects = [o for o in objects if o.type in type_filters]

        object_rids = {o.rid for o in objects}
        nodes = [_object_to_node(o) for o in objects]

        edges = [
            _link_to_edge(link)
            for link in self._links
            if link.source_rid in object_rids and link.target_rid in object_rids
        ]

        return {"nodes": nodes, "edges": edges}

    def get_neighbors(self, rid: str) -> dict[str, Any]:
        """Return neighbor nodes + edges for a given RID."""
        center = self.get_object(rid)
        if center is None:
            return {"nodes": [], "edges": []}

        links = self.get_links_for(rid)
        neighbor_rids = set()
        for link in links:
            neighbor_rids.add(
                link.target_rid if link.source_rid == rid else link.source_rid
            )

        nodes = [_object_to_node(center)]
        for n_rid in neighbor_rids:
            obj = self.get_object(n_rid)
            if obj:
                nodes.append(_object_to_node(obj))

        edges = [_link_to_edge(link) for link in links]
        return {"nodes": nodes, "edges": edges}

    # ── Search ──────────────────────────────────────────────────────────────

    def search(
        self,
        query: str,
        type_filter: str | None = None,
    ) -> list[ObjectInstance]:
        """Simple text search across object properties."""
        query_lower = query.lower()
        results = []
        for obj in self.list_objects(type_filter):
            if _matches_query(obj, query_lower):
                results.append(obj)
        return results


# ── Helpers ─────────────────────────────────────────────────────────────────


def _object_to_node(obj: ObjectInstance) -> dict[str, Any]:
    """Convert an ObjectInstance to a graph node dict."""
    label = _pick_label(obj)
    return {
        "id": obj.rid,
        "label": label,
        "type": obj.type.lower(),
        "properties": obj.properties,
    }


def _pick_label(obj: ObjectInstance) -> str:
    """Pick the best human-readable label for a node."""
    # Try common title-like property names
    for key in ("name", "title", "label", "display_name", "company_name", "full_name"):
        val = obj.properties.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # Fallback: first non-empty string property value
    for val in obj.properties.values():
        if isinstance(val, str) and val.strip() and len(val) < 100:
            return val.strip()
    # Last resort: short RID
    return obj.rid.split("--")[-1][:8]


def _link_to_edge(link: LinkInstance) -> dict[str, str]:
    """Convert a LinkInstance to a graph edge dict."""
    return {
        "id": f"{link.source_rid}-{link.link_type}-{link.target_rid}",
        "source": link.source_rid,
        "target": link.target_rid,
        "label": link.link_type,
    }


def _matches_query(obj: ObjectInstance, query: str) -> bool:
    """Check if any string property contains the query."""
    for value in obj.properties.values():
        if isinstance(value, str) and query in value.lower():
            return True
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and query in item.lower():
                    return True
    return False
