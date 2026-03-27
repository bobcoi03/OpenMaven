"""Tests for the multi-format ingestion pipeline."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from ingestion.csv_detector import (
    derive_type_name,
    detect_column,
    detect_schema,
    infer_type,
    looks_like_bool,
    looks_like_date,
    looks_like_geopoint,
    looks_like_number,
    looks_like_url,
    parse_csv,
    pick_primary_key,
    pick_title_property,
    slugify_header,
)
from ingestion.csv_ingestor import coerce_value, detect_links, generate_rid, ingest_csv, row_to_object
from ingestion.models import ColumnDetection, SchemaDetection
from ingestion.xlsx_reader import read_xlsx
from ontology.registry import OntologyRegistry
from ontology.types import LinkInstance, ObjectInstance, PropertyType
from store.memory import MemoryStore


# ── Type helper tests ───────────────────────────────────────────────────────


class TestLooksLikeHelpers:
    def test_looks_like_bool(self):
        assert looks_like_bool("true")
        assert looks_like_bool("False")
        assert looks_like_bool("yes")
        assert looks_like_bool("0")
        assert not looks_like_bool("maybe")
        assert not looks_like_bool("123")

    def test_looks_like_number(self):
        assert looks_like_number("42")
        assert looks_like_number("3.14")
        assert looks_like_number("-100")
        assert looks_like_number("1,000")
        assert not looks_like_number("abc")
        assert not looks_like_number("")

    def test_looks_like_date(self):
        assert looks_like_date("2024-01-15")
        assert looks_like_date("1/15/2024")
        assert looks_like_date("15-01-2024")
        assert not looks_like_date("not a date")
        assert not looks_like_date("42")

    def test_looks_like_url(self):
        assert looks_like_url("https://example.com")
        assert looks_like_url("http://test.org/page")
        assert not looks_like_url("example.com")
        assert not looks_like_url("ftp://files.com")

    def test_looks_like_geopoint(self):
        assert looks_like_geopoint("37.7749, -122.4194")
        assert looks_like_geopoint("0, 0")
        assert not looks_like_geopoint("200, 300")
        assert not looks_like_geopoint("abc, def")
        assert not looks_like_geopoint("just text")


class TestInferType:
    def test_empty_values(self):
        assert infer_type([]) == PropertyType.STRING

    def test_bool_values(self):
        assert infer_type(["true", "false", "yes"]) == PropertyType.BOOLEAN

    def test_number_values(self):
        assert infer_type(["42", "3.14", "100"]) == PropertyType.NUMBER

    def test_date_values(self):
        assert infer_type(["2024-01-01", "2024-06-15"]) == PropertyType.DATE

    def test_url_values(self):
        assert infer_type(["https://a.com", "https://b.com"]) == PropertyType.URL

    def test_mixed_values_fallback_to_string(self):
        assert infer_type(["hello", "42", "true"]) == PropertyType.STRING


# ── Slug/name tests ─────────────────────────────────────────────────────────


class TestSlugifyHeader:
    def test_basic(self):
        assert slugify_header("First Name") == "first_name"

    def test_special_chars(self):
        assert slugify_header("Company (Name)") == "company_name"

    def test_already_snake(self):
        assert slugify_header("email_address") == "email_address"


class TestDeriveTypeName:
    def test_simple(self):
        assert derive_type_name("contacts.csv") == "Contact"

    def test_multi_word(self):
        assert derive_type_name("my_contacts.csv") == "MyContact"

    def test_with_hyphens(self):
        assert derive_type_name("sales-leads.xlsx") == "SalesLead"


# ── Schema detection tests ──────────────────────────────────────────────────

SAMPLE_CSV = """name,age,email,is_active,website
Alice,30,alice@test.com,true,https://alice.dev
Bob,25,bob@test.com,false,https://bob.dev
Charlie,35,charlie@test.com,yes,https://charlie.dev"""


