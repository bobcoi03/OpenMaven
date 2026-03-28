/**
 * React hook: fetches all data from the API and adapts it to UI shapes.
 * Falls back to mock data if the API is unreachable.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchObjects, fetchGraph, fetchObjectTypes } from "./api-client";
import type { ObjectInstance, GraphData, ObjectTypeDefinition } from "./api-types";
import { objectToCompany, enrichCompanies } from "./data-adapters";
import type { Company } from "./mock-data";

export interface ApiData {
  companies: Company[];
  industries: string[];
  batches: string[];
  graphNodes: Array<{ id: string; label: string; type: string; color: string }>;
  graphEdges: Array<{ id: string; source: string; target: string; label: string }>;
  entityCounts: Array<{ type: string; count: number; color: string; icon: string }>;
  allObjects: ObjectInstance[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const NODE_COLORS: Record<string, string> = {
  company: "#147EB3",
  founder: "#9D3F9D",
  industry: "#D1980B",
  batch: "#00A396",
  location: "#D33D17",
};

const FALLBACK_COLORS = [
  "#147EB3", "#9D3F9D", "#D1980B", "#00A396", "#D33D17",
  "#2D72D2", "#94A3B8", "#DB2C6F", "#C87619", "#238551",
];

export function useApiData(): ApiData {
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<ApiData>({
    companies: [],
    industries: [],
    batches: [],
    graphNodes: [],
    graphEdges: [],
    entityCounts: [],
    allObjects: [],
    loading: true,
    error: null,
    refresh: () => {},
  });

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [allObjects, graphData, objectTypes] = await Promise.all([
          fetchObjects(),
          fetchGraph(),
          fetchObjectTypes(),
        ]);

        if (cancelled) return;

        const { companies, industries, batches } = buildUiData(allObjects, graphData);
        const entityCounts = buildEntityCounts(allObjects, objectTypes);

        const graphNodes = graphData.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          type: n.type,
          color: NODE_COLORS[n.type] ?? "#a1a1aa",
        }));

        const graphEdges = graphData.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
        }));

        setData({
          companies,
          industries,
          batches,
          graphNodes,
          graphEdges,
          entityCounts,
          allObjects,
          loading: false,
          error: null,
          refresh,
        });
      } catch (err) {
        if (cancelled) return;
        console.warn("API unavailable, using mock data:", err);
        setData((prev) => ({ ...prev, loading: false, error: String(err), refresh }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey, refresh]);

  return { ...data, refresh };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildUiData(
  allObjects: ObjectInstance[],
  graphData: GraphData,
) {
  const companyObjects = allObjects.filter((o) => o.type === "Company");
  const rawCompanies = companyObjects.map(objectToCompany);

  const links = graphData.edges.map((e) => ({
    source_rid: e.source,
    target_rid: e.target,
    link_type: e.label,
  }));

  const companies = enrichCompanies(rawCompanies, allObjects, links);

  const industries = allObjects
    .filter((o) => o.type === "Industry")
    .map((o) => o.properties.name as string)
    .sort();

  const batches = allObjects
    .filter((o) => o.type === "Batch")
    .map((o) => o.properties.name as string)
    .sort();

  return { companies, industries, batches };
}

function buildEntityCounts(
  allObjects: ObjectInstance[],
  objectTypes: ObjectTypeDefinition[],
): Array<{ type: string; count: number; color: string; icon: string }> {
  // Count objects per type
  const counts = new Map<string, number>();
  for (const obj of allObjects) {
    counts.set(obj.type, (counts.get(obj.type) || 0) + 1);
  }

  // Build color/icon map from object type definitions
  const typeInfo = new Map<string, { color: string; icon: string }>();
  for (const t of objectTypes) {
    typeInfo.set(t.name, { color: t.color, icon: t.icon });
  }

  let colorIdx = 0;
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([typeName, count]) => {
      const info = typeInfo.get(typeName);
      const color = info?.color || FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length];
      const icon = info?.icon || "Circle";
      return {
        type: pluralize(typeName),
        count,
        color,
        icon,
      };
    });
}

function pluralize(name: string): string {
  if (name.endsWith("y") && !/[aeiou]y$/i.test(name)) {
    return name.slice(0, -1) + "ies";
  }
  if (name.endsWith("s") || name.endsWith("x") || name.endsWith("ch") || name.endsWith("sh")) {
    return name + "es";
  }
  return name + "s";
}
