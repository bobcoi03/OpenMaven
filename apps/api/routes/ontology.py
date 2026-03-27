"""Ontology API — serve type definitions."""

from fastapi import APIRouter

from dependencies import registry
from ontology.types import LinkTypeDefinition, ObjectTypeDefinition

router = APIRouter()


@router.get("/object-types")
def list_object_types() -> list[ObjectTypeDefinition]:
    return registry.list_object_types()


@router.get("/link-types")
def list_link_types() -> list[LinkTypeDefinition]:
    return registry.list_link_types()
