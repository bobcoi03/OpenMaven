"""AI query endpoint — tool-calling agent that queries Neo4j directly.

The agent uses OpenAI function calling to:
1. Inspect the graph schema
2. Run Cypher queries against Neo4j
3. Iterate until it has enough data to answer
"""

import json
import logging
import os
from collections.abc import Generator
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from dependencies import store

router = APIRouter()
logger = logging.getLogger(__name__)

MODEL = "gpt-5.4-mini"
MAX_AGENT_STEPS = 10


# ── Request / Response ────────────────────────────────────────────────────


class QueryRequest(BaseModel):
    question: str
    messages: list["ChatMessage"] = []


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SourceRef(BaseModel):
    rid: str
    name: str
    type: str


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceRef]


# ── Tool Definitions ──────────────────────────────────────────────────────


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_schema",
            "description": (
                "Get the knowledge graph schema: node types, their counts, "
                "relationship types, and sample properties for each node type."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_cypher",
            "description": (
                "Execute a read-only Cypher query against Neo4j. "
                "All nodes have label :Object with properties: rid, type (string), "
                "and properties (JSON string with the entity's fields). "
                "Relationships have label :LINK with property link_type (string). "
                "Use n.type to filter by entity type (e.g. 'Company', 'Industry'). "
                "Properties are a JSON string — the tool parses it and returns clean results. "
                "Example: MATCH (c:Object {type: 'Company'})-[:LINK]->(b:Object {type: 'Batch'}) "
                "WHERE b.properties CONTAINS '\"W22\"' RETURN c.properties, b.properties LIMIT 10"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A read-only Cypher query.",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_entities",
            "description": (
                "Full-text search across all entities. Returns matching objects "
                "with their type, rid, and properties. Use for finding specific "
                "entities by name or keyword."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search text (name, keyword, etc.)",
                    },
                    "entity_type": {
                        "type": "string",
                        "description": "Optional: filter by type (e.g. 'Company').",
                    },
                },
                "required": ["query"],
            },
        },
    },
]

SYSTEM_PROMPT = """\
You are an analytical agent for the OpenMaven intelligence platform.
You answer questions by querying a Neo4j knowledge graph using the provided tools.

Workflow:
1. Call get_schema to understand the data model.
2. Run Cypher queries to fetch the data you need.
3. If a query returns an error, inspect it and try a corrected query.
4. Run follow-up queries if you need more data.
5. Synthesize a clear, data-backed answer.

Rules:
- Always start by calling get_schema (unless the question is trivial).
- All nodes use the :Object label. Filter by n.type (e.g. 'Company', 'Batch').
- Properties are stored as a JSON string in n.properties. Use CONTAINS for filtering.
- Relationships use the :LINK label. Filter by r.link_type (e.g. 'IN_BATCH').
- Never run write queries (CREATE, DELETE, SET, MERGE, REMOVE).
- Be concise. Reference specific entity names and numbers.
"""


# ── Tool Implementations ──────────────────────────────────────────────────


def handle_get_schema() -> str:
    """Return the graph schema as a readable string."""
    driver = _get_driver()
    if not driver:
        return json.dumps({"error": "Neo4j not connected"})

    with driver.session() as session:
        types = _query_node_types(session)
        links = _query_link_types(session)
        samples = _query_sample_properties(session, types)

    schema = {
        "node_types": types,
        "relationship_types": links,
        "sample_properties": samples,
        "notes": (
            "All nodes have label :Object. Use n.type to filter. "
            "n.properties is a JSON string. Relationships use :LINK label "
            "with r.link_type property."
        ),
    }
    return json.dumps(schema, indent=2)


