/**
 * Typed fetch wrapper for the OpenMaven API.
 * All requests go through Next.js rewrites → FastAPI backend.
 */

import type {
  ObjectInstance,
  ObjectTypeDefinition,
  LinkTypeDefinition,
  LinkedObject,
  GraphData,
} from "./api-types";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API error: ${response.statusText}`);
  }
  return response.json();
}

// ── Ontology ───────────────────────────────────────────────────────────────

export function fetchObjectTypes(): Promise<ObjectTypeDefinition[]> {
  return get("/api/ontology/object-types");
}

export function fetchLinkTypes(): Promise<LinkTypeDefinition[]> {
  return get("/api/ontology/link-types");
}

// ── Objects ────────────────────────────────────────────────────────────────

export function fetchObjects(type?: string): Promise<ObjectInstance[]> {
  const params = type ? `?type=${encodeURIComponent(type)}` : "";
  return get(`/api/objects${params}`);
}

export function fetchObject(rid: string): Promise<ObjectInstance> {
  return get(`/api/objects/${encodeURIComponent(rid)}`);
}

export function fetchObjectLinks(rid: string): Promise<LinkedObject[]> {
  return get(`/api/objects/${encodeURIComponent(rid)}/links`);
}

// ── Graph ──────────────────────────────────────────────────────────────────

export function fetchGraph(types?: string[]): Promise<GraphData> {
  const params = types ? `?types=${types.join(",")}` : "";
  return get(`/api/graph${params}`);
}

export function fetchNeighbors(rid: string): Promise<GraphData> {
  return get(`/api/graph/neighbors/${encodeURIComponent(rid)}`);
}

// ── Search ─────────────────────────────────────────────────────────────────

export function searchObjects(query: string, type?: string): Promise<ObjectInstance[]> {
  const params = new URLSearchParams({ q: query });
  if (type) params.set("type", type);
  return get(`/api/search?${params}`);
}

// ── Ingestion ──────────────────────────────────────────────────────────────

export interface IngestionResult {
  source_id: string;
  type_name: string;
  objects_created: number;
  links_created: number;
  errors: string[];
}

export interface SchemaDetection {
  filename: string;
  row_count: number;
  columns: Array<{
    name: string;
    original_header: string;
    inferred_type: string;
    sample_values: unknown[];
    null_count: number;
    unique_count: number;
  }>;
  suggested_type_name: string;
  suggested_primary_key: string;
  suggested_title_property: string | null;
}

export interface SourceRecord {
  id: string;
  name: string;
  filename: string;
  type_name: string;
  row_count: number;
  ingested_at: string;
  status: string;
}

export async function uploadFile(file: File): Promise<IngestionResult> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/ingest/upload", { method: "POST", body: form });
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

export async function ingestUrl(url: string): Promise<IngestionResult> {
  const response = await fetch("/api/ingest/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

export async function detectSchema(file: File): Promise<SchemaDetection> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/ingest/detect", { method: "POST", body: form });
  if (!response.ok) {
    throw new ApiError(response.status, `Schema detection failed: ${response.statusText}`);
  }
  return response.json();
}

export function fetchSources(): Promise<SourceRecord[]> {
  return get("/api/sources");
}

export async function deleteSource(sourceId: string): Promise<{ objects_deleted: number; links_deleted: number }> {
  const response = await fetch(`/api/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });
  if (!response.ok) {
    throw new ApiError(response.status, `Delete failed: ${response.statusText}`);
  }
  return response.json();
}

// ── AI Query ────────────────────────────────────────────────────────────────

export interface QueryResult {
  answer: string;
  sources: Array<{ rid: string; name: string; type: string }>;
}

export async function queryKnowledgeGraph(question: string): Promise<QueryResult> {
  const response = await fetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ApiError(response.status, detail);
  }
  return response.json();
}

export interface StrikePlanLine {
  from: [number, number];
  to: [number, number];
  shooter_id: string;
  target_id: string;
  shooter_callsign: string;
  target_callsign: string;
  weapon_id: string;
  kill_prob_pct: number;
}

export type QueryStreamEvent =
  | { type: "status"; message: string; step?: number }
  | { type: "tool_call"; name: string; args: Record<string, unknown>; step: number }
  | { type: "tool_result"; name: string; ok: boolean; preview: string; step: number }
  | { type: "text_delta"; content: string }
  | { type: "thinking_delta"; content: string }
  | { type: "strike_plan"; lines: StrikePlanLine[]; total_targets: number; targets_engaged: number }
  | { type: "final"; answer: string; sources: Array<{ rid: string; name: string; type: string }> }
  | { type: "error"; message: string };

export type QueryChatMessage = { role: "user" | "assistant"; content: string };

export async function querySimulationStream(
  question: string,
  messages: QueryChatMessage[],
  onEvent: (event: QueryStreamEvent) => void,
  model?: string,
): Promise<void> {
  return _streamQuery("/api/sim-query/stream", question, messages, onEvent, model);
}

export async function queryKnowledgeGraphStream(
  question: string,
  messages: QueryChatMessage[],
  onEvent: (event: QueryStreamEvent) => void,
): Promise<void> {
  return _streamQuery("/api/query/stream", question, messages, onEvent);
}

async function _streamQuery(
  url: string,
  question: string,
  messages: QueryChatMessage[],
  onEvent: (event: QueryStreamEvent) => void,
  model?: string,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    },
    body: JSON.stringify({ question, messages, ...(model ? { model } : {}) }),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new ApiError(response.status, detail || "Failed to stream query");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let splitIdx = buffer.indexOf("\n\n");
    while (splitIdx !== -1) {
      const rawEvent = buffer.slice(0, splitIdx);
      buffer = buffer.slice(splitIdx + 2);

      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (dataLines.length > 0) {
        const rawData = dataLines.join("\n");
        try {
          const parsed = JSON.parse(rawData) as QueryStreamEvent;
          onEvent(parsed);
        } catch {
          onEvent({ type: "error", message: "Failed to parse query stream event." });
        }
      }

      splitIdx = buffer.indexOf("\n\n");
    }
  }
}
