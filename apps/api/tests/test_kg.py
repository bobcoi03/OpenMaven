"""Tests for the kg/ module — type mapping, extraction, and graceful fallback."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ontology.registry import OntologyRegistry
from ontology.types import (
    Cardinality,
    LinkTypeDefinition,
    ObjectInstance,
    ObjectTypeDefinition,
    PropertyDefinition,
    PropertyType,
)
from store.memory import MemoryStore


def _build_test_registry() -> OntologyRegistry:
    """Create a small registry for testing."""
    registry = OntologyRegistry()
    registry.register_object_type(ObjectTypeDefinition(
        name="Company",
        description="A startup company",
        properties=[
            PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
            PropertyDefinition(name="industry", type=PropertyType.STRING),
            PropertyDefinition(name="employees", type=PropertyType.NUMBER),
        ],
    ))
    registry.register_object_type(ObjectTypeDefinition(
        name="Founder",
        description="A company founder",
        properties=[
            PropertyDefinition(name="name", type=PropertyType.STRING, required=True),
            PropertyDefinition(name="role", type=PropertyType.STRING),
        ],
    ))
    registry.register_link_type(LinkTypeDefinition(
        name="FOUNDED_BY",
        source_type="Company",
        target_type="Founder",
        cardinality=Cardinality.ONE_TO_MANY,
        description="Company was founded by this person",
    ))
    return registry


class TestBuildEntityTypes:
    def test_creates_pydantic_models(self):
        from kg.types import build_entity_types

        registry = _build_test_registry()
        result = build_entity_types(registry)

        assert "Company" in result
        assert "Founder" in result

        company_model = result["Company"]
        instance = company_model(name="Acme", industry="Tech", employees=50)
        assert instance.name == "Acme"
        assert instance.industry == "Tech"

    def test_all_fields_optional(self):
        from kg.types import build_entity_types

        registry = _build_test_registry()
        result = build_entity_types(registry)

        # Should be able to create with no fields
        instance = result["Company"]()
        assert instance.name is None

    def test_preserves_descriptions(self):
        from kg.types import build_entity_types

        registry = _build_test_registry()
        result = build_entity_types(registry)

        assert result["Company"].__doc__ == "A startup company"
        assert result["Founder"].__doc__ == "A company founder"


class TestBuildEdgeTypes:
    def test_creates_pydantic_models(self):
        from kg.types import build_edge_types

        registry = _build_test_registry()
        result = build_edge_types(registry)

        assert "FOUNDED_BY" in result

    def test_edge_model_has_description(self):
        from kg.types import build_edge_types

        registry = _build_test_registry()
        result = build_edge_types(registry)

        assert "founded" in result["FOUNDED_BY"].__doc__.lower()


class TestBuildEdgeTypeMap:
    def test_maps_source_target_to_link_names(self):
        from kg.types import build_edge_type_map

        registry = _build_test_registry()
        result = build_edge_type_map(registry)

        assert ("Company", "Founder") in result
        assert "FOUNDED_BY" in result[("Company", "Founder")]

    def test_skips_wildcard_types(self):
        from kg.types import build_edge_type_map

        registry = _build_test_registry()
        registry.register_link_type(LinkTypeDefinition(
            name="MENTIONS",
            source_type="Document",
            target_type="*",
            cardinality=Cardinality.MANY_TO_MANY,
        ))
        result = build_edge_type_map(registry)

        # Wildcard target should be excluded
        assert ("Document", "*") not in result


class TestExtractAndStore:
    @pytest.mark.asyncio
    async def test_maps_graphiti_results_to_store(self):
        from kg.extract import extract_and_store

        registry = _build_test_registry()
        store = MemoryStore()

        # Mock Graphiti and its add_episode result
        mock_node_company = MagicMock()
        mock_node_company.uuid = "uuid-company-1"
        mock_node_company.name = "Acme Corp"
        mock_node_company.labels = ["Entity", "Company"]
        mock_node_company.attributes = {"industry": "Tech"}

        mock_node_founder = MagicMock()
        mock_node_founder.uuid = "uuid-founder-1"
        mock_node_founder.name = "Jane Doe"
        mock_node_founder.labels = ["Entity", "Founder"]
        mock_node_founder.attributes = {"role": "CEO"}

        mock_edge = MagicMock()
        mock_edge.source_node_uuid = "uuid-company-1"
        mock_edge.target_node_uuid = "uuid-founder-1"
        mock_edge.name = "FOUNDED_BY"
        mock_edge.fact = "Acme Corp was founded by Jane Doe"

        mock_result = MagicMock()
        mock_result.nodes = [mock_node_company, mock_node_founder]
        mock_result.edges = [mock_edge]

        mock_graphiti = AsyncMock()
        mock_graphiti.add_episode = AsyncMock(return_value=mock_result)

        result = await extract_and_store(
            text="Acme Corp was founded by Jane Doe, CEO.",
            source_id="test-source",
            filename="test.txt",
            registry=registry,
            store=store,
            graphiti=mock_graphiti,
        )

        assert result.objects_created == 2
        assert result.links_created == 1
        assert result.errors == []

        objects = store.list_objects()
        assert len(objects) == 2
        names = {o.properties["name"] for o in objects}
        assert names == {"Acme Corp", "Jane Doe"}

        links = store.list_links()
        assert len(links) == 1
        assert links[0].link_type == "FOUNDED_BY"

    @pytest.mark.asyncio
    async def test_handles_extraction_error_gracefully(self):
        from kg.extract import extract_and_store

        registry = _build_test_registry()
        store = MemoryStore()

        mock_graphiti = AsyncMock()
        mock_graphiti.add_episode = AsyncMock(side_effect=RuntimeError("LLM timeout"))

        result = await extract_and_store(
            text="Some text",
            source_id="test-source",
            filename="test.txt",
            registry=registry,
            store=store,
            graphiti=mock_graphiti,
        )

        assert result.objects_created == 0
        assert len(result.errors) == 1
        assert "LLM timeout" in result.errors[0]


class TestFallbackWithoutApiKey:
    def test_get_graphiti_returns_none_without_keys(self):
        with patch.dict("os.environ", {}, clear=True):
            from kg.client import _try_build_client

            client = _try_build_client()
            assert client is None

    @pytest.mark.asyncio
    async def test_ingest_document_falls_back_without_graphiti(self):
        from ingestion.document_ingestor import ingest_document
        from ingestion.document_parser import ParsedDocument

        store = MemoryStore()
        registry = OntologyRegistry()

        parsed = ParsedDocument(
            text_blocks=["This is a test document."],
            metadata={"title": "Fallback Test"},
        )

        # graphiti=None → should use old Document + name matching path
        result = await ingest_document(
            parsed, "test.pdf", registry, store,
            source_id="fallback-1",
            graphiti=None,
        )
        assert result.type_name == "Document"
        assert result.objects_created == 1
