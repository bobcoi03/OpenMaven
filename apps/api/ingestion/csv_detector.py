"""Schema inference for CSV data — small composable functions."""

import csv
import io
import re
from typing import Any

from ontology.types import (
    ObjectTypeDefinition,
    PropertyDefinition,
    PropertyType,
)
from ingestion.models import ColumnDetection, SchemaDetection


# ── Public API ──────────────────────────────────────────────────────────────


def detect_schema(csv_text: str, filename: str) -> SchemaDetection:
    """Infer a full schema from CSV text."""
    rows = parse_csv(csv_text)
    if not rows:
        return SchemaDetection(
            filename=filename,
            row_count=0,
            columns=[],
            suggested_type_name=derive_type_name(filename),
        )

    headers = list(rows[0].keys())
    columns = [detect_column(h, rows) for h in headers]

    primary_key = pick_primary_key(columns)
    title_prop = pick_title_property(columns)
    type_name = derive_type_name(filename)

    return SchemaDetection(
        filename=filename,
        row_count=len(rows),
        columns=columns,
        suggested_type_name=type_name,
        suggested_primary_key=primary_key,
        suggested_title_property=title_prop,
    )


def parse_csv(csv_text: str) -> list[dict[str, str]]:
    """Parse CSV text into a list of dicts."""
    reader = csv.DictReader(io.StringIO(csv_text))
    return list(reader)


def detect_column(header: str, rows: list[dict[str, str]]) -> ColumnDetection:
    """Analyze a single column across all rows."""
    values = [row.get(header, "") for row in rows]
    non_empty = [v for v in values if v.strip()]
    unique = set(non_empty)
    slug = slugify_header(header)

    inferred = infer_type(non_empty)
    samples = non_empty[:5]

    return ColumnDetection(
        name=slug,
        original_header=header,
        inferred_type=inferred,
        sample_values=samples,
        null_count=len(values) - len(non_empty),
        unique_count=len(unique),
        is_primary_key_candidate=_is_pk_candidate(slug, unique, len(rows)),
        is_title_candidate=_is_title_candidate(slug),
    )


def build_object_type(schema: SchemaDetection) -> ObjectTypeDefinition:
    """Build an ObjectTypeDefinition from a detected schema."""
    props = [
        PropertyDefinition(
            name=col.name,
            type=col.inferred_type,
            display_name=col.original_header,
        )
        for col in schema.columns
    ]
    return ObjectTypeDefinition(
        name=schema.suggested_type_name,
        properties=props,
        primary_key=schema.suggested_primary_key,
        title_property=schema.suggested_title_property or "name",
    )


# ── Type Inference ──────────────────────────────────────────────────────────


def infer_type(values: list[str]) -> PropertyType:
    """Infer the best PropertyType for a list of string values."""
    if not values:
        return PropertyType.STRING

    # Check in order of specificity
    if all(looks_like_bool(v) for v in values):
        return PropertyType.BOOLEAN
    if all(looks_like_number(v) for v in values):
        return PropertyType.NUMBER
    if all(looks_like_date(v) for v in values):
        return PropertyType.DATE
    if all(looks_like_url(v) for v in values):
        return PropertyType.URL
    if all(looks_like_geopoint(v) for v in values):
        return PropertyType.GEOPOINT

    return PropertyType.STRING


def looks_like_bool(v: str) -> bool:
    return v.strip().lower() in {"true", "false", "yes", "no", "1", "0", "y", "n"}


def looks_like_number(v: str) -> bool:
    v = v.strip().replace(",", "")
    try:
        float(v)
        return True
    except ValueError:
        return False


def looks_like_date(v: str) -> bool:
    date_patterns = [
        r"^\d{4}-\d{2}-\d{2}",  # 2024-01-15
        r"^\d{1,2}/\d{1,2}/\d{2,4}$",  # 1/15/2024
        r"^\d{1,2}-\d{1,2}-\d{2,4}$",  # 15-01-2024
    ]
    v = v.strip()
    return any(re.match(p, v) for p in date_patterns)


def looks_like_url(v: str) -> bool:
    v = v.strip()
    return v.startswith("http://") or v.startswith("https://")


def looks_like_geopoint(v: str) -> bool:
    """Check if value looks like 'lat,lng' pair."""
    parts = v.strip().split(",")
    if len(parts) != 2:
        return False
    try:
        lat, lng = float(parts[0].strip()), float(parts[1].strip())
        return -90 <= lat <= 90 and -180 <= lng <= 180
    except ValueError:
        return False


# ── Helpers ─────────────────────────────────────────────────────────────────


def slugify_header(header: str) -> str:
    """'First Name' → 'first_name'"""
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", header.strip())
    slug = slug.strip("_").lower()
    return slug or "column"


def derive_type_name(filename: str) -> str:
    """'my_contacts.csv' → 'MyContact'. Handles messy filenames with UUIDs."""
    base = filename.rsplit(".", 1)[0]
    # Strip full UUIDs (with dashes)
    base = re.sub(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", "", base)
    # Strip long numeric/hex sequences (6+ chars of digits/hex)
    base = re.sub(r"[0-9a-fA-F]{6,}", "", base)
    # Split on camelCase boundaries
    base = re.sub(r"([a-z])([A-Z])", r"\1_\2", base)
    words = re.split(r"[_\-\s.]+", base)
    # Keep only alphabetic words with 2+ chars
    words = [w for w in words if len(w) >= 2 and re.match(r"^[a-zA-Z]+$", w)]
    if not words:
        words = ["Import"]
    # Singularize last word (naive: strip trailing 's')
    if words[-1].endswith("s") and len(words[-1]) > 2:
        words[-1] = words[-1][:-1]
    # Cap at 3 words to keep names reasonable
    words = words[:3]
    return "".join(w.capitalize() for w in words)


def pick_primary_key(columns: list[ColumnDetection]) -> str:
    """Pick best primary key column, fallback to 'rid'."""
    for col in columns:
        if col.is_primary_key_candidate:
            return col.name
    return "rid"


def pick_title_property(columns: list[ColumnDetection]) -> str | None:
    """Pick best title/display column."""
    for col in columns:
        if col.is_title_candidate:
            return col.name
    # Fallback: first string column
    for col in columns:
        if col.inferred_type == PropertyType.STRING:
            return col.name
    return None


def _is_pk_candidate(slug: str, unique_values: set, row_count: int) -> bool:
    """A column is a PK candidate if named 'id'-like or all values unique."""
    if slug in {"id", "rid", "uuid", "key", "pk", "identifier"}:
        return True
    if slug.endswith("_id"):
        return True
    return len(unique_values) == row_count and row_count > 0


def _is_title_candidate(slug: str) -> bool:
    return slug in {"name", "title", "label", "display_name", "full_name", "company_name"}
