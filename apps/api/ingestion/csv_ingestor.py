"""Structured data ingestor — CSV text → ObjectInstances in the store."""

import uuid
from datetime import datetime, timezone
from typing import Any

from ontology.registry import OntologyRegistry
from ontology.types import (
    Cardinality,
    LinkInstance,
    LinkTypeDefinition,
    ObjectInstance,
    PropertyType,
)
from store.base import BaseStore

from ingestion.csv_detector import (
    build_object_type,
    detect_schema,
    parse_csv,
    slugify_header,
)
from ingestion.models import IngestionResult, SchemaDetection

# Namespace for deterministic RID generation
_INGEST_NS = uuid.UUID("d4e7f8a9-1b2c-3d4e-5f6a-7b8c9d0e1f2a")


# ── Public API ──────────────────────────────────────────────────────────────


def ingest_csv(
    csv_text: str,
    schema: SchemaDetection,
    registry: OntologyRegistry,
    store: BaseStore,
    source_id: str = "",
) -> IngestionResult:
    """Full CSV ingestion: register type, create objects, detect links."""
    errors: list[str] = []

    # 1. Register object type
    obj_type = build_object_type(schema)
    registry.register_object_type(obj_type)

    # 2. Parse rows → ObjectInstances
    rows = parse_csv(csv_text)
    objects: list[ObjectInstance] = []
    for i, row in enumerate(rows):
        try:
            obj = row_to_object(row, schema, source_id)
            objects.append(obj)
        except Exception as e:
            errors.append(f"Row {i + 1}: {e}")

    # 3. Detect links to existing objects
    links = detect_links(objects, schema, registry, store, source_id=source_id)

    # 4. Bulk add
    store.add_objects_bulk(objects, links)

    return IngestionResult(
        source_id=source_id,
        type_name=schema.suggested_type_name,
        objects_created=len(objects),
        links_created=len(links),
        errors=errors,
    )


def row_to_object(row: dict[str, str], schema: SchemaDetection, source_id: str = "") -> ObjectInstance:
    """Convert a CSV row dict to an ObjectInstance."""
    col_map = {col.original_header: col for col in schema.columns}
    properties: dict[str, Any] = {}

    for header, raw_value in row.items():
        col = col_map.get(header)
        if not col:
            continue
        coerced = coerce_value(raw_value, col.inferred_type)
        if coerced is not None:
            properties[col.name] = coerced

    rid = generate_rid(schema.suggested_type_name, properties, schema)
    return ObjectInstance(
        rid=rid,
        type=schema.suggested_type_name,
        properties=properties,
        created=datetime.now(timezone.utc),
        modified=datetime.now(timezone.utc),
        created_by="ingestion",
        source_id=source_id,
    )


def generate_rid(type_name: str, properties: dict[str, Any], schema: SchemaDetection) -> str:
    """Generate a STIX-style RID: {type}--{uuid5}."""
    type_slug = type_name.lower()

    # Use primary key value if available
    pk = schema.suggested_primary_key
    if pk != "rid" and pk in properties:
        seed = f"{type_name}:{properties[pk]}"
    elif schema.suggested_title_property and schema.suggested_title_property in properties:
        seed = f"{type_name}:{properties[schema.suggested_title_property]}"
    else:
        seed = f"{type_name}:{uuid.uuid4()}"

    return f"{type_slug}--{uuid.uuid5(_INGEST_NS, seed)}"


def coerce_value(raw: str, prop_type: PropertyType) -> Any:
    """Coerce a raw CSV string to the appropriate Python type."""
    if not raw or not raw.strip():
        return None

    raw = raw.strip()

    if prop_type == PropertyType.NUMBER:
        raw_clean = raw.replace(",", "")
        try:
            if "." in raw_clean:
                return float(raw_clean)
            return int(raw_clean)
        except ValueError:
            return raw

    if prop_type == PropertyType.BOOLEAN:
        return raw.lower() in {"true", "yes", "1", "y"}

    if prop_type == PropertyType.GEOPOINT:
        parts = raw.split(",")
        if len(parts) == 2:
            try:
                return {"lat": float(parts[0].strip()), "lng": float(parts[1].strip())}
            except ValueError:
                return raw

    # STRING, DATE, URL, ENUM → return as-is
    return raw


def detect_links(
    new_objects: list[ObjectInstance],
    schema: SchemaDetection,
    registry: OntologyRegistry,
    store: BaseStore,
    source_id: str = "",
) -> list[LinkInstance]:
    """Detect links between new objects and existing objects via name matching."""
    existing = store.list_objects()
    if not existing:
        return []

    # Build name → object index for existing objects
    name_index: dict[str, ObjectInstance] = {}
    for obj in existing:
        name = obj.properties.get("name")
        if isinstance(name, str) and name:
            name_index[name.lower()] = obj

    links: list[LinkInstance] = []
    type_name = schema.suggested_type_name

    for new_obj in new_objects:
        for _key, value in new_obj.properties.items():
            if not isinstance(value, str):
                continue
            match = name_index.get(value.lower())
            if match and match.rid != new_obj.rid:
                link_type_name = f"RELATED_TO_{match.type.upper()}"
                # Auto-register link type
                if not registry.get_link_type(link_type_name):
                    registry.register_link_type(LinkTypeDefinition(
                        name=link_type_name,
                        source_type=type_name,
                        target_type=match.type,
                        cardinality=Cardinality.MANY_TO_MANY,
                        description=f"Auto-detected link from {type_name} to {match.type}",
                    ))
                links.append(LinkInstance(
                    source_rid=new_obj.rid,
                    target_rid=match.rid,
                    link_type=link_type_name,
                    source_id=source_id,
                ))

    return links
