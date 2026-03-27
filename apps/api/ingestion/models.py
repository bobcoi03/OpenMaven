"""Shared Pydantic models for the ingestion pipeline."""

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from ontology.types import PropertyType


class ColumnDetection(BaseModel):
    """Inferred metadata for a single CSV/table column."""

    name: str
    original_header: str
    inferred_type: PropertyType
    sample_values: list[Any] = Field(default_factory=list)
    null_count: int = 0
    unique_count: int = 0
    is_primary_key_candidate: bool = False
    is_title_candidate: bool = False


class SchemaDetection(BaseModel):
    """Full schema inference result for a structured file."""

    filename: str
    row_count: int
    columns: list[ColumnDetection]
    suggested_type_name: str
    suggested_object_type: Optional[str] = None
    suggested_primary_key: str = "rid"
    suggested_title_property: Optional[str] = None


class IngestionResult(BaseModel):
    """Summary returned after an ingestion operation."""

    source_id: str
    type_name: str
    objects_created: int = 0
    links_created: int = 0
    errors: list[str] = Field(default_factory=list)


class SourceRecord(BaseModel):
    """Metadata about an ingested source."""

    id: str
    name: str
    filename: str
    type_name: str
    row_count: int = 0
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "ingested"
