"""Knowledge graph extraction via neo4j-graphrag SimpleKGPipeline.

Replaces the Graphiti-based extraction with Neo4j's official GraphRAG package.
Uses Anthropic Haiku for LLM (cheap) and OpenAI text-embedding-3-small for embeddings.
"""

import json
import logging
import os
import uuid
from datetime import datetime, timezone

from ingestion.models import IngestionResult
from ontology.registry import OntologyRegistry
from ontology.types import LinkInstance, ObjectInstance
from store.base import BaseStore

logger = logging.getLogger(__name__)

_INGEST_NS = uuid.UUID("d4e7f8a9-1b2c-3d4e-5f6a-7b8c9d0e1f2a")


def _is_configured() -> bool:
    """Check if required env vars are set for the neo4j-graphrag pipeline."""
    return bool(
        os.environ.get("ANTHROPIC_API_KEY")
        and os.environ.get("OPENAI_API_KEY")
        and os.environ.get("NEO4J_URI")
    )


def _build_pipeline(
    registry: OntologyRegistry,
    neo4j_driver=None,
):
    """Build a SimpleKGPipeline from environment config + ontology registry."""
    from neo4j_graphrag.experimental.pipeline.kg_builder import SimpleKGPipeline
    from neo4j_graphrag.llm import AnthropicLLM

    api_key = os.environ["ANTHROPIC_API_KEY"]
    llm = AnthropicLLM(
        model_name="claude-haiku-4-5-20241022",
        model_params={"max_tokens": 2048},
        api_key=api_key,
    )

    # Build schema from ontology registry
    node_types, relationship_types, patterns = _schema_from_registry(registry)

    embedder = _build_embedder()

    schema = {
        "node_types": node_types,
        "relationship_types": relationship_types,
        "patterns": patterns,
    } if patterns else None

    pipeline = SimpleKGPipeline(
        llm=llm,
        driver=neo4j_driver,
        embedder=embedder,
        schema=schema,
        from_pdf=False,
        perform_entity_resolution=True,
        on_error="IGNORE",
    )
    return pipeline


def _build_embedder():
    """Build an OpenAI embedder (text-embedding-3-small is ~$0.02/1M tokens)."""
    from neo4j_graphrag.embeddings import OpenAIEmbeddings

    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=os.environ["OPENAI_API_KEY"],
    )


def _schema_from_registry(
    registry: OntologyRegistry,
) -> tuple[list, list, list]:
    """Convert our ontology registry into neo4j-graphrag schema format."""
    node_types = []
    for ot in registry.list_object_types():
        node_type = {
            "label": ot.name,
            "description": ot.description or f"A {ot.display_name} entity",
        }
        # Add property definitions if they exist
        if ot.properties:
            node_type["properties"] = [
                {"name": p.name, "type": "STRING"}
                for p in ot.properties[:10]  # Limit to avoid token bloat
            ]
        node_types.append(node_type)

    relationship_types = []
    patterns = []
    for lt in registry.list_link_types():
        relationship_types.append({
            "label": lt.name,
            "description": lt.description or f"Link from {lt.source_type} to {lt.target_type}",
        })
        patterns.append((lt.source_type, lt.name, lt.target_type))

    # If registry is empty, provide sensible defaults
    if not node_types:
        node_types = [
            "Person", "Organization", "Company", "Location",
            "Event", "Product", "Industry",
        ]
    if not relationship_types:
        relationship_types = [
            "RELATED_TO", "WORKS_AT", "LOCATED_IN", "PART_OF",
            "FOUNDED_BY", "OWNS", "INVESTED_IN",
        ]

    return node_types, relationship_types, patterns


async def extract_from_text(
    text: str,
    source_id: str,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    neo4j_driver=None,
) -> IngestionResult:
    """Run neo4j-graphrag KG extraction on text and sync results to our store."""
    if not _is_configured():
        raise RuntimeError("neo4j-graphrag pipeline not configured (missing API keys)")

    driver = neo4j_driver or _get_neo4j_driver()
    pipeline = _build_pipeline(registry, neo4j_driver=driver)

    errors: list[str] = []
    try:
        result = await pipeline.run_async(text=text)
        logger.info(
            "neo4j-graphrag extracted from %s: %s",
            filename, result,
        )
    except Exception as e:
        logger.exception("neo4j-graphrag extraction failed for %s", filename)
        errors.append(str(e))
        return IngestionResult(
            source_id=source_id,
            type_name="Unknown",
            objects_created=0,
            links_created=0,
            errors=errors,
        )

    # After extraction, the entities are in Neo4j directly.
    # We need to also sync them to our store for the API layer.
    objects, links = await _sync_from_neo4j(driver, source_id, registry, store)

    type_names = {obj.type for obj in objects}
    type_name = ", ".join(sorted(type_names)) if type_names else "Unknown"

    return IngestionResult(
        source_id=source_id,
        type_name=type_name,
        objects_created=len(objects),
        links_created=len(links),
        errors=errors,
    )