class TestDetectSchema:
    def test_basic_schema(self):
        schema = detect_schema(SAMPLE_CSV, "contacts.csv")
        assert schema.row_count == 3
        assert schema.suggested_type_name == "Contact"
        assert len(schema.columns) == 5

        col_types = {c.name: c.inferred_type for c in schema.columns}
        assert col_types["name"] == PropertyType.STRING
        assert col_types["age"] == PropertyType.NUMBER
        assert col_types["is_active"] == PropertyType.BOOLEAN
        assert col_types["website"] == PropertyType.URL

    def test_title_property_detected(self):
        schema = detect_schema(SAMPLE_CSV, "contacts.csv")
        assert schema.suggested_title_property == "name"

    def test_empty_csv(self):
        schema = detect_schema("", "empty.csv")
        assert schema.row_count == 0
        assert schema.columns == []


class TestPickPrimaryKey:
    def test_prefers_id_column(self):
        cols = [
            ColumnDetection(name="id", original_header="id", inferred_type=PropertyType.NUMBER, is_primary_key_candidate=True),
            ColumnDetection(name="name", original_header="name", inferred_type=PropertyType.STRING),
        ]
        assert pick_primary_key(cols) == "id"

    def test_fallback_to_rid(self):
        cols = [
            ColumnDetection(name="name", original_header="name", inferred_type=PropertyType.STRING),
        ]
        assert pick_primary_key(cols) == "rid"


class TestPickTitleProperty:
    def test_prefers_name(self):
        cols = [
            ColumnDetection(name="name", original_header="name", inferred_type=PropertyType.STRING, is_title_candidate=True),
            ColumnDetection(name="age", original_header="age", inferred_type=PropertyType.NUMBER),
        ]
        assert pick_title_property(cols) == "name"

    def test_fallback_to_first_string(self):
        cols = [
            ColumnDetection(name="count", original_header="count", inferred_type=PropertyType.NUMBER),
            ColumnDetection(name="label", original_header="label", inferred_type=PropertyType.STRING, is_title_candidate=True),
        ]
        assert pick_title_property(cols) == "label"


# ── Coerce value tests ─────────────────────────────────────────────────────


class TestCoerceValue:
    def test_number_int(self):
        assert coerce_value("42", PropertyType.NUMBER) == 42

    def test_number_float(self):
        assert coerce_value("3.14", PropertyType.NUMBER) == 3.14

    def test_number_with_comma(self):
        assert coerce_value("1,000", PropertyType.NUMBER) == 1000

    def test_bool_true(self):
        assert coerce_value("yes", PropertyType.BOOLEAN) is True

    def test_bool_false(self):
        assert coerce_value("no", PropertyType.BOOLEAN) is False

    def test_geopoint(self):
        result = coerce_value("37.7749, -122.4194", PropertyType.GEOPOINT)
        assert result == {"lat": 37.7749, "lng": -122.4194}

    def test_empty_returns_none(self):
        assert coerce_value("", PropertyType.STRING) is None

    def test_string_passthrough(self):
        assert coerce_value("hello", PropertyType.STRING) == "hello"


# ── CSV ingest end-to-end ──────────────────────────────────────────────────


class TestCsvIngest:
    def test_full_pipeline(self):
        store = MemoryStore()
        registry = OntologyRegistry()

        schema = detect_schema(SAMPLE_CSV, "contacts.csv")
        result = ingest_csv(SAMPLE_CSV, schema, registry, store, source_id="test-1")

        assert result.objects_created == 3
        assert result.type_name == "Contact"
        assert result.errors == []

        # Verify objects in store
        objects = store.list_objects(type_filter="Contact")
        assert len(objects) == 3

        names = {o.properties["name"] for o in objects}
        assert names == {"Alice", "Bob", "Charlie"}

        # Verify type registered
        obj_type = registry.get_object_type("Contact")
        assert obj_type is not None
        assert obj_type.title_property == "name"


# ── Store write method tests ───────────────────────────────────────────────


