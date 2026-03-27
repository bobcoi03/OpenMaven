"use client";

import dynamic from "next/dynamic";

interface GraphViewProps {
  onNodeClick?: (nodeId: string) => void;
  onNodeExpand?: (nodeId: string) => void;
  expandedNodes?: Set<string>;
  loadingNode?: string | null;
  selectedId?: string | null;
  className?: string;
  compact?: boolean;
  graphNodes?: Array<{ id: string; label: string; type: string; color: string }>;
  graphEdges?: Array<{ id: string; source: string; target: string; label: string }>;
}

const GraphViewInner = dynamic(() => import("./graph-view-inner").then((m) => m.GraphViewInner), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#09090b] text-zinc-600 text-xs">
      Loading graph...
    </div>
  ),
});

export function GraphView(props: GraphViewProps) {
  return <GraphViewInner {...props} />;
}
