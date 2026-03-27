"""Extract entities and relationships via Graphiti, then sync to our store."""

import json
import logging
import uuid
from datetime import datetime, timezone

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType

from ingestion.models import IngestionResult
from ontology.registry import OntologyRegistry
from ontology.types import LinkInstance, ObjectInstance
from store.base import BaseStore

from kg.types import build_edge_type_map, build_edge_types, build_entity_types

logger = logging.getLogger(__name__)

_INGEST_NS = uuid.UUID("d4e7f8a9-1b2c-3d4e-5f6a-7b8c9d0e1f2a")
_CHUNK_SIZE = 4000
_ROWS_PER_BATCH = 15


async def extract_and_store(
    text: str,
    source_id: str,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    graphiti: Graphiti,
) -> IngestionResult:
    """Run Graphiti extraction on text and sync results to our Object/LINK store."""
    chunks = _chunk_text(text)
    return await _run_episodes(
        chunks=chunks,
        episode_type=EpisodeType.text,
        source_id=source_id,
        filename=filename,
        registry=registry,
        store=store,
        graphiti=graphiti,
    )


async def extract_structured_and_store(
    rows: list[dict[str, str]],
    source_id: str,
    sheet_name: str,
    registry: OntologyRegistry,
    store: BaseStore,
    graphiti: Graphiti,
) -> IngestionResult:
    """Run Graphiti extraction on tabular rows (as JSON episodes)."""
    batches = _batch_rows(rows)
    return await _run_episodes(
        chunks=batches,
        episode_type=EpisodeType.json,
        source_id=source_id,
        filename=sheet_name,
        registry=registry,
        store=store,
        graphiti=graphiti,
    )


async def _run_episodes(
    chunks: list[str],
    episode_type: EpisodeType,
    source_id: str,
    filename: str,
    registry: OntologyRegistry,
    store: BaseStore,
    graphiti: Graphiti,
) -> IngestionResult:
    """Send chunks as Graphiti episodes and sync extracted entities to store."""
    entity_types = build_entity_types(registry)
    edge_types = build_edge_types(registry)
    edge_type_map = build_edge_type_map(registry)

    all_objects: list[ObjectInstance] = []
    all_links: list[LinkInstance] = []
    errors: list[str] = []

    for i, chunk in enumerate(chunks):
        try:
            result = await graphiti.add_episode(
                name=f"{filename} (part {i + 1}/{len(chunks)})",
                episode_body=chunk,
                source=episode_type,
                source_description=f"Ingested from {filename}",
                reference_time=datetime.now(timezone.utc),
                group_id=source_id,
                entity_types=entity_types,
                edge_types=edge_types,
                edge_type_map=edge_type_map,
            )
            objects, links = _map_results(result, source_id)
            all_objects.extend(objects)
            all_links.extend(links)
        except Exception as e:
            logger.exception("Graphiti extraction failed for chunk %d of %s", i + 1, filename)
            errors.append(f"Chunk {i + 1}: {e}")
            # Fail fast on auth errors — no point retrying with invalid keys
            if _is_auth_error(e):
                logger.error("Authentication error detected, aborting remaining chunks")
                break

    # If every chunk failed, raise so callers can fall back to a simpler pipeline
    if errors and not all_objects:
        raise RuntimeError(
            f"Graphiti extraction failed for all {len(errors)}/{len(chunks)} chunks. "
            f"First error: {errors[0]}"
        )

    if all_objects or all_links:
        store.add_objects_bulk(all_objects, all_links)

    type_names = {obj.type for obj in all_objects}
    type_name = ", ".join(sorted(type_names)) if type_names else "Unknown"

    return IngestionResult(
        source_id=source_id,
        type_name=type_name,
        objects_created=len(all_objects),
        links_created=len(all_links),
        errors=errors,
    )


def _map_results(result, source_id: str):
    """Convert Graphiti EntityNodes/EntityEdges to our ObjectInstance/LinkInstance."""
    objects: list[ObjectInstance] = []
    links: list[LinkInstance] = []
    uuid_to_rid: dict[str, str] = {}

    for node in result.nodes:
        entity_type = _extract_type_label(node.labels)
        rid = f"{entity_type.lower()}--{uuid.uuid5(_INGEST_NS, node.uuid)}"
        uuid_to_rid[node.uuid] = rid

        properties: dict[str, object] = {"name": node.name}
        if node.attributes:
            for key, value in node.attributes.items():
                if value is not None:
                    properties[key] = value

        objects.append(ObjectInstance(
            rid=rid,
            type=entity_type,
            properties=properties,
            created=datetime.now(timezone.utc),
            modified=datetime.now(timezone.utc),
            created_by="graphiti",
            source_id=source_id,
        ))

    for edge in result.edges:
        source_rid = uuid_to_rid.get(edge.source_node_uuid)
        target_rid = uuid_to_rid.get(edge.target_node_uuid)
        if not source_rid or not target_rid:
            continue

        links.append(LinkInstance(
            source_rid=source_rid,
            target_rid=target_rid,
            link_type=edge.name,
            description=edge.fact,
            source_id=source_id,
        ))

    return objects, links


def _is_auth_error(exc: Exception) -> bool:
    """Check if an exception is an authentication/API key error."""
    name = type(exc).__name__
    if "auth" in name.lower():
        return True
    # Walk the exception chain
    cause = exc.__cause__ or exc.__context__
    if cause and "auth" in type(cause).__name__.lower():
        return True
    return False


def _extract_type_label(labels: list[str]) -> str:
    """Pick the most specific label from a node's labels (skip 'Entity')."""
    for label in labels:
        if label != "Entity":
            return label
    return "Entity"


def _chunk_text(text: str) -> list[str]:
    """Split text into chunks of roughly _CHUNK_SIZE characters at paragraph boundaries."""
    if len(text) <= _CHUNK_SIZE:
        return [text]

    chunks: list[str] = []
    paragraphs = text.split("\n\n")
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        if current_len + len(para) > _CHUNK_SIZE and current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(para)
        current_len += len(para)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def _batch_rows(rows: list[dict[str, str]]) -> list[str]:
    """Batch tabular rows into JSON chunks for Graphiti episodes."""
    if not rows:
        return []

    batches: list[str] = []
    for i in range(0, len(rows), _ROWS_PER_BATCH):
        batch = rows[i : i + _ROWS_PER_BATCH]
        batches.append(json.dumps(batch, default=str))

    return batches
