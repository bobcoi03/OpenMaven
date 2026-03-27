"""Tests for ontology type system and YC schema."""

from ontology.types import ObjectInstance, PropertyDefinition, PropertyType
from ontology.yc_schema import build_yc_registry


def test_registry_has_all_yc_types():
    registry = build_yc_registry()
    type_names = [t.name for t in registry.list_object_types()]
    assert set(type_names) == {"Company", "Founder", "Batch", "Industry"}


def test_registry_has_all_link_types():
    registry = build_yc_registry()
    link_names = [lt.name for lt in registry.list_link_types()]
    assert set(link_names) == {"FOUNDED_BY", "IN_BATCH", "IN_INDUSTRY", "SIMILAR_TO"}


def test_company_type_has_expected_properties():
    registry = build_yc_registry()
    company = registry.get_object_type("Company")
    assert company is not None
    prop_names = company.property_names()
    assert "name" in prop_names
    assert "status" in prop_names
    assert "coordinates" in prop_names


def test_validate_valid_company():
    registry = build_yc_registry()
    instance = ObjectInstance(
        rid="c1",
        type="Company",
        properties={
            "name": "Acme AI",
            "status": "Active",
            "employees": 12,
            "hiring": True,
            "tags": ["AI", "SaaS"],
        },
    )
    errors = registry.validate_object(instance)
    assert errors == []


def test_validate_missing_required_property():
    registry = build_yc_registry()
    instance = ObjectInstance(rid="c1", type="Company", properties={"status": "Active"})
    errors = registry.validate_object(instance)
    assert any("name" in e for e in errors)


def test_validate_wrong_type():
    registry = build_yc_registry()
    instance = ObjectInstance(
        rid="c1",
        type="Company",
        properties={"name": "Test", "employees": "not a number"},
    )
    errors = registry.validate_object(instance)
    assert any("employees" in e for e in errors)


def test_validate_unknown_object_type():
    registry = build_yc_registry()
    instance = ObjectInstance(rid="x1", type="Unknown", properties={})
    errors = registry.validate_object(instance)
    assert any("Unknown" in e for e in errors)


def test_property_display_name_auto_generated():
    prop = PropertyDefinition(name="first_name", type=PropertyType.STRING)
    assert prop.display_name == "First Name"
