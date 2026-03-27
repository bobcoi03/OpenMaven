"""Ontology type system — Pydantic models for the 4 primitives."""

from ontology.types import (
    ActionTypeDefinition,
    Cardinality,
    LinkTypeDefinition,
    ObjectInstance,
    ObjectTypeDefinition,
    PropertyDefinition,
    PropertyType,
)
from ontology.registry import OntologyRegistry

__all__ = [
    "ActionTypeDefinition",
    "Cardinality",
    "LinkTypeDefinition",
    "ObjectInstance",
    "ObjectTypeDefinition",
    "OntologyRegistry",
    "PropertyDefinition",
    "PropertyType",
]
