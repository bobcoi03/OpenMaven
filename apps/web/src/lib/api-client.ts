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
