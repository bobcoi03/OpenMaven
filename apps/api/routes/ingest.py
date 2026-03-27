"""Ingestion API — upload files, fetch URLs, detect schemas.

Pipeline priority:
1. neo4j-graphrag SimpleKGPipeline (if OPENAI_API_KEY + NEO4J_URI set)
2. Graphiti (if OPENAI_API_KEY + NEO4J_URI set)
3. Flat CSV/document pipeline (always available)
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from dependencies import graphiti, registry, store
from ingestion.csv_detector import detect_schema
from ingestion.csv_ingestor import ingest_csv
from ingestion.document_ingestor import ingest_document
from ingestion.document_parser import parse_document
from ingestion.models import IngestionResult, SchemaDetection, SourceRecord
from ingestion.xlsx_reader import read_xlsx, read_xlsx_all_sheets

logger = logging.getLogger(__name__)
router = APIRouter()

STRUCTURED_EXTS = {"csv", "xlsx", "xls"}
DIRECT_IMPORT_EXTS = {"json"}
UNSTRUCTURED_EXTS = {"pdf", "docx", "pptx", "html", "htm"}


class UrlRequest(BaseModel):
    url: str


# ── Upload Endpoint ─────────────────────────────────────────────────────────


@router.post("/ingest/upload")
async def upload_file(file: UploadFile) -> IngestionResult:
    """Accept any supported file and route to the appropriate pipeline."""
    filename = file.filename or "unknown"
    ext = _get_extension(filename)
    content = await file.read()
    source_id = str(uuid.uuid4())

    try:
        if ext in DIRECT_IMPORT_EXTS:
            result = await _ingest_json(content, filename, source_id)
        elif ext in STRUCTURED_EXTS:
            result = await _ingest_structured(content, filename, ext, source_id)
        elif ext in UNSTRUCTURED_EXTS:
            result = await _ingest_unstructured(content, filename, source_id)
        else:
            all_exts = sorted(DIRECT_IMPORT_EXTS | STRUCTURED_EXTS | UNSTRUCTURED_EXTS)
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: .{ext}. Supported: {', '.join(all_exts)}",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ingestion failed for %s", filename)
        raise HTTPException(status_code=400, detail=f"Failed to process {filename}: {e}")

    try:
        _record_source(source_id, filename, result)
    except Exception as e:
        logger.exception("Failed to record source for %s", filename)
        result.errors.append(f"Source record failed: {e}")

    return result


# ── URL Endpoint ────────────────────────────────────────────────────────────


@router.post("/ingest/url")
async def ingest_url(body: UrlRequest) -> IngestionResult:
    """Fetch a web page and ingest it as a document."""
    from ingestion.url_fetcher import fetch_url

    source_id = str(uuid.uuid4())
    try:
        text, title = fetch_url(body.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e}")

    # Try neo4j-graphrag pipeline first
    result = await _try_neo4j_graphrag_text(
        text=text, source_id=source_id, filename=title,
    )
    if result:
        _record_source(source_id, body.url, result)
        return result

    # Fallback to Graphiti / flat pipeline
    from ingestion.document_parser import ParsedDocument

    parsed = ParsedDocument(
        text_blocks=[text] if text else [],
        metadata={"title": title},
    )

    result = await ingest_document(
        parsed, title, registry, store,
        source_id=source_id,
        source_url=body.url,
        graphiti=graphiti,
    )
    _record_source(source_id, body.url, result)
    return result


# ── Detect Endpoint (Preview) ──────────────────────────────────────────────


@router.post("/ingest/detect")
async def detect_file_schema(file: UploadFile) -> SchemaDetection:
    """Preview schema detection for a structured file without ingesting."""
    filename = file.filename or "unknown"
    ext = _get_extension(filename)
    content = await file.read()

    if ext == "xlsx" or ext == "xls":
        csv_text = read_xlsx(content)
    elif ext == "csv":
        csv_text = content.decode("utf-8", errors="replace")
    else:
        raise HTTPException(status_code=400, detail="Schema detection only works for CSV/XLSX files")

    return detect_schema(csv_text, filename)


# ── Sources List ────────────────────────────────────────────────────────────


@router.get("/sources")
def list_sources() -> list[SourceRecord]:
    """List all ingested sources."""
    return [SourceRecord(**s) for s in store.list_sources()]


@router.delete("/sources/{source_id}")
def delete_source(source_id: str) -> dict:
    """Delete all objects and links belonging to a source."""
    return store.delete_source(source_id)


# ── Internal: Pipeline routing ─────────────────────────────────────────────


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


async def _try_neo4j_graphrag_text(
    text: str,
    source_id: str,
    filename: str,
) -> IngestionResult | None:
    """Try the neo4j-graphrag pipeline. Returns None if not available."""
    try:
        from kg.neo4j_pipeline import extract_from_text, _is_configured

        if not _is_configured():
            return None

        return await asyncio.wait_for(
            extract_from_text(
                text=text,
                source_id=source_id,
                filename=filename,
                registry=registry,
                store=store,
            ),
            timeout=120,
        )
    except ImportError:
        logger.debug("neo4j-graphrag not installed, skipping")
        return None
    except asyncio.TimeoutError:
        logger.warning("neo4j-graphrag timed out for %s", filename)
        return None
    except Exception as e:
        logger.warning("neo4j-graphrag failed for %s: %s", filename, e)
        return None


async def _try_neo4j_graphrag_structured(
    rows: list[dict[str, str]],
    source_id: str,
    filename: str,
) -> IngestionResult | None:
    """Try neo4j-graphrag for structured data. Returns None if not available."""
    try:
        from kg.neo4j_pipeline import extract_from_structured, _is_configured

        if not _is_configured():
            return None

        return await asyncio.wait_for(
            extract_from_structured(
                rows=rows,
                source_id=source_id,
                filename=filename,
                registry=registry,
                store=store,
            ),
            timeout=120,
        )
    except ImportError:
        logger.debug("neo4j-graphrag not installed, skipping")
        return None
    except asyncio.TimeoutError:
        logger.warning("neo4j-graphrag timed out for %s", filename)
        return None
    except Exception as e:
        logger.warning("neo4j-graphrag failed for %s: %s", filename, e)
        return None


async def _ingest_json(
    content: bytes,
    filename: str,
    source_id: str,
) -> IngestionResult:
    """Ingest a JSON file — native format or array of records."""
    import json as json_mod

    from ontology.types import LinkInstance, ObjectInstance

    text = content.decode("utf-8", errors="replace")
    data = json_mod.loads(text)

    # Case 1: Native format — {objects: [...], links: [...]}
    if isinstance(data, dict) and "objects" in data:
        raw_objects = data["objects"]
        raw_links = data.get("links", [])

        objects = []
        for raw in raw_objects:
            objects.append(ObjectInstance(
                rid=raw["rid"],
                type=raw["type"],
                properties=raw.get("properties", {}),
                source_id=source_id,
            ))

        links = []
        for raw in raw_links:
            links.append(LinkInstance(
                source_rid=raw["source_rid"],
                target_rid=raw["target_rid"],
                link_type=raw["link_type"],
                description=raw.get("description"),
                source_id=source_id,
            ))

        if objects or links:
            store.add_objects_bulk(objects, links)

        type_names = sorted({o.type for o in objects})
        return IngestionResult(
            source_id=source_id,
            type_name=", ".join(type_names) if type_names else "Unknown",
            objects_created=len(objects),
            links_created=len(links),
        )

    # Case 2: Array of records — treat like CSV rows
    if isinstance(data, list) and data and isinstance(data[0], dict):
        rows = [{k: str(v) for k, v in row.items()} for row in data]

        # Try KG extraction first
        result = await _try_neo4j_graphrag_structured(rows, source_id, filename)
        if result:
            return result

        # Fallback: convert to CSV and use flat pipeline
        import csv as csv_mod
        import io

        headers = list(data[0].keys())
        buf = io.StringIO()
        writer = csv_mod.DictWriter(buf, fieldnames=headers)
        writer.writeheader()
        for row in data:
            writer.writerow({k: str(v) for k, v in row.items()})
        csv_text = buf.getvalue()

        schema = detect_schema(csv_text, filename)
        return ingest_csv(csv_text, schema, registry, store, source_id=source_id)

    raise ValueError(f"Unrecognized JSON format in {filename}. Expected {{objects: [...]}} or [{{...}}, ...]")


async def _ingest_structured(
    content: bytes,
    filename: str,
    ext: str,
    source_id: str,
) -> IngestionResult:
    """Route structured files through the best available pipeline."""
    if ext in ("xlsx", "xls"):
        return await _ingest_all_sheets(content, filename, source_id)

    csv_text = content.decode("utf-8", errors="replace")
    return await _ingest_single_csv(csv_text, filename, source_id)


async def _ingest_all_sheets(
    content: bytes,
    filename: str,
    source_id: str,
) -> IngestionResult:
    """Ingest every sheet in an XLSX file."""
    sheets = read_xlsx_all_sheets(content)

    total_objects = 0
    total_links = 0
    all_errors: list[str] = []
    type_names: list[str] = []

    for sheet_name, csv_text in sheets.items():
        sheet_filename = f"{filename} — {sheet_name}" if len(sheets) > 1 else filename
        result = await _ingest_single_csv(csv_text, sheet_filename, source_id)

        total_objects += result.objects_created
        total_links += result.links_created
        all_errors.extend(result.errors)
        type_names.append(result.type_name)

    return IngestionResult(
        source_id=source_id,
        type_name=", ".join(sorted(set(type_names))) if type_names else "Unknown",
        objects_created=total_objects,
        links_created=total_links,
        errors=all_errors,
    )


async def _ingest_single_csv(
    csv_text: str,
    filename: str,
    source_id: str,
) -> IngestionResult:
    """Try pipelines in order: neo4j-graphrag → Graphiti → flat CSV."""
    from ingestion.csv_detector import parse_csv

    rows = parse_csv(csv_text)

    # 1. Try neo4j-graphrag
    result = await _try_neo4j_graphrag_structured(rows, source_id, filename)
    if result:
        return result

    # 2. Try Graphiti
    if graphiti is not None:
        try:
            return await asyncio.wait_for(
                _ingest_csv_via_graphiti(csv_text, filename, source_id),
                timeout=90,
            )
        except asyncio.TimeoutError:
            logger.warning("Graphiti timed out for %s, falling back to CSV pipeline", filename)
        except Exception as e:
            logger.warning("Graphiti failed for %s: %s", filename, e)

    # 3. Flat CSV pipeline (always works)
    schema = detect_schema(csv_text, filename)
    return ingest_csv(csv_text, schema, registry, store, source_id=source_id)


async def _ingest_csv_via_graphiti(
    csv_text: str,
    filename: str,
    source_id: str,
) -> IngestionResult:
    """Send CSV rows through Graphiti as JSON episodes for KG extraction."""
    from ingestion.csv_detector import parse_csv
    from kg.extract import extract_structured_and_store

    rows = parse_csv(csv_text)
    if not rows:
        return IngestionResult(source_id=source_id, type_name="Unknown")

    return await extract_structured_and_store(
        rows=rows,
        source_id=source_id,
        sheet_name=filename,
        registry=registry,
        store=store,
        graphiti=graphiti,
    )


async def _ingest_unstructured(
    content: bytes,
    filename: str,
    source_id: str,
) -> IngestionResult:
    """Route unstructured files through the best available pipeline."""
    parsed = parse_document(content, filename)
    text = "\n\n".join(parsed.text_blocks)

    # Try neo4j-graphrag first
    result = await _try_neo4j_graphrag_text(
        text=text, source_id=source_id, filename=filename,
    )
    if result:
        return result

    # Fallback to Graphiti / flat document pipeline
    return await ingest_document(
        parsed, filename, registry, store,
        source_id=source_id,
        graphiti=graphiti,
    )


def _record_source(source_id: str, filename: str, result: IngestionResult) -> None:
    """Record source metadata in the store."""
    display_name = filename.rsplit("/", 1)[-1]
    store.add_source({
        "id": source_id,
        "name": display_name,
        "filename": filename,
        "type_name": result.type_name,
        "row_count": result.objects_created,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "status": "error" if result.errors else "ingested",
    })
