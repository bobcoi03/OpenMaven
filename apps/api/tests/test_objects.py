"""Tests for object, graph, and search endpoints."""

from pathlib import Path

from fastapi.testclient import TestClient

from dependencies import store, SEED_PATH

# Ensure seed data is loaded for these tests
if not store.list_objects():
    store.load_seed(SEED_PATH)

from main import app

client = TestClient(app)

# Grab a known company RID from the seed data for targeted tests
_first_company = store.list_objects(type_filter="Company")[0]
_COMPANY_RID = _first_company.rid
_COMPANY_NAME = _first_company.properties["name"]


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
    response = client.get(f"/api/objects/{_COMPANY_RID}")
    assert response.status_code == 200
    obj = response.json()
    assert obj["rid"] == _COMPANY_RID
    assert obj["properties"]["name"] == _COMPANY_NAME


def test_get_object_not_found():
    response = client.get("/api/objects/nonexistent")
    assert response.status_code == 404


def test_get_object_links():
    response = client.get(f"/api/objects/{_COMPANY_RID}/links")
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
    response = client.get(f"/api/search?q={_COMPANY_NAME[:6]}")
    results = response.json()
    assert len(results) >= 1
    assert any(r["properties"]["name"] == _COMPANY_NAME for r in results)


def test_search_by_tag():
    response = client.get("/api/search?q=AI")
    results = response.json()
    assert len(results) >= 1


def test_search_with_type_filter():
    response = client.get("/api/search?q=AI&type=Company")
    results = response.json()
    assert all(r["type"] == "Company" for r in results)