def handle_run_cypher(query: str) -> str:
    """Execute a read-only Cypher query and return parsed results."""
    if _is_write_query(query):
        return json.dumps({"error": "Write queries are not allowed."})

    driver = _get_driver()
    if not driver:
        return json.dumps({"error": "Neo4j not connected"})

    try:
        with driver.session() as session:
            result = session.run(query)
            records = [_parse_record(dict(r)) for r in result]
        return json.dumps(records[:50], default=str, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


def handle_search_entities(query: str, entity_type: str | None = None) -> str:
    """Search entities by text, return top results."""
    try:
        results = store.search(query=query, type_filter=entity_type)
        items = [
            {"rid": obj.rid, "type": obj.type, "properties": obj.properties}
            for obj in results[:15]
        ]
        return json.dumps(items, default=str, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


TOOL_HANDLERS = {
    "get_schema": lambda args: handle_get_schema(),
    "run_cypher": lambda args: handle_run_cypher(args["query"]),
    "search_entities": lambda args: handle_search_entities(
        args["query"], args.get("entity_type")
    ),
}


# ── Agent Loop ────────────────────────────────────────────────────────────


@router.post("/query")
async def query_knowledge_graph(req: QueryRequest) -> QueryResponse:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY not configured. Add it to your .env file.",
        )

    try:
        base_messages = _build_base_messages(req)
        answer = _run_agent(base_messages, api_key)
        sources = _extract_sources(req.question)
        return QueryResponse(answer=answer, sources=sources)
    except Exception as e:
        logger.exception("Query agent failed")
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")


@router.post("/query/stream")
async def query_knowledge_graph_stream(req: QueryRequest) -> StreamingResponse:
    """Stream query progress and final answer as SSE events."""
    api_key = os.environ.get("OPENAI_API_KEY")

    def event_stream() -> Generator[str, None, None]:
        if not api_key:
            yield _sse_event({
                "type": "error",
                "message": "OPENAI_API_KEY not configured. Add it to your .env file.",
            })
            return

        try:
            yield _sse_event({"type": "status", "message": "Analyzing question..."})
            answer = ""
            base_messages = _build_base_messages(req)
            for event in _run_agent_stream(base_messages, api_key):
                if event.get("type") == "final_answer":
                    answer = str(event.get("answer", "No response generated."))
                    continue
                yield _sse_event(event)

            sources = [s.model_dump() for s in _extract_sources(req.question)]
            yield _sse_event({
                "type": "final",
                "answer": answer or "No response generated.",
                "sources": sources,
            })
        except Exception as e:
            logger.exception("Streaming query agent failed")
            yield _sse_event({"type": "error", "message": f"Query failed: {e}"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _run_agent(messages: list[dict], api_key: str) -> str:
    """Run the tool-calling agent loop until it produces a final answer."""
    client = OpenAI(api_key=api_key)

    for step in range(MAX_AGENT_STEPS):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )

        message = response.choices[0].message
        messages.append(message)

        if not message.tool_calls:
            return message.content or "No response generated."

        for tool_call in message.tool_calls:
            result = _execute_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    return "I ran out of steps. Try a simpler question."


def _run_agent_stream(messages: list[dict], api_key: str) -> Generator[dict, None, None]:
    """Run the tool-calling agent loop and emit progress events."""
    client = OpenAI(api_key=api_key)

    for step in range(MAX_AGENT_STEPS):
        step_num = step + 1
        yield {"type": "status", "step": step_num, "message": f"Reasoning step {step_num}..."}

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )

        message = response.choices[0].message
        messages.append(message)

        if not message.tool_calls:
            yield {
                "type": "final_answer",
                "answer": message.content or "No response generated.",
            }
            return

        for tool_call in message.tool_calls:
            try:
                args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                args = {}
            yield {
                "type": "tool_call",
                "step": step_num,
                "name": tool_call.function.name,
                "args": args,
            }

            result = _execute_tool(tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

            yield {
                "type": "tool_result",
                "step": step_num,
                "name": tool_call.function.name,
                "ok": "\"error\"" not in result.lower(),
                "preview": _preview_tool_result(result),
            }

    yield {"type": "final_answer", "answer": "I ran out of steps. Try a simpler question."}


def _execute_tool(tool_call) -> str:
    """Dispatch a tool call to its handler."""
    handler = TOOL_HANDLERS.get(tool_call.function.name)
    if not handler:
        return json.dumps({"error": f"Unknown tool: {tool_call.function.name}"})

    try:
        args = json.loads(tool_call.function.arguments)
    except json.JSONDecodeError:
        return json.dumps({"error": "Tool arguments were invalid JSON."})
    logger.info("Tool call: %s(%s)", tool_call.function.name, args)
    return handler(args)


# ── Source Extraction ─────────────────────────────────────────────────────


def _extract_sources(question: str) -> list[SourceRef]:
    """Quick keyword search to find entities to cite as sources."""
    keywords = question.lower().split()
    seen: set[str] = set()
    sources: list[SourceRef] = []

    for word in keywords[:5]:
        word = word.strip("?.,!\"'")
        if len(word) < 2:
            continue
        try:
            for obj in store.search(query=word)[:5]:
                if obj.rid in seen:
                    continue
                seen.add(obj.rid)
                name = _get_title(obj.properties)
                sources.append(SourceRef(rid=obj.rid, name=name, type=obj.type))
        except Exception:
            continue

    return sources[:8]


# ── Helpers ───────────────────────────────────────────────────────────────


def _get_driver():
    """Get the Neo4j driver from the store if available."""
    return getattr(store, "_driver", None)


def _build_base_messages(req: QueryRequest) -> list[dict]:
    """
    Build the OpenAI chat message list from request history.

    The model only has access to what we send here, so we include the full
    user/assistant conversation history from the UI (if provided), plus the
    current question as a final user message.
    """
    base: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    for m in req.messages:
        base.append({"role": m.role, "content": m.content})

    # Ensure the current question is the latest user message
    if not base or base[-1].get("role") != "user" or base[-1].get("content") != req.question:
        base.append({"role": "user", "content": req.question})

    return base


def _get_title(properties: dict) -> str:
    return str(
        properties.get("name")
        or properties.get("title")
        or properties.get("label")
        or "Untitled"
    )


def _is_write_query(query: str) -> bool:
    """Reject write operations."""
    write_words = {"CREATE", "DELETE", "SET", "MERGE", "REMOVE", "DROP", "DETACH"}
    upper = query.upper()
    return any(word in upper for word in write_words)


def _parse_record(record: dict) -> dict:
    """Parse a Neo4j record, decoding JSON property strings."""
    parsed = {}
    for key, value in record.items():
        if isinstance(value, str) and value.startswith("{"):
            try:
                parsed[key] = json.loads(value)
            except (json.JSONDecodeError, ValueError):
                parsed[key] = value
        else:
            parsed[key] = value
    return parsed


def _sse_event(payload: dict) -> str:
    return f"event: query\ndata: {json.dumps(payload, default=str)}\n\n"


def _preview_tool_result(result: str, max_len: int = 160) -> str:
    compact = " ".join(result.split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 1] + "…"


def _query_node_types(session) -> list[dict]:
    """Get node types and their counts."""
    result = session.run(
        "MATCH (n:Object) "
        "RETURN n.type AS type, COUNT(*) AS count "
        "ORDER BY count DESC"
    )
    return [{"type": r["type"], "count": r["count"]} for r in result]


def _query_link_types(session) -> list[dict]:
    """Get relationship types and their counts."""
    result = session.run(
        "MATCH (:Object)-[r:LINK]->(:Object) "
        "RETURN r.link_type AS type, COUNT(*) AS count "
        "ORDER BY count DESC"
    )
    return [{"type": r["type"], "count": r["count"]} for r in result]


def _query_sample_properties(session, types: list[dict]) -> dict:
    """Get sample property keys for each node type."""
    samples = {}
    for t in types[:8]:
        type_name = t["type"]
        result = session.run(
            "MATCH (n:Object {type: $type}) RETURN n.properties LIMIT 1",
            parameters={"type": type_name},
        )
        record = result.single()
        if not record:
            continue
        try:
            props = json.loads(record["n.properties"])
            samples[type_name] = list(props.keys())
        except (json.JSONDecodeError, TypeError):
            pass
    return samples
