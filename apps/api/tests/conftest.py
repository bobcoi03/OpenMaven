"""Shared pytest fixtures for the API test suite."""

import sys
from unittest.mock import MagicMock

import pytest

# Stub optional heavy dependencies that may not be installed in the test env.
# This must happen before any module that imports them is imported.
if "graphiti_core" not in sys.modules:
    _graphiti_stub = MagicMock()
    sys.modules["graphiti_core"] = _graphiti_stub
    sys.modules["graphiti_core.nodes"] = _graphiti_stub.nodes

from dependencies import store, SEED_PATH


@pytest.fixture(autouse=True)
def ensure_seed_loaded() -> None:
    """Re-seed the in-memory store before each test if it was cleared by a previous test."""
    if not store.list_objects():
        store.load_seed(SEED_PATH)
