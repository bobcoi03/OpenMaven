"""Graph endpoints — nodes and edges for visualization."""

from typing import Optional

from fastapi import APIRouter

from dependencies import store

router = APIRouter()


@router.get("/graph")
def get_graph(types: Optional[str] = None) -> dict:
    """Return graph nodes + edges, optionally filtered by object types.

    types is a comma-separated list: ?types=Company,Founder,Batch
    """
    type_filters = None
    if types:
        type_filters = [t.strip() for t in types.split(",")]
    return store.get_graph(type_filters=type_filters)


@router.get("/graph/neighbors/{rid:path}")
def get_neighbors(rid: str) -> dict:
    """Return neighbor nodes + edges for a given object RID."""
    return store.get_neighbors(rid)
