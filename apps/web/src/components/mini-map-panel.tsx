"use client";

/**
 * mini-map-panel.tsx
 *
 * Pop-out panel rendering a second non-interactive MapView instance
 * at reduced scale for theater-level overview.
 */

import { useState } from "react";
import { MapView } from "@/components/map-view";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";

interface MiniMapPanelProps {
  assets: TacticalAsset[];
  visibleLayers: Set<AssetClass>;
}

export function MiniMapPanel({ assets, visibleLayers }: MiniMapPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Toggle button — sits in the top-right HUD toolbar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-2.5 py-1 rounded-sm text-[9px] font-semibold cursor-pointer transition-colors ${
          open
            ? "bg-[var(--om-blue)]/20 text-[var(--om-blue-light)]"
            : "text-[var(--om-text-muted)] hover:text-[var(--om-text-secondary)]"
        }`}
        style={{
          background: open ? undefined : "rgba(30,34,41,0.85)",
          border: `1px solid ${open ? "rgba(45,114,210,0.4)" : "var(--om-border)"}`,
          backdropFilter: "blur(4px)",
        }}
      >
        MINIMAP
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute top-10 right-2 z-30 overflow-hidden rounded-sm shadow-2xl"
          style={{
            width: 260,
            height: 180,
            border: "1px solid var(--om-border)",
            background: "var(--om-bg-deep)",
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 z-10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-widest"
            style={{
              background: "rgba(13,17,23,0.8)",
              borderBottom: "1px solid var(--om-border)",
              color: "var(--om-text-muted)",
              backdropFilter: "blur(4px)",
            }}
          >
            Theater Overview
          </div>
          <div className="w-full h-full pt-4">
            <MapView
              assets={assets}
              visibleLayers={visibleLayers}
              mapStyle="dark"
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </>
  );
}
