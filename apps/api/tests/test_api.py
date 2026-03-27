"""Tests for API endpoints."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "OpenMaven"


def test_list_object_types():
    response = client.get("/api/ontology/object-types")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_list_link_types():
    response = client.get("/api/ontology/link-types")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


# ── Graph ──────────────────────────────────────────────────────────────────


def test_graph_returns_nodes_and_edges():
    response = client.get("/api/graph")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data


def test_neighbors_unknown_rid_returns_empty():
    """Unknown RID returns empty graph, not 404."""
    response = client.get("/api/graph/neighbors/nonexistent--00000000-0000-0000-0000-000000000000")
    assert response.status_code == 200
    data = response.json()
    assert data == {"nodes": [], "edges": []}


# ── Delete source ─────────────────────────────────────────────────────────


def test_delete_source_unknown():
    """Deleting an unknown source returns empty counts, not an error."""
    response = client.delete("/api/sources/nonexistent-id")
    assert response.status_code == 200
    data = response.json()
    assert data["objects_deleted"] == 0
    assert data["links_deleted"] == 0
