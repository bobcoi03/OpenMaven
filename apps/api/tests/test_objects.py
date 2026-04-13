"""Tests for object, graph, and search endpoints."""

import pytest
from fastapi.testclient import TestClient

from dependencies import store, SEED_PATH
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def ensure_seed_data():
    """Reload seed data before this module's tests run.

    test_neo4j_store.py wipes Neo4j with DETACH DELETE in its teardown, so we
    cannot rely on data loaded at import time surviving until test execution.
    """
    if not store.list_objects():
        store.load_seed(SEED_PATH)


# Grab a known company RID from the seed data for targeted tests.
# This runs after the module fixture populates the store.
def _get_company():
    objects = store.list_objects(type_filter="Company")
    if not objects:
        # Seed on first access if somehow still empty (e.g. fresh run)
        store.load_seed(SEED_PATH)
        objects = store.list_objects(type_filter="Company")
    return objects[0]


def test_list_all_objects():
    response = client.get("/api/objects")
    assert response.status_code == 200
    objects = response.json()
    assert len(objects) > 0


def test_filter_objects_by_type():
    response = client.get("/api/objects?type=Company")
    companies = response.json()
    assert len(companies) == 305
    assert all(c["type"] == "Company" for c in companies)


def test_get_single_object():
    company = _get_company()
    response = client.get(f"/api/objects/{company.rid}")
    assert response.status_code == 200
    obj = response.json()
    assert obj["rid"] == company.rid
    assert obj["properties"]["name"] == company.properties["name"]


def test_get_object_not_found():
    response = client.get("/api/objects/nonexistent")
    assert response.status_code == 404


def test_get_object_links():
    company = _get_company()
    response = client.get(f"/api/objects/{company.rid}/links")
    assert response.status_code == 200
    links = response.json()
    link_types = {link["link_type"] for link in links}
    assert "IN_BATCH" in link_types


def test_graph_returns_nodes_and_edges():
    response = client.get("/api/graph")
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) > 0
    assert len(data["edges"]) > 0


def test_graph_filter_by_type():
    response = client.get("/api/graph?types=Company,Batch")
    data = response.json()
    node_types = {n["type"] for n in data["nodes"]}
    assert "company" in node_types
    assert "batch" in node_types
    assert "founder" not in node_types


def test_search_by_name():
    company = _get_company()
    response = client.get(f"/api/search?q={company.properties['name'][:6]}")
    results = response.json()
    assert len(results) >= 1
    assert any(r["properties"]["name"] == company.properties["name"] for r in results)


def test_search_by_tag():
    response = client.get("/api/search?q=AI")
    results = response.json()
    assert len(results) >= 1


def test_search_with_type_filter():
    response = client.get("/api/search?q=AI&type=Company")
    results = response.json()
    assert all(r["type"] == "Company" for r in results)
