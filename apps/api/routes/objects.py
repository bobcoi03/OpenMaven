"""Object instance endpoints — CRUD for ontology instances."""

from typing import List, Optional

from fastapi import APIRouter, HTTPException

from dependencies import store
from ontology.types import ObjectInstance

router = APIRouter()


@router.get("/objects")
def list_objects(type: Optional[str] = None) -> List[ObjectInstance]:
    return store.list_objects(type_filter=type)


@router.get("/objects/{rid}")
def get_object(rid: str) -> ObjectInstance:
    obj = store.get_object(rid)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"Object not found: {rid}")
    return obj


@router.get("/objects/{rid}/links")
def get_object_links(rid: str) -> list:
    """Return linked objects for a given entity."""
    links = store.get_links_for(rid)
    results = []
    for link in links:
        other_rid = link.target_rid if link.source_rid == rid else link.source_rid
        other = store.get_object(other_rid)
        if other:
            results.append({
                "link_type": link.link_type,
                "direction": "outgoing" if link.source_rid == rid else "incoming",
                "object": other.model_dump(),
            })
    return results