class TestStoreWriteMethods:
    def test_add_object_upsert(self):
        store = MemoryStore()
        obj = ObjectInstance(rid="test--1", type="Test", properties={"name": "A"})
        store.add_object(obj)
        assert store.get_object("test--1") is not None

        # Upsert with new properties
        obj2 = ObjectInstance(rid="test--1", type="Test", properties={"name": "B"})
        store.add_object(obj2)
        assert store.get_object("test--1").properties["name"] == "B"

    def test_add_link_dedup(self):
        store = MemoryStore()
        link = LinkInstance(source_rid="a", target_rid="b", link_type="TEST")
        store.add_link(link)
        store.add_link(link)  # duplicate
        assert len(store.list_links()) == 1

    def test_add_link_different(self):
        store = MemoryStore()
        link1 = LinkInstance(source_rid="a", target_rid="b", link_type="TEST")
        link2 = LinkInstance(source_rid="a", target_rid="c", link_type="TEST")
        store.add_link(link1)
        store.add_link(link2)
        assert len(store.list_links()) == 2

    def test_add_objects_bulk(self):
        store = MemoryStore()
        objects = [
            ObjectInstance(rid="t--1", type="T", properties={}),
            ObjectInstance(rid="t--2", type="T", properties={}),
        ]
        links = [
            LinkInstance(source_rid="t--1", target_rid="t--2", link_type="REL"),
        ]
        counts = store.add_objects_bulk(objects, links)
        assert counts == {"objects_added": 2, "links_added": 1}

    def test_source_tracking(self):
        store = MemoryStore()
        store.add_source({"id": "s1", "name": "test", "filename": "test.csv"})
        assert len(store.list_sources()) == 1
        assert store.list_sources()[0]["id"] == "s1"


# ── XLSX reading tests (mocked) ────────────────────────────────────────────


class TestXlsxReader:
    def test_read_xlsx_mocked(self):
        """Test that read_xlsx calls pandas correctly and returns CSV."""
        mock_df = MagicMock()
        mock_df.to_csv.return_value = "name,age\nAlice,30\n"

        with patch("pandas.read_excel", return_value=mock_df) as mock_read:
            result = read_xlsx(b"fake xlsx bytes")
            assert "name,age" in result
            mock_read.assert_called_once()


# ── Document ingestion tests ───────────────────────────────────────────────


class TestDocumentIngestor:
    @pytest.mark.asyncio
    async def test_text_document_creates_object(self):
        from ingestion.document_ingestor import ingest_document
        from ingestion.document_parser import ParsedDocument

        store = MemoryStore()
        registry = OntologyRegistry()

        parsed = ParsedDocument(
            text_blocks=["This is a test document about technology."],
            metadata={"title": "Test Doc"},
        )

        result = await ingest_document(parsed, "test.pdf", registry, store, source_id="s1")
        assert result.type_name == "Document"
        assert result.objects_created == 1

        docs = store.list_objects(type_filter="Document")
        assert len(docs) == 1
        assert docs[0].properties["name"] == "Test Doc"

    @pytest.mark.asyncio
    async def test_table_document_routes_to_csv(self):
        from ingestion.document_ingestor import ingest_document
        from ingestion.document_parser import ParsedDocument

        store = MemoryStore()
        registry = OntologyRegistry()

        parsed = ParsedDocument(
            tables=[[
                {"name": "Alice", "age": "30"},
                {"name": "Bob", "age": "25"},
            ]],
            text_blocks=[],
        )

        result = await ingest_document(parsed, "data.pdf", registry, store, source_id="s2")
        assert result.objects_created == 2
        assert result.errors == []

    @pytest.mark.asyncio
    async def test_mentions_linking(self):
        from ingestion.document_ingestor import ingest_document
        from ingestion.document_parser import ParsedDocument

        store = MemoryStore()
        registry = OntologyRegistry()

        # Pre-populate store with an entity
        store.add_object(ObjectInstance(
            rid="company--abc", type="Company", properties={"name": "Acme Corp"}
        ))

        parsed = ParsedDocument(
            text_blocks=["We partnered with Acme Corp on this project."],
            metadata={"title": "Partnership Doc"},
        )

        result = await ingest_document(parsed, "partner.pdf", registry, store, source_id="s3")
        assert result.links_created >= 1

        links = store.list_links(link_type="MENTIONS")
        assert len(links) >= 1


