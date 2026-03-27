"""Registry — holds registered types and validates instances against them."""

from ontology.types import (
    ActionTypeDefinition,
    LinkInstance,
    LinkTypeDefinition,
    ObjectInstance,
    ObjectTypeDefinition,
    PropertyType,
)


class OntologyRegistry:
    """Central registry of all ontology type definitions."""

    def __init__(self) -> None:
        self._object_types: dict[str, ObjectTypeDefinition] = {}
        self._link_types: dict[str, LinkTypeDefinition] = {}
        self._action_types: dict[str, ActionTypeDefinition] = {}

    # ── Registration ────────────────────────────────────────────────────────

    def register_object_type(self, obj_type: ObjectTypeDefinition) -> None:
        self._object_types[obj_type.name] = obj_type

    def register_link_type(self, link_type: LinkTypeDefinition) -> None:
        self._link_types[link_type.name] = link_type

    def register_action_type(self, action_type: ActionTypeDefinition) -> None:
        self._action_types[action_type.name] = action_type

    # ── Lookup ──────────────────────────────────────────────────────────────

    def get_object_type(self, name: str) -> ObjectTypeDefinition | None:
        return self._object_types.get(name)

    def get_link_type(self, name: str) -> LinkTypeDefinition | None:
        return self._link_types.get(name)

    def list_object_types(self) -> list[ObjectTypeDefinition]:
        return list(self._object_types.values())

    def list_link_types(self) -> list[LinkTypeDefinition]:
        return list(self._link_types.values())

    def list_action_types(self) -> list[ActionTypeDefinition]:
        return list(self._action_types.values())

    # ── Validation ──────────────────────────────────────────────────────────

    def validate_object(self, instance: ObjectInstance) -> list[str]:
        """Return a list of validation errors (empty = valid)."""
        obj_type = self._object_types.get(instance.type)
        if obj_type is None:
            return [f"Unknown object type: {instance.type}"]

        errors: list[str] = []
        prop_defs = {p.name: p for p in obj_type.properties}

        for prop_def in obj_type.properties:
            if prop_def.required and prop_def.name not in instance.properties:
                errors.append(f"Missing required property: {prop_def.name}")

        for key, value in instance.properties.items():
            if key not in prop_defs:
                errors.append(f"Unknown property: {key}")
                continue
            type_error = _check_type(value, prop_defs[key].type)
            if type_error:
                errors.append(f"Property '{key}': {type_error}")

        return errors

    def validate_link(self, link: LinkInstance) -> list[str]:
        """Return a list of validation errors (empty = valid)."""
        link_type = self._link_types.get(link.link_type)
        if link_type is None:
            return [f"Unknown link type: {link.link_type}"]
        return []


def _check_type(value: object, expected: PropertyType) -> str | None:
    """Check a property value matches its declared type."""
    checks: dict[PropertyType, type | tuple[type, ...]] = {
        PropertyType.STRING: str,
        PropertyType.NUMBER: (int, float),
        PropertyType.BOOLEAN: bool,
        PropertyType.DATE: str,
        PropertyType.URL: str,
        PropertyType.GEOPOINT: dict,
        PropertyType.ENUM: str,
        PropertyType.LIST_STRING: list,
    }
    expected_type = checks.get(expected)
    if expected_type and not isinstance(value, expected_type):
        return f"expected {expected.value}, got {type(value).__name__}"
    return None