async def extract_from_structured(
    rows: list[dict[str, str]],
    source_id: str,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    neo4j_driver=None,
) -> IngestionResult:
    """Run neo4j-graphrag KG extraction on tabular data (CSV rows as text)."""
    # Convert rows to a readable text representation for the LLM
    text = _rows_to_text(rows, filename)
    return await extract_from_text(
        text=text,
        source_id=source_id,
        filename=filename,
        registry=registry,
        store=store,
        neo4j_driver=neo4j_driver,
    )


def _rows_to_text(rows: list[dict[str, str]], filename: str) -> str:
    """Convert tabular rows to text for LLM extraction.

    Uses a markdown-style table for better LLM comprehension.
    Batches to avoid sending too much at once.
    """
    if not rows:
        return ""

    # Limit to first 100 rows to avoid token explosion
    sample = rows[:100]
    headers = list(sample[0].keys())

    lines = [f"# Data from {filename}", ""]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    for row in sample:
        values = [str(row.get(h, "")).replace("|", "/") for h in headers]
        lines.append("| " + " | ".join(values) + " |")

    if len(rows) > 100:
        lines.append(f"\n(Showing first 100 of {len(rows)} rows)")

    return "\n".join(lines)


async def _sync_from_neo4j(
    driver,
    source_id: str,
    registry: OntologyRegistry,
    store: BaseStore,
) -> tuple[list[ObjectInstance], list[LinkInstance]]:
    """Read entities created by neo4j-graphrag from Neo4j and add them to our store.

    neo4j-graphrag creates nodes with __Entity__ label and __Relationship__ edges.
    We read these and convert them to our ObjectInstance/LinkInstance format.
    """
    objects: list[ObjectInstance] = []
    links: list[LinkInstance] = []

    try:
        with driver.session() as session:
            # Read entities created by neo4j-graphrag
            # The pipeline creates nodes with __Entity__ label
            result = session.run(
                """
                MATCH (n:__Entity__)
                WHERE NOT n:__KGBuilder__
                RETURN n, labels(n) AS labels
                ORDER BY n.name
                """
            )

            uuid_to_rid: dict[str, str] = {}
            for record in result:
                node = record["n"]
                labels = record["labels"]
                entity_type = _pick_type_label(labels)
                name = node.get("name", "Unknown")

                # Build a deterministic RID
                rid = f"{entity_type.lower()}--{uuid.uuid5(_INGEST_NS, str(node.element_id))}"
                uuid_to_rid[str(node.element_id)] = rid

                properties = dict(node)
                properties.pop("embedding", None)  # Don't store embedding vector

                obj = ObjectInstance(
                    rid=rid,
                    type=entity_type,
                    properties=properties,
                    created=datetime.now(timezone.utc),
                    modified=datetime.now(timezone.utc),
                    created_by="neo4j-graphrag",
                    source_id=source_id,
                )
                objects.append(obj)

            # Read relationships
            result = session.run(
                """
                MATCH (a:__Entity__)-[r]->(b:__Entity__)
                WHERE NOT type(r) IN ['__RELATIONSHIP__']
                RETURN elementId(a) AS src_id, elementId(b) AS tgt_id, type(r) AS rel_type
                """
            )

            for record in result:
                src_rid = uuid_to_rid.get(record["src_id"])
                tgt_rid = uuid_to_rid.get(record["tgt_id"])
                if src_rid and tgt_rid:
                    links.append(LinkInstance(
                        source_rid=src_rid,
                        target_rid=tgt_rid,
                        link_type=record["rel_type"],
                        source_id=source_id,
                    ))

    except Exception:
        logger.exception("Failed to sync entities from Neo4j")

    # Write to our store
    if objects or links:
        try:
            store.add_objects_bulk(objects, links)
        except Exception:
            logger.exception("Failed to write synced entities to store")

    return objects, links


def _pick_type_label(labels: list[str]) -> str:
    """Pick the most specific label, skipping internal neo4j-graphrag labels."""
    skip = {"__Entity__", "__KGBuilder__", "__Node__"}
    for label in labels:
        if label not in skip and not label.startswith("__"):
            return label
    return "Entity"


def _get_neo4j_driver():
    """Get a Neo4j driver from environment config."""
    import neo4j

    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "openmaven")
    return neo4j.GraphDatabase.driver(uri, auth=(user, password))
