"use client";

/**
 * map/page.tsx
 *
 * Smart Maven Tactical C2 View — primary operational display.
 * Logic is delegated to hooks; this file is layout + wiring.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { MapView } from "@/components/map-view";
import { MAP_STYLES, type MapStyleId } from "@/components/map-view-inner";
import { SimulationControls } from "@/components/simulation-controls";
import { ContextMenu } from "@/components/context-menu";
import { useMapLayers } from "@/lib/map-layer-context";
import { useSimulation } from "@/lib/use-simulation";
import { useMapMove } from "@/lib/use-map-move";
import { useMapContextMenu } from "@/lib/use-map-context-menu";
import { useSensorRanges } from "@/lib/use-sensor-ranges";
import { simAssetsToTactical } from "@/lib/sim-to-tactical";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const { visibleLayers, selectedAsset, setSelectedAsset } = useMapLayers();
  const [mapStyle, setMapStyle] = useState<MapStyleId>("dark");
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  const sim = useSimulation();
  const selectedId = selectedAsset?.asset_id ?? null;

  // ── Derived data ────────────────────────────────────────────────────────

  const tacticalAssets = useMemo(
    () => simAssetsToTactical(sim.assets, sim.detections, sim.ghosts, sim.tick),
    [sim.assets, sim.detections, sim.ghosts, sim.tick],
  );

  const visibleAssets = useMemo(
    () => tacticalAssets.filter((a) => visibleLayers.has(a.asset_class)),
    [tacticalAssets, visibleLayers],
  );

  const sensorRanges = useSensorRanges(sim.assets);

  // ── Hooks ───────────────────────────────────────────────────────────────

  const move = useMapMove({
    assets: sim.assets,
    selectedId,
    moveAsset: sim.moveAsset,
    onSelectAsset: setSelectedAsset,
  });

  const ctx = useMapContextMenu({
    assets: sim.assets,
    onSelectAsset: setSelectedAsset,
    onStartMove: move.startMove,
    onStartMoveHere: move.startMoveHere,
    onStrike: sim.strike,
  });

  // ── Help tooltip click-outside ──────────────────────────────────────────

  useEffect(() => {
    if (!helpOpen) return;
    const handler = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [helpOpen]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col bg-[var(--om-bg-deep)] overflow-hidden">
      <SimulationControls
        connected={sim.connected}
        tick={sim.tick}
        speed={sim.speed}
        onSetSpeed={sim.setSpeed}
        assetCount={Object.keys(sim.assets).length}
        pendingEvents={sim.pendingEvents}
      />

      <div className="flex-1 relative min-h-0">
        <MapView
          assets={visibleAssets}
          visibleLayers={visibleLayers}
          onAssetClick={(tacticalAsset) => {
            if (move.moveMode) return;
            const simAsset = sim.assets[tacticalAsset.asset_id];
            if (selectedId === tacticalAsset.asset_id) {
              setSelectedAsset(null);
            } else if (simAsset) {
              setSelectedAsset(simAsset);
            }
          }}
          selectedId={selectedId}
          mapStyle={mapStyle}
          onContextMenu={ctx.handleContextMenu}
          onMapClick={move.moveMode ? move.handleMapClick : undefined}
          movePath={move.movePath}
          onMovePathDrag={move.handleDrag}
          sensorRanges={sensorRanges}
          moveMode={move.moveMode}
        />

        {/* Move-mode indicator */}
        {move.moveMode && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(45,114,210,0.15)",
              border: "1px solid rgba(45,114,210,0.4)",
              color: "var(--om-blue-light)",
              backdropFilter: "blur(4px)",
            }}
          >
            {move.moveDest ? (
              <>
                <span>
                  {move.moveDest.lat.toFixed(2)}, {move.moveDest.lng.toFixed(2)}
                </span>
                <button
                  onClick={move.confirm}
                  className="px-2 py-0.5 bg-[var(--om-blue)]/20 border border-[var(--om-blue)]/40 rounded-sm hover:bg-[var(--om-blue)]/30 cursor-pointer transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={move.cancel}
                  className="text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                Click map to set destination
                <span className="text-[var(--om-text-muted)] text-[9px] ml-1">ESC to cancel</span>
              </>
            )}
          </div>
        )}

        {/* Asset count HUD */}
        <div className="absolute top-2 left-2 z-20 flex gap-1.5">
          {(["Military", "Infrastructure", "Logistics"] as const).map((cls) => {
            const count = visibleAssets.filter((a) => a.asset_class === cls).length;
            if (!visibleLayers.has(cls)) return null;
            return (
              <div
                key={cls}
                className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-[9px]"
                style={{
                  background: "rgba(30,34,41,0.85)",
                  border: "1px solid var(--om-border)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <span className="font-semibold text-[var(--om-text-primary)]">{count}</span>
                <span className="text-[var(--om-text-muted)]">{cls}</span>
              </div>
            );
          })}
        </div>

        {/* Top-right HUD: map style toggle + help */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          <div
            className="flex rounded-sm overflow-hidden text-[9px] font-semibold"
            style={{ background: "rgba(30,34,41,0.85)", border: "1px solid var(--om-border)", backdropFilter: "blur(4px)" }}
          >
            {MAP_STYLES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMapStyle(id)}
                className={`px-2.5 py-1 cursor-pointer transition-colors ${
                  mapStyle === id
                    ? "bg-[var(--om-blue)]/20 text-[var(--om-blue-light)]"
                    : "text-[var(--om-text-muted)] hover:text-[var(--om-text-secondary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Help tooltip */}
          <div ref={helpRef} className="relative">
            <button
              onClick={() => setHelpOpen((v) => !v)}
              className="flex items-center justify-center w-6 h-6 rounded-sm text-[10px] font-semibold cursor-pointer transition-colors text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)]"
              style={{
                background: "rgba(30,34,41,0.85)",
                border: "1px solid var(--om-border)",
                backdropFilter: "blur(4px)",
              }}
            >
              ?
            </button>
            {helpOpen && (
              <div
                className="absolute top-full right-0 mt-1 w-64 rounded-sm text-[11px] p-3 flex flex-col gap-2.5"
                style={{
                  background: "rgba(30,34,41,0.95)",
                  border: "1px solid var(--om-border)",
                  backdropFilter: "blur(4px)",
                }}
              >
                <div>
                  <div className="text-[11px] font-semibold text-[var(--om-text-primary)] mb-1">Navigation</div>
                  <div className="flex flex-col gap-0.5 text-[var(--om-text-secondary)]">
                    <div><span className="text-[var(--om-text-primary)]">Left-click + drag</span> — Pan the map</div>
                    <div><span className="text-[var(--om-text-primary)]">Right-click + drag</span> — Tilt / rotate</div>
                    <div><span className="text-[var(--om-text-primary)]">Scroll wheel</span> — Zoom in / out</div>
                  </div>
                </div>
                <div className="border-t border-[var(--om-border)]" />
                <div>
                  <div className="text-[11px] font-semibold text-[var(--om-text-primary)] mb-1">Assets</div>
                  <div className="flex flex-col gap-0.5 text-[var(--om-text-secondary)]">
                    <div><span className="text-[var(--om-text-primary)]">Left-click asset</span> — Select / deselect</div>
                    <div><span className="text-[var(--om-text-primary)]">Right-click asset</span> — Profile, move, strike</div>
                    <div><span className="text-[var(--om-text-primary)]">Right-click map</span> — Move selected asset here</div>
                  </div>
                </div>
                <div className="border-t border-[var(--om-border)]" />
                <div>
                  <div className="text-[11px] font-semibold text-[var(--om-text-primary)] mb-1">Actions</div>
                  <div className="flex flex-col gap-0.5 text-[var(--om-text-secondary)]">
                    <div><span className="text-[var(--om-text-primary)]">Move</span> — Click map to set waypoint, confirm</div>
                    <div><span className="text-[var(--om-text-primary)]">Strike</span> — Right-click asset, select weapon, fire</div>
                    <div><span className="text-[var(--om-text-primary)]">Drag waypoint</span> — Drag blue dot to adjust</div>
                  </div>
                </div>
                <div className="border-t border-[var(--om-border)]" />
                <div>
                  <div className="text-[11px] font-semibold text-[var(--om-text-primary)] mb-1">Overlays</div>
                  <div className="flex flex-col gap-0.5 text-[var(--om-text-secondary)]">
                    <div><span className="text-[var(--om-text-primary)]">Sensor rings</span> — Blue circles show detection range</div>
                    <div><span className="text-[var(--om-text-primary)]">Ghost markers</span> — Faded icons at last known position</div>
                    <div><span className="text-[var(--om-text-primary)]">Move path</span> — Dashed line shows planned route</div>
                    <div><span className="text-[var(--om-text-primary)]">Layer toggle</span> — Sidebar filters asset classes</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom-left controls guide */}
        <div className="absolute bottom-1.5 left-2 z-20 text-[8px] text-[var(--om-text-muted)] tracking-wide">
          Right-click drag: tilt{" · "}Left-click drag: pan{" · "}Scroll: zoom
        </div>

        {/* Context Menu */}
        {ctx.contextMenu && (
          <ContextMenu
            state={ctx.contextMenu}
            selectedAssetId={selectedId}
            onAction={ctx.handleAction}
            onClose={ctx.close}
          />
        )}
      </div>
    </div>
  );
}
