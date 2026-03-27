"""YC-specific ontology — Company, Founder, Batch, Industry and their links."""

from ontology.types import (
    Cardinality,
    LinkTypeDefinition,
    ObjectTypeDefinition,
    PropertyDefinition,
    PropertyType,
)
from ontology.registry import OntologyRegistry


# ── Object Types ────────────────────────────────────────────────────────────

Company = ObjectTypeDefinition(
    name="Company",
    description="A Y Combinator portfolio company",
    icon="Building2",
    color="#06b6d4",
    title_property="name",
    properties=[
        PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
        PropertyDefinition(name="description", type=PropertyType.STRING),
        PropertyDefinition(
            name="status",
            type=PropertyType.ENUM,
            enum_values=["Active", "Acquired", "Inactive"],
        ),
        PropertyDefinition(name="location", type=PropertyType.STRING),
        PropertyDefinition(name="coordinates", type=PropertyType.GEOPOINT),
        PropertyDefinition(name="employees", type=PropertyType.NUMBER),
        PropertyDefinition(name="founded", type=PropertyType.NUMBER),
        PropertyDefinition(name="hiring", type=PropertyType.BOOLEAN),
        PropertyDefinition(name="url", type=PropertyType.URL),
        PropertyDefinition(name="tags", type=PropertyType.LIST_STRING),
    ],
)

Founder = ObjectTypeDefinition(
    name="Founder",
    description="A startup founder or co-founder",
    icon="User",
    color="#a78bfa",
    title_property="name",
    properties=[
        PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
        PropertyDefinition(name="role", type=PropertyType.STRING),
        PropertyDefinition(name="linkedin", type=PropertyType.URL),
    ],
)

Batch = ObjectTypeDefinition(
    name="Batch",
    description="A YC batch (e.g. W24, S23)",
    icon="Calendar",
    color="#10b981",
    title_property="name",
    properties=[
        PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
        PropertyDefinition(name="season", type=PropertyType.ENUM, enum_values=["Winter", "Summer"]),
        PropertyDefinition(name="year", type=PropertyType.NUMBER),
    ],
)

Industry = ObjectTypeDefinition(
    name="Industry",
    description="An industry vertical",
    icon="Tags",
    color="#f59e0b",
    title_property="name",
    properties=[
        PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
    ],
)

# ── Link Types ──────────────────────────────────────────────────────────────

FOUNDED_BY = LinkTypeDefinition(
    name="FOUNDED_BY",
    source_type="Company",
    target_type="Founder",
    cardinality=Cardinality.ONE_TO_MANY,
    description="Company was founded by this person",
)

IN_BATCH = LinkTypeDefinition(
    name="IN_BATCH",
    source_type="Company",
    target_type="Batch",
    cardinality=Cardinality.MANY_TO_MANY,
    description="Company participated in this YC batch",
)

IN_INDUSTRY = LinkTypeDefinition(
    name="IN_INDUSTRY",
    source_type="Company",
    target_type="Industry",
    cardinality=Cardinality.MANY_TO_MANY,
    description="Company operates in this industry",
)

SIMILAR_TO = LinkTypeDefinition(
    name="SIMILAR_TO",
    source_type="Company",
    target_type="Company",
    cardinality=Cardinality.MANY_TO_MANY,
    description="Companies with overlapping focus areas",
)

# ── All definitions ─────────────────────────────────────────────────────────

OBJECT_TYPES = [Company, Founder, Batch, Industry]
LINK_TYPES = [FOUNDED_BY, IN_BATCH, IN_INDUSTRY, SIMILAR_TO]


def build_yc_registry() -> OntologyRegistry:
    """Create a registry pre-loaded with YC ontology types."""
    registry = OntologyRegistry()
    for obj_type in OBJECT_TYPES:
        registry.register_object_type(obj_type)
    for link_type in LINK_TYPES:
        registry.register_link_type(link_type)
    return registry
