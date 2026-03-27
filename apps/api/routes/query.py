"""AI query endpoint — answers questions about the knowledge graph."""

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from dependencies import store

router = APIRouter()
logger = logging.getLogger(__name__)


class QueryRequest(BaseModel):
    question: str


class SourceRef(BaseModel):
    rid: str
    name: str
    type: str


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceRef]


def _extract_keywords(question: str) -> list[str]:
    """Extract search terms from a question by removing common stop words."""
    stop_words = {
        "a", "an", "the", "is", "are", "was", "were", "what", "which", "who",
        "whom", "where", "when", "why", "how", "do", "does", "did", "have",
        "has", "had", "be", "been", "being", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "about", "into", "through", "during",
        "before", "after", "above", "below", "between", "and", "or", "not",
        "but", "if", "then", "than", "that", "this", "these", "those", "can",
        "could", "will", "would", "shall", "should", "may", "might", "must",
        "me", "my", "i", "you", "your", "we", "our", "they", "their", "it",
        "its", "all", "any", "each", "every", "some", "many", "much", "more",
        "most", "other", "another", "tell", "show", "find", "get", "list",
        "give", "know", "think", "see", "look", "make",
    }
    words = question.lower().split()
    return [w.strip("?.,!\"'") for w in words if w.strip("?.,!\"'") not in stop_words and len(w) > 1]


def _get_title(properties: dict[str, Any]) -> str:
    return str(properties.get("name") or properties.get("title") or properties.get("label") or "Untitled")


def _build_context(question: str) -> tuple[str, list[SourceRef]]:
    """Search the store and build context for the LLM."""
    keywords = _extract_keywords(question)
    seen_rids: set[str] = set()
    relevant_objects = []

    # Search with each keyword
    for keyword in keywords[:5]:
        try:
            results = store.search(query=keyword)
            for obj in results[:10]:
                if obj.rid not in seen_rids:
                    seen_rids.add(obj.rid)
                    relevant_objects.append(obj)
        except Exception:
            continue

    # Also try the full question as a search
    try:
        results = store.search(query=question[:100])
        for obj in results[:10]:
            if obj.rid not in seen_rids:
                seen_rids.add(obj.rid)
                relevant_objects.append(obj)
    except Exception:
        pass

    # Limit to top 20 most relevant
    relevant_objects = relevant_objects[:20]

    # Build context string and sources
    sources: list[SourceRef] = []
    context_parts: list[str] = []

    for obj in relevant_objects:
        title = _get_title(obj.properties)
        sources.append(SourceRef(rid=obj.rid, name=title, type=obj.type))

        # Format properties for context
        props_str = ", ".join(
            f"{k}: {v}" for k, v in obj.properties.items()
            if v is not None and str(v).strip()
        )
        context_parts.append(f"[{obj.type}] {title} ({obj.rid}): {props_str}")

        # Include links for top objects
        if len(context_parts) <= 10:
            try:
                links = store.get_links_for(obj.rid)
                for link in links[:5]:
                    target = store.get_object(link.target_rid)
                    if target:
                        target_title = _get_title(target.properties)
                        context_parts.append(
                            f"  -> {link.link_type}: {target_title} ({target.type})"
                        )
            except Exception:
                pass

    return "\n".join(context_parts), sources


@router.post("/query")
async def query_knowledge_graph(req: QueryRequest) -> QueryResponse:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured. Add it to your .env file.",
        )

    context, sources = _build_context(req.question)

    if not context:
        return QueryResponse(
            answer="I couldn't find any relevant data in the knowledge graph. Try uploading data via the Sources tab first.",
            sources=[],
        )

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20241022",
            max_tokens=1024,
            system=(
                "You are an intelligence analyst assistant for the OpenMaven investigation platform. "
                "Answer questions based ONLY on the provided knowledge graph data. "
                "Be concise and specific. Reference entity names when relevant. "
                "If the data doesn't contain enough information to fully answer, say so."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Knowledge graph data:\n{context}\n\n"
                        f"Question: {req.question}"
                    ),
                }
            ],
        )

        answer = response.content[0].text
        return QueryResponse(answer=answer, sources=sources[:8])

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="anthropic package not installed. Run: pip install anthropic",
        )
    except Exception as e:
        logger.exception("Query failed")
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")
