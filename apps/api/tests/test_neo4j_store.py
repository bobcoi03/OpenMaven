"""Tests for the Neo4j store backend.

These tests require a running Neo4j instance. They are automatically
skipped when Neo4j is not available (no NEO4J_URI env var or connection fails).
"""

import os

import pytest

from ontology.types import LinkInstance, ObjectInstance

# Skip entire module if neo4j is not configured
NEO4J_URI = os.environ.get("NEO4J_TEST_URI", os.environ.get("NEO4J_URI"))
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "openmaven")

pytestmark = pytest.mark.skipif(
    not NEO4J_URI,
    reason="NEO4J_URI or NEO4J_TEST_URI not set — skipping Neo4j tests",
)


@pytest.fixture()
def neo4j_store():
    """Create a Neo4jStore and wipe test data before/after each test."""
    from store.neo4j_store import Neo4jStore

    store = Neo4jStore(uri=NEO4J_URI, user=NEO4J_USER, password=NEO4J_PASSWORD)

    # Clean slate
    with store._driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")

    yield store

    # Cleanup
    with store._driver.session() as session:
        session.run("MATCH (n) DETACH DELETE n")
    store.close()


class TestNeo4jObjectCRUD:
    def test_add_and_get_object(self, neo4j_store):
        obj = ObjectInstance(rid="test--1", type="Test", properties={"name": "Alpha"})
        neo4j_store.add_object(obj)

        fetched = neo4j_store.get_object("test--1")
        assert fetched is not None
        assert fetched.rid == "test--1"
        assert fetched.type == "Test"
        assert fetched.properties["name"] == "Alpha"

    def test_upsert_object(self, neo4j_store):
        obj1 = ObjectInstance(rid="test--1", type="Test", properties={"name": "A"})
        neo4j_store.add_object(obj1)

        obj2 = ObjectInstance(rid="test--1", type="Test", properties={"name": "B"})
        neo4j_store.add_object(obj2)

        fetched = neo4j_store.get_object("test--1")
        assert fetched.properties["name"] == "B"

    def test_get_nonexistent_object(self, neo4j_store):
        assert neo4j_store.get_object("no--such") is None

    def test_list_objects(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="TypeA", properties={"name": "A1"}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="TypeB", properties={"name": "B1"}))
        neo4j_store.add_object(ObjectInstance(rid="a--2", type="TypeA", properties={"name": "A2"}))

        all_objects = neo4j_store.list_objects()
        assert len(all_objects) == 3

        type_a = neo4j_store.list_objects(type_filter="TypeA")
        assert len(type_a) == 2

    def test_add_objects_bulk(self, neo4j_store):
        objects = [
            ObjectInstance(rid="t--1", type="T", properties={"name": "One"}),
            ObjectInstance(rid="t--2", type="T", properties={"name": "Two"}),
        ]
        links = [
            LinkInstance(source_rid="t--1", target_rid="t--2", link_type="REL"),
        ]
        counts = neo4j_store.add_objects_bulk(objects, links)
        assert counts["objects_added"] == 2
        assert counts["links_added"] == 1

        assert len(neo4j_store.list_objects()) == 2
        assert len(neo4j_store.list_links()) == 1


class TestNeo4jLinks:
    def test_add_link_dedup(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="B", properties={}))

        link = LinkInstance(source_rid="a--1", target_rid="b--1", link_type="TEST")
        neo4j_store.add_link(link)
        neo4j_store.add_link(link)  # duplicate — MERGE should prevent double

        links = neo4j_store.list_links()
        assert len(links) == 1

    def test_get_links_for(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="B", properties={}))
        neo4j_store.add_object(ObjectInstance(rid="c--1", type="C", properties={}))

        neo4j_store.add_link(LinkInstance(source_rid="a--1", target_rid="b--1", link_type="X"))
        neo4j_store.add_link(LinkInstance(source_rid="c--1", target_rid="a--1", link_type="Y"))

        links = neo4j_store.get_links_for("a--1")
        assert len(links) == 2

    def test_list_links_with_type_filter(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="B", properties={}))

        neo4j_store.add_link(LinkInstance(source_rid="a--1", target_rid="b--1", link_type="ALPHA"))
        neo4j_store.add_link(LinkInstance(source_rid="a--1", target_rid="b--1", link_type="BETA"))

        alpha = neo4j_store.list_links(link_type="ALPHA")
        assert len(alpha) == 1
        assert alpha[0].link_type == "ALPHA"


class TestNeo4jSources:
    def test_add_and_list_sources(self, neo4j_store):
        neo4j_store.add_source({"id": "s1", "name": "test.csv", "row_count": 10})
        neo4j_store.add_source({"id": "s2", "name": "data.xlsx", "row_count": 5})

        sources = neo4j_store.list_sources()
        assert len(sources) == 2
        ids = {s["id"] for s in sources}
        assert ids == {"s1", "s2"}


class TestNeo4jGraph:
    def test_get_graph(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={"name": "Alpha"}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="B", properties={"name": "Beta"}))
        neo4j_store.add_link(LinkInstance(source_rid="a--1", target_rid="b--1", link_type="REL"))

        graph = neo4j_store.get_graph()
        assert len(graph["nodes"]) == 2
        assert len(graph["edges"]) == 1
        assert graph["edges"][0]["source"] == "a--1"
        assert graph["edges"][0]["target"] == "b--1"

    def test_get_graph_with_type_filter(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={"name": "Alpha"}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="B", properties={"name": "Beta"}))
        neo4j_store.add_link(LinkInstance(source_rid="a--1", target_rid="b--1", link_type="REL"))

        graph = neo4j_store.get_graph(type_filters=["A"])
        assert len(graph["nodes"]) == 1
        assert len(graph["edges"]) == 0  # edge crosses types


class TestNeo4jSearch:
    def test_search_by_property(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={"name": "Alpha Corp"}))
        neo4j_store.add_object(ObjectInstance(rid="b--1", type="B", properties={"name": "Beta Inc"}))

        results = neo4j_store.search("alpha")
        assert len(results) == 1
        assert results[0].properties["name"] == "Alpha Corp"

    def test_search_with_type_filter(self, neo4j_store):
        neo4j_store.add_object(ObjectInstance(rid="a--1", type="A", properties={"name": "Alpha Corp"}))
        neo4j_store.add_object(ObjectInstance(rid="a--2", type="A", properties={"name": "Beta Corp"}))

        results = neo4j_store.search("corp", type_filter="A")
        assert len(results) == 2

        results = neo4j_store.search("alpha", type_filter="B")
        assert len(results) == 0