# ── RID generation tests ───────────────────────────────────────────────────


class TestGenerateRid:
    def test_stix_format(self):
        schema = SchemaDetection(
            filename="test.csv",
            row_count=1,
            columns=[],
            suggested_type_name="Contact",
            suggested_primary_key="id",
            suggested_title_property="name",
        )
        rid = generate_rid("Contact", {"id": "123", "name": "Alice"}, schema)
        assert rid.startswith("contact--")
        assert len(rid.split("--")) == 2

    def test_deterministic(self):
        schema = SchemaDetection(
            filename="test.csv",
            row_count=1,
            columns=[],
            suggested_type_name="Contact",
            suggested_primary_key="id",
        )
        rid1 = generate_rid("Contact", {"id": "123"}, schema)
        rid2 = generate_rid("Contact", {"id": "123"}, schema)
        assert rid1 == rid2


# ── Seed data loading tests ────────────────────────────────────────────────


class TestSeedDataLoading:
    def test_seed_loads_with_stix_rids(self):
        """Verify the migrated seed data loads correctly."""
        seed_path = Path(__file__).parent.parent / "data" / "seed" / "yc-seed.json"
        if not seed_path.exists():
            pytest.skip("Seed file not found")

        store = MemoryStore()
        store.load_seed(seed_path)

        objects = store.list_objects()
        assert len(objects) > 0

        # All RIDs should be STIX format
        for obj in objects:
            assert "--" in obj.rid, f"Non-STIX RID found: {obj.rid}"

        # Links should reference valid RIDs
        all_rids = {o.rid for o in objects}
        for link in store.list_links():
            assert link.source_rid in all_rids, f"Broken source_rid: {link.source_rid}"
            assert link.target_rid in all_rids, f"Broken target_rid: {link.target_rid}"


# ── Delete source tests ────────────────────────────────────────────────────


CONTACTS_CSV = """name,age,email
Alice,30,alice@test.com
Bob,25,bob@test.com"""

PRODUCTS_CSV = """name,price
Widget,9.99
Gadget,19.99"""


class TestDeleteSource:
    def test_delete_removes_objects_and_links(self):
        store = MemoryStore()
        registry = OntologyRegistry()

        schema = detect_schema(CONTACTS_CSV, "contacts.csv")
        ingest_csv(CONTACTS_CSV, schema, registry, store, source_id="src-1")
        store.add_source({"id": "src-1", "name": "contacts.csv"})

        assert len(store.list_objects()) == 2
        assert len(store.list_sources()) == 1

        result = store.delete_source("src-1")
        assert result["objects_deleted"] == 2
        assert len(store.list_objects()) == 0
        assert len(store.list_sources()) == 0

    def test_delete_preserves_other_sources(self):
        store = MemoryStore()
        registry = OntologyRegistry()

        schema1 = detect_schema(CONTACTS_CSV, "contacts.csv")
        ingest_csv(CONTACTS_CSV, schema1, registry, store, source_id="src-1")
        store.add_source({"id": "src-1", "name": "contacts.csv"})

        schema2 = detect_schema(PRODUCTS_CSV, "products.csv")
        ingest_csv(PRODUCTS_CSV, schema2, registry, store, source_id="src-2")
        store.add_source({"id": "src-2", "name": "products.csv"})

        assert len(store.list_objects()) == 4

        store.delete_source("src-1")
        remaining = store.list_objects()
        assert len(remaining) == 2
        assert all(o.source_id == "src-2" for o in remaining)
        assert len(store.list_sources()) == 1
