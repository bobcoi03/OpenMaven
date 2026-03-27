"use client";

import { useState } from "react";
import { MapView } from "@/components/map-view";
import { EntityDetailPanel } from "@/components/entity-detail-panel";
import { useAppData } from "@/lib/data-context";
import type { Company } from "@/lib/mock-data";

export default function MapPage() {
  const { companies, graph } = useAppData();
  const [selectedRid, setSelectedRid] = useState<string | null>(null);

  function handleMarkerClick(company: Company) {
    setSelectedRid(company.id);
  }

  function handleNavigate(rid: string) {
    setSelectedRid(rid);
  }

  function handleExpandInGraph(rid: string) {
    graph.seedNode(rid);
    graph.expandNode(rid);
  }

  return (
    <div className="flex-1 flex relative overflow-hidden">
      <div className="flex-1 relative">
        <MapView
          onMarkerClick={handleMarkerClick}
          selectedId={selectedRid}
          style="satellite"
          companies={companies}
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
