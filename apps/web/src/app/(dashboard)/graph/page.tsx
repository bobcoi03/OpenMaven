"use client";

import { useState } from "react";
import { GraphView } from "@/components/graph-view";
import { EntityDetailPanel } from "@/components/entity-detail-panel";
import { useAppData } from "@/lib/data-context";
import {
  Table,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";

export default function GraphPage() {
  const { graph } = useAppData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRid, setSelectedRid] = useState<string | null>(null);

  const isEmpty = graph.nodes.length === 0;

  function handleNodeClick(nodeId: string) {
    setSelectedRid(nodeId);
  }

  function handleNavigate(rid: string) {
    graph.seedNode(rid);
    setSelectedRid(rid);
  }

  function handleExpandInGraph(rid: string) {
    graph.expandNode(rid);
  }

  return (
    <>
      <div className="flex-1 flex relative overflow-hidden">
        {/* Graph canvas */}
        <div className="flex-1 relative">
          {isEmpty ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[var(--om-bg-elevated)] flex items-center justify-center">
                <Search size={20} className="text-[var(--om-text-muted)]" />
              </div>
              <div className="text-center">
                <p className="text-[13px] text-[var(--om-text-secondary)] font-medium">
                  Search to begin investigating
                </p>
                <p className="text-[11px] text-[var(--om-text-muted)] mt-1">
                  Use the search bar above to find entities. Click to inspect, right-click to expand.
                </p>
              </div>
            </div>
          ) : (
            <GraphView
              onNodeClick={handleNodeClick}
              onNodeExpand={graph.expandNode}
              expandedNodes={graph.expandedNodes}
              loadingNode={graph.loadingNode}
              selectedId={selectedRid}
              graphNodes={graph.nodes}
              graphEdges={graph.edges}
            />
          )}
        </div>

        {/* Entity detail panel */}
        {selectedRid && (
          <EntityDetailPanel
            rid={selectedRid}
            onClose={() => setSelectedRid(null)}
            onNavigate={handleNavigate}
            onExpandInGraph={handleExpandInGraph}
          />
        )}
      </div>

      {/* Bottom Drawer */}
      <div
        className={`bg-[var(--om-bg-deep)] border-t border-[var(--om-border)] transition-all duration-200 ${
          drawerOpen ? "h-56" : "h-7"
        }`}
      >
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="flex items-center gap-2 w-full px-3 h-7 text-[10px] text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)]/30 cursor-pointer"
        >
          <Table size={11} />
          <span className="font-semibold uppercase tracking-[0.1em]">Data Table</span>
          <span className="text-[var(--om-text-muted)] font-[family-name:var(--font-mono)]">
            {graph.nodes.length} entities
          </span>
          <div className="ml-auto">
            {drawerOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </div>
        </button>
        {drawerOpen && (
          <div className="overflow-auto h-[calc(100%-28px)]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[var(--om-bg-deep)]">
                <tr className="border-b border-[var(--om-border)]">
                  <th className="text-left px-3 py-1.5 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">Name</th>
                  <th className="text-left px-3 py-1.5 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em]">Type</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((n) => (
                  <tr
                    key={n.id}
                    onClick={() => setSelectedRid(n.id)}
                    className={`border-b border-[var(--om-border)]/50 cursor-pointer transition-colors ${
                      selectedRid === n.id
                        ? "bg-[var(--om-blue)]/10"
                        : "hover:bg-[var(--om-bg-hover)]/30"
                    }`}
                  >
                    <td className="px-3 py-1.5 text-[var(--om-text-primary)] font-medium">{n.label}</td>
                    <td className="px-3 py-1.5 text-[var(--om-text-secondary)]">{n.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
