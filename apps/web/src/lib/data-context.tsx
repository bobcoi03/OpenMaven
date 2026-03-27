"use client";

import { createContext, useContext, useState } from "react";
import { useApiData, type ApiData } from "./use-api-data";
import { useGraphExpander } from "./use-graph-expander";
import type { Company } from "./mock-data";

interface GraphExpander {
  nodes: Array<{ id: string; label: string; type: string; color: string }>;
  edges: Array<{ id: string; source: string; target: string; label: string }>;
  expandedNodes: Set<string>;
  loadingNode: string | null;
  expandNode: (rid: string) => void;
  seedNode: (rid: string) => void;
  seedSearch: (results: Array<{ rid: string; type: string; properties: Record<string, unknown> }>) => void;
  resetGraph: () => void;
}

interface AppData extends ApiData {
  graph: GraphExpander;
  selected: Company | null;
  setSelected: (c: Company | null) => void;
}

const DataContext = createContext<AppData | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const apiData = useApiData();
  const graph = useGraphExpander();
  const [selected, setSelected] = useState<Company | null>(null);

  return (
    <DataContext value={{ ...apiData, graph, selected, setSelected }}>
      {children}
    </DataContext>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useAppData must be used within DataProvider");
  return ctx;
}
