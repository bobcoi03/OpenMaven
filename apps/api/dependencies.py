"""Shared dependencies — singletons for the app lifecycle."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=True)

from ontology.registry import OntologyRegistry
from store.base import BaseStore

# Path to the default seed data file used by tests and the MemoryStore bootstrap.
SEED_PATH: Path = Path(__file__).parent / "data" / "seed" / "yc-seed.json"

logger = logging.getLogger(__name__)


def _build_store() -> BaseStore:
    """Create the store backend based on environment configuration."""
    neo4j_uri = os.environ.get("NEO4J_URI")

    if neo4j_uri:
        from store.neo4j_store import Neo4jStore

        user = os.environ.get("NEO4J_USER", "neo4j")
        password = os.environ.get("NEO4J_PASSWORD", "openmaven")
        logger.info("Using Neo4j store at %s", neo4j_uri)
        return Neo4jStore(uri=neo4j_uri, user=user, password=password)

    from store.memory import MemoryStore

    logger.info("Using in-memory store")
    return MemoryStore()


store = _build_store()
registry = OntologyRegistry()


def _build_graphiti():
    """Create the Graphiti client if API keys are configured."""
    from kg.client import get_graphiti

    return get_graphiti()


graphiti = _build_graphiti()


# ── Simulation singletons ────────────────────────────────────────────────────


def _build_simulation():
    """Create the simulation manager with the default scenario."""
    from simulation.scenario import load_default_scenario
    from ws.connection_manager import ConnectionManager

    mgr = load_default_scenario()
    ws_mgr = ConnectionManager()
    mgr._broadcast_fn = ws_mgr.broadcast
    return mgr, ws_mgr


sim_manager, ws_manager = _build_simulation()


# ── LLM client ───────────────────────────────────────────────────────────────

LLM_MODEL: str = os.environ.get("LLM_MODEL", "google/gemini-2.5-pro")


def get_llm_client():
    """Create an OpenAI-compatible client using OpenRouter (or direct OpenAI).

    Reads from env:
      OPENROUTER_API_KEY — preferred, uses OpenRouter as gateway
      OPENAI_API_KEY     — fallback, direct OpenAI
    """
    from openai import OpenAI

    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        return OpenAI(
            api_key=openrouter_key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "https://github.com/bobcoi03/OpenMaven",
                "X-Title": "OpenMaven",
            },
        )

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        return OpenAI(api_key=openai_key)

    return None
