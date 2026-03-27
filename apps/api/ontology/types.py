"""Core ontology primitives — STIX 2.1 aligned."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ── Property Types ──────────────────────────────────────────────────────────


class PropertyType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    DATE = "date"
    GEOPOINT = "geopoint"
    ENUM = "enum"
    URL = "url"
    LIST_STRING = "list[string]"


class PropertyDefinition(BaseModel):
    """A single field on an object type."""

    name: str
    type: PropertyType
    display_name: str = ""
    required: bool = False
    description: str = ""
    enum_values: list[str] = Field(default_factory=list)

    def model_post_init(self, __context: Any) -> None:
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()


# ── Object Types ────────────────────────────────────────────────────────────


class ObjectTypeDefinition(BaseModel):
    """Schema for an entity type (Company, Founder, etc.)."""

    name: str
    display_name: str = ""
    description: str = ""
    icon: str = "Circle"
    color: str = "#a1a1aa"
    properties: list[PropertyDefinition] = Field(default_factory=list)
    primary_key: str = "rid"
    title_property: str = "name"

    def model_post_init(self, __context: Any) -> None:
        if not self.display_name:
            self.display_name = self.name

    def property_names(self) -> list[str]:
        return [p.name for p in self.properties]


# ── Link Types ──────────────────────────────────────────────────────────────


class Cardinality(str, Enum):
    ONE_TO_ONE = "one_to_one"
    ONE_TO_MANY = "one_to_many"
    MANY_TO_MANY = "many_to_many"


class LinkTypeDefinition(BaseModel):
    """Relationship schema between two object types."""

    name: str
    display_name: str = ""
    source_type: str
    target_type: str
    cardinality: Cardinality = Cardinality.MANY_TO_MANY
    description: str = ""

    def model_post_init(self, __context: Any) -> None:
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()


# ── Action Types ────────────────────────────────────────────────────────────


class ActionTypeDefinition(BaseModel):
    """Schema for a mutation (decision, edit, etc.)."""

    name: str
    display_name: str = ""
    description: str = ""
    target_types: list[str] = Field(default_factory=list)
    parameters: list[PropertyDefinition] = Field(default_factory=list)

    def model_post_init(self, __context: Any) -> None:
        if not self.display_name:
            self.display_name = self.name.replace("_", " ").title()


# ── Object Instances ────────────────────────────────────────────────────────


class ObjectInstance(BaseModel):
    """A concrete entity — an instance of an ObjectTypeDefinition."""

    rid: str
    type: str
    properties: dict[str, Any] = Field(default_factory=dict)
    created: datetime = Field(default_factory=_utc_now)
    modified: datetime = Field(default_factory=_utc_now)
    created_by: Optional[str] = None
    source_id: Optional[str] = None


class LinkInstance(BaseModel):
    """A concrete relationship between two ObjectInstances."""

    source_rid: str
    target_rid: str
    link_type: str
    description: Optional[str] = None
    source_id: Optional[str] = None
