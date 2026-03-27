"""Graphiti client singleton — disabled when API keys are missing."""

import logging
import os

logger = logging.getLogger(__name__)

_graphiti_instance = None
_initialized = False


def get_graphiti():
    """Return the Graphiti client, or None if not configured."""
    global _graphiti_instance, _initialized

    if _initialized:
        return _graphiti_instance

    _initialized = True
    _graphiti_instance = _try_build_client()
    return _graphiti_instance


def _try_build_client():
    """Attempt to build a Graphiti client from environment variables."""
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    neo4j_uri = os.environ.get("NEO4J_URI")

    if not anthropic_key:
        logger.info("ANTHROPIC_API_KEY not set — Graphiti KG extraction disabled")
        return None

    if not openai_key:
        logger.info("OPENAI_API_KEY not set — Graphiti KG extraction disabled (needed for embeddings)")
        return None

    if not neo4j_uri:
        logger.info("NEO4J_URI not set — Graphiti KG extraction disabled (requires Neo4j)")
        return None

    try:
        from graphiti_core import Graphiti
        from graphiti_core.llm_client.anthropic_client import AnthropicClient
        from graphiti_core.llm_client.config import LLMConfig
        from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

        llm_client = AnthropicClient(
            config=LLMConfig(
                api_key=anthropic_key,
                model="claude-haiku-4-5-20241022",
                small_model="claude-haiku-4-5-20241022",
                temperature=1.0,
            )
        )

        embedder = OpenAIEmbedder(
            config=OpenAIEmbedderConfig(
                api_key=openai_key,
                embedding_model="text-embedding-3-small",
            )
        )

        neo4j_user = os.environ.get("NEO4J_USER", "neo4j")
        neo4j_password = os.environ.get("NEO4J_PASSWORD", "openmaven")

        client = Graphiti(
            uri=neo4j_uri,
            user=neo4j_user,
            password=neo4j_password,
            llm_client=llm_client,
            embedder=embedder,
        )

        logger.info("Graphiti KG client initialized (Neo4j: %s)", neo4j_uri)
        return client

    except Exception:
        logger.exception("Failed to initialize Graphiti client")
        return None
