/**
 * TypeScript types matching the API response shapes.
 * These mirror the Python Pydantic models served by the backend.
 */

// ── Ontology Schema Types ──────────────────────────────────────────────────

export interface PropertyDefinition {
  name: string;
  type: string;
  display_name: string;
  required: boolean;
  description: string;
  enum_values: string[];
}

export interface ObjectTypeDefinition {
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  properties: PropertyDefinition[];
  primary_key: string;
  title_property: string;
}

export interface LinkTypeDefinition {
  name: string;
  display_name: string;
  source_type: string;
  target_type: string;
  cardinality: string;
  description: string;
}

// ── Object Instance Types ──────────────────────────────────────────────────

export interface ObjectInstance {
  rid: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface LinkedObject {
  link_type: string;
  direction: "outgoing" | "incoming";
  object: ObjectInstance;
}

// ── Graph Types ────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
