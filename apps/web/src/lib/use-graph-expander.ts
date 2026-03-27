"use client";

import { useState, useCallback, useRef } from "react";
import { fetchNeighbors, fetchObject } from "./api-client";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  color: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

const TYPE_COLORS: Record<string, string> = {
  company: "#06b6d4",
  founder: "#a78bfa",
  industry: "#f59e0b",
  batch: "#10b981",
  location: "#f87171",
};

const FALLBACK_COLORS = [
  "#38bdf8", "#94a3b8", "#e879f9", "#fb923c", "#34d399",
];

let colorIdx = 0;
function colorFor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] ?? FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length];
}

function titleFromProperties(props: Record<string, unknown>): string {
  return (props.name ?? props.title ?? props.label ?? "Untitled") as string;
}

export function useGraphExpander() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadingNode, setLoadingNode] = useState<string | null>(null);
  const expandedRef = useRef(expandedNodes);
  expandedRef.current = expandedNodes;

  const resetGraph = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setExpandedNodes(new Set());
    setLoadingNode(null);
  }, []);

  const seedNode = useCallback(async (rid: string) => {
    // Check if node already exists
    setNodes((prev) => {
      if (prev.some((n) => n.id === rid)) return prev;
      return prev; // will be added after fetch
    });

    try {
      const obj = await fetchObject(rid);
      const node: GraphNode = {
        id: obj.rid,
        label: titleFromProperties(obj.properties),
        type: obj.type,
        color: colorFor(obj.type),
      };
      setNodes((prev) => {
        if (prev.some((n) => n.id === rid)) return prev;
        return [...prev, node];
      });
    } catch {
      // If fetch fails, try to add with rid as label
      setNodes((prev) => {
        if (prev.some((n) => n.id === rid)) return prev;
        return [...prev, { id: rid, label: rid, type: "unknown", color: "#a1a1aa" }];
      });
    }
  }, []);

  const seedSearch = useCallback((results: Array<{ rid: string; type: string; properties: Record<string, unknown> }>) => {
    const newNodes: GraphNode[] = results.map((r) => ({
      id: r.rid,
      label: titleFromProperties(r.properties),
      type: r.type,
      color: colorFor(r.type),
    }));

    setNodes((prev) => {
      const existing = new Set(prev.map((n) => n.id));
      return [...prev, ...newNodes.filter((n) => !existing.has(n.id))];
    });
  }, []);

  const expandNode = useCallback(async (rid: string) => {
    if (expandedRef.current.has(rid)) return;

    setLoadingNode(rid);
    try {
      const data = await fetchNeighbors(rid);

      const newNodes: GraphNode[] = data.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        color: colorFor(n.type),
      }));

      const newEdges: GraphEdge[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
      }));

      setNodes((prev) => {
        const existing = new Set(prev.map((n) => n.id));
        return [...prev, ...newNodes.filter((n) => !existing.has(n.id))];
      });

      setEdges((prev) => {
        const existing = new Set(prev.map((e) => e.id));
        return [...prev, ...newEdges.filter((e) => !existing.has(e.id))];
      });

      setExpandedNodes((prev) => new Set(prev).add(rid));
    } finally {
      setLoadingNode(null);
    }
  }, []);

  return { nodes, edges, expandedNodes, loadingNode, expandNode, resetGraph, seedNode, seedSearch };
}
