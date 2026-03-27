"""Search endpoint — text search across objects."""

from typing import List, Optional

from fastapi import APIRouter, Query

from dependencies import store
from ontology.types import ObjectInstance

router = APIRouter()


@router.get("/search")
def search_objects(
    q: str = Query(..., min_length=1),
    type: Optional[str] = None,
) -> List[ObjectInstance]:
    return store.search(query=q, type_filter=type)
