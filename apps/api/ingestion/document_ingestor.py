"""Document ingestor — turn parsed documents into ontology objects.

Strategy 1: Tables found → treat as structured data (reuse CSV pipeline)
Strategy 2: Text only → Graphiti KG extraction (if configured), else Document + name matching
"""

import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from ontology.registry import OntologyRegistry
from ontology.types import (
    Cardinality,
    LinkInstance,
    LinkTypeDefinition,
    ObjectInstance,
    ObjectTypeDefinition,
    PropertyDefinition,
    PropertyType,
)
from store.base import BaseStore

from ingestion.csv_detector import detect_schema
from ingestion.csv_ingestor import ingest_csv
from ingestion.document_parser import ParsedDocument
from ingestion.models import IngestionResult

logger = logging.getLogger(__name__)

_INGEST_NS = uuid.UUID("d4e7f8a9-1b2c-3d4e-5f6a-7b8c9d0e1f2a")

# ── Document Object Type ────────────────────────────────────────────────────

DOCUMENT_TYPE = ObjectTypeDefinition(
    name="Document",
    description="An ingested document",
    icon="FileText",
    color="#94a3b8",
    title_property="name",
    properties=[
        PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
        PropertyDefinition(name="content", type=PropertyType.STRING),
        PropertyDefinition(name="source_url", type=PropertyType.URL),
        PropertyDefinition(name="page_count", type=PropertyType.NUMBER),
        PropertyDefinition(name="author", type=PropertyType.STRING),
    ],
)

MENTIONS_LINK = LinkTypeDefinition(
    name="MENTIONS",
    source_type="Document",
    target_type="*",
    cardinality=Cardinality.MANY_TO_MANY,
    description="Document mentions an entity",
)


# ── Public API ──────────────────────────────────────────────────────────────


async def ingest_document(
    parsed: ParsedDocument,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    source_id: str = "",
    source_url: str | None = None,
    graphiti=None,
) -> IngestionResult:
    """Ingest a parsed document.

    Priority: tables → Graphiti KG extraction → fallback Document + name matching.
    """
    if parsed.tables:
        return _ingest_tables(parsed, filename, registry, store, source_id)

    content = "\n\n".join(parsed.text_blocks)

    if graphiti is not None:
        import asyncio
        from kg.extract import extract_and_store

        try:
            logger.info("Using Graphiti KG extraction for %s", filename)
            return await asyncio.wait_for(
                extract_and_store(
                    text=content,
                    source_id=source_id,
                    filename=filename,
                    registry=registry,
                    store=store,
                    graphiti=graphiti,
                ),
                timeout=90,
            )
        except asyncio.TimeoutError:
            logger.warning("Graphiti timed out for %s, falling back", filename)
        except Exception as e:
            logger.warning("Graphiti failed for %s, falling back: %s", filename, e)

    return _ingest_text(parsed, filename, registry, store, source_id, source_url)


# ── Strategy 1: Tables → structured pipeline ───────────────────────────────


def _ingest_tables(
    parsed: ParsedDocument,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    source_id: str,
) -> IngestionResult:
    """Route each table through the CSV detection + ingestion pipeline."""
    total_objects = 0
    total_links = 0
    all_errors: list[str] = []
    type_name = ""

    for i, table_rows in enumerate(parsed.tables):
        if not table_rows:
            continue

        csv_text = _rows_to_csv(table_rows)
        table_filename = f"{filename}_table_{i + 1}" if len(parsed.tables) > 1 else filename
        schema = detect_schema(csv_text, table_filename)
        result = ingest_csv(csv_text, schema, registry, store, source_id)

        total_objects += result.objects_created
        total_links += result.links_created
        all_errors.extend(result.errors)
        type_name = result.type_name

    return IngestionResult(
        source_id=source_id,
        type_name=type_name or "Unknown",
        objects_created=total_objects,
        links_created=total_links,
        errors=all_errors,
    )


# ── Strategy 2: Text → Document + mentions ─────────────────────────────────


def _ingest_text(
    parsed: ParsedDocument,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    source_id: str,
    source_url: str | None,
) -> IngestionResult:
    """Create a Document object and link to mentioned entities."""
    # Register Document type
    if not registry.get_object_type("Document"):
        registry.register_object_type(DOCUMENT_TYPE)
    if not registry.get_link_type("MENTIONS"):
        registry.register_link_type(MENTIONS_LINK)

    content = "\n\n".join(parsed.text_blocks)
    title = parsed.metadata.get("title", filename)

    doc_rid = f"document--{uuid.uuid5(_INGEST_NS, f'Document:{filename}')}"
    properties: dict[str, Any] = {"name": title, "content": content[:10000]}
    if source_url:
        properties["source_url"] = source_url

    doc = ObjectInstance(
        rid=doc_rid,
        type="Document",
        properties=properties,
        created=datetime.now(timezone.utc),
        modified=datetime.now(timezone.utc),
        created_by="ingestion",
        source_id=source_id,
    )
    store.add_object(doc)

    # Entity linking via name matching
    links = _find_mentions(doc, content, store, source_id=source_id)
    for link in links:
        store.add_link(link)

    return IngestionResult(
        source_id=source_id,
        type_name="Document",
        objects_created=1,
        links_created=len(links),
        errors=[],
    )


def _find_mentions(
    doc: ObjectInstance,
    content: str,
    store: BaseStore,
    source_id: str = "",
) -> list[LinkInstance]:
    """Scan content for mentions of existing entity names."""
    content_lower = content.lower()
    links: list[LinkInstance] = []
    seen: set[str] = set()

    for obj in store.list_objects():
        name = obj.properties.get("name")
        if not isinstance(name, str) or len(name) < 3:
            continue
        if name.lower() in content_lower and obj.rid not in seen:
            seen.add(obj.rid)
            links.append(LinkInstance(
                source_rid=doc.rid,
                target_rid=obj.rid,
                link_type="MENTIONS",
                source_id=source_id,
            ))

    return links


def _rows_to_csv(rows: list[dict[str, str]]) -> str:
    """Convert a list of row dicts to CSV text."""
    if not rows:
        return ""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()
