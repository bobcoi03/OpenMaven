"use client";

import { useState } from "react";
import { TableView } from "@/components/table-view";
import { EntityDetailPanel } from "@/components/entity-detail-panel";
import { useAppData } from "@/lib/data-context";

export default function TablePage() {
  const { allObjects, graph } = useAppData();
  const [selectedRid, setSelectedRid] = useState<string | null>(null);

  function handleNavigate(rid: string) {
    setSelectedRid(rid);
  }

  function handleExpandInGraph(rid: string) {
    graph.seedNode(rid);
    graph.expandNode(rid);
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 min-w-0">
        <TableView
          objects={allObjects}
          onRowClick={setSelectedRid}
          selectedId={selectedRid}
        />
      </div>
      {selectedRid && (
        <EntityDetailPanel
          rid={selectedRid}
          onClose={() => setSelectedRid(null)}
          onNavigate={handleNavigate}
          onExpandInGraph={handleExpandInGraph}
        />
      )}
    </div>
  );
}
