"""Map ontology type definitions to Graphiti entity/edge Pydantic models."""

from typing import Optional

from pydantic import BaseModel, Field

from ontology.registry import OntologyRegistry
from ontology.types import ObjectTypeDefinition, PropertyType


# Property type → Python type for Pydantic field annotations
_PYTHON_TYPES: dict[PropertyType, type] = {
    PropertyType.STRING: str,
    PropertyType.NUMBER: float,
    PropertyType.BOOLEAN: bool,
    PropertyType.DATE: str,
    PropertyType.URL: str,
    PropertyType.ENUM: str,
    PropertyType.GEOPOINT: dict,
    PropertyType.LIST_STRING: list,
}


def build_entity_types(registry: OntologyRegistry) -> dict[str, type[BaseModel]]:
    """Convert ObjectTypeDefinitions → Pydantic models for Graphiti entity_types."""
    result: dict[str, type[BaseModel]] = {}

    for obj_type in registry.list_object_types():
        model = _object_type_to_model(obj_type)
        result[obj_type.name] = model

    return result


def build_edge_types(registry: OntologyRegistry) -> dict[str, type[BaseModel]]:
    """Convert LinkTypeDefinitions → Pydantic models for Graphiti edge_types."""
    result: dict[str, type[BaseModel]] = {}

    for link_type in registry.list_link_types():
        model = type(link_type.name, (BaseModel,), {
            "__annotations__": {},
            "__doc__": link_type.description or f"{link_type.name} relationship",
        })
        result[link_type.name] = model

    return result


def build_edge_type_map(
    registry: OntologyRegistry,
) -> dict[tuple[str, str], list[str]]:
    """Build {(source_type, target_type): [link_names]} from registry link types."""
    result: dict[tuple[str, str], list[str]] = {}

    for link_type in registry.list_link_types():
        source = link_type.source_type
        target = link_type.target_type

        if source == "*" or target == "*":
            continue

        key = (source, target)
        result.setdefault(key, []).append(link_type.name)

    return result


def _object_type_to_model(obj_type: ObjectTypeDefinition) -> type[BaseModel]:
    """Create a Pydantic model class from an ObjectTypeDefinition."""
    annotations: dict[str, type] = {}
    field_definitions: dict[str, object] = {}

    for prop in obj_type.properties:
        python_type = _PYTHON_TYPES.get(prop.type, str)
        annotations[prop.name] = Optional[python_type]
        field_definitions[prop.name] = Field(
            None,
            description=prop.description or prop.display_name,
        )

    namespace = {
        "__annotations__": annotations,
        "__doc__": obj_type.description or f"A {obj_type.name} entity",
        **field_definitions,
    }

    return type(obj_type.name, (BaseModel,), namespace)
