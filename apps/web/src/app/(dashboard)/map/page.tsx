"use client";

/**
 * map/page.tsx
 *
 * Smart Maven Tactical C2 View — primary operational display.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  (left sidebar — Map Layers — in AppShell)  │
 *   │  ┌─────────────────────────────────────────┐│
 *   │  │           SATELLITE MAP                 ││
 *   │  │                                         ││
 *   │  │  [asset markers per class]              ││
 *   │  └─────────────────────────────────────────┘│
 *   └─────────────────────────────────────────────┘
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { MapView } from "@/components/map-view";
import { MAP_STYLES, type MapStyleId } from "@/components/map-view-inner";
import { SimulationControls } from "@/components/simulation-controls";
import { ContextMenu, type ContextMenuState } from "@/components/context-menu";
import { useMapLayers } from "@/lib/map-layer-context";
import { useSimulation } from "@/lib/use-simulation";
import { simAssetsToTactical } from "@/lib/sim-to-tactical";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const { visibleLayers, selectedAsset, setSelectedAsset } = useMapLayers();
  const [mapStyle, setMapStyle] = useState<MapStyleId>("dark");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [moveMode, setMoveMode] = useState<string | null>(null); // asset_id being moved
  const [moveDest, setMoveDest] = useState<{ lng: number; lat: number } | null>(null);
  // Track assets we've explicitly ordered to move (not auto-patrol)
  const [commandedMoves, setCommandedMoves] = useState<Map<string, { lng: number; lat: number }>>(new Map());

  const sim = useSimulation();

  // Keep the context's selected asset fresh with latest sim data
  const selectedId = selectedAsset?.asset_id ?? null;

  // Convert live simulation assets to the TacticalAsset format the map expects
  const tacticalAssets = useMemo(
    () => simAssetsToTactical(sim.assets),
    [sim.assets],
  );

  const visibleAssets = useMemo(
    () => tacticalAssets.filter((a) => visibleLayers.has(a.asset_class)),
    [tacticalAssets, visibleLayers],
  );

  // Remove commanded move tracking when asset arrives at destination
  useEffect(() => {
    let changed = false;
    const next = new Map(commandedMoves);
    next.forEach((_, assetId) => {
      const asset = sim.assets[assetId];
      if (!asset || asset.status !== "moving") {
        next.delete(assetId);
        changed = true;
      }
    });
    if (changed) setCommandedMoves(next);
  }, [sim.assets, commandedMoves]);

  // Compute move path line for the map:
  // 1. Preview mode: moveMode + moveDest (before confirm)
  // 2. Commanded move: asset we explicitly ordered (after confirm, while still moving)
  const movePath = useMemo(() => {
    // Preview path (move mode with a chosen destination)
    if (moveMode && moveDest) {
      const asset = sim.assets[moveMode];
      if (!asset) return null;
      return {
        from: [asset.position.longitude, asset.position.latitude] as [number, number],
        to: [moveDest.lng, moveDest.lat] as [number, number],
      };
    }

    // Commanded move on selected asset (only moves we explicitly issued)
    if (selectedId && commandedMoves.has(selectedId)) {
      const asset = sim.assets[selectedId];
      const dest = commandedMoves.get(selectedId)!;
      if (asset) {
        return {
          from: [asset.position.longitude, asset.position.latitude] as [number, number],
          to: [dest.lng, dest.lat] as [number, number],
        };
      }
    }

    return null;
  }, [moveMode, moveDest, selectedId, commandedMoves, sim.assets]);

  // ── Context menu handlers ────────────────────────────────────────────────

  const handleContextMenu = useCallback(
    (event: {
      type: "asset" | "map";
      asset?: { asset_id: string; callsign: string; weapons: string[] };
      lngLat?: { lng: number; lat: number };
      x: number;
      y: number;
    }) => {
      setContextMenu({
        type: event.type,
        asset: event.asset,
        lngLat: event.lngLat,
        x: event.x,
        y: event.y,
      });
    },
    [],
  );

  const handleContextMenuAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      setContextMenu(null);

      if (action === "details" && payload?.assetId) {
        const simAsset = sim.assets[payload.assetId as string];
        if (simAsset) setSelectedAsset(simAsset);
      }

      if (action === "move" && payload?.assetId) {
        setMoveMode(payload.assetId as string);
      }

      if (action === "strike" && payload?.weaponId && payload?.targetId) {
        sim.strike(payload.weaponId as string, payload.targetId as string);
      }

      if (action === "move_here" && payload?.assetId && payload?.lat != null && payload?.lon != null) {
        setMoveMode(payload.assetId as string);
        setMoveDest({ lng: payload.lon as number, lat: payload.lat as number });
      }
    },
    [sim, setSelectedAsset],
  );

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (moveMode) {
        if (!moveDest) {
          // First click: preview path
          setMoveDest(lngLat);
        } else {
          // Second click or confirm: execute move
          sim.moveAsset(moveMode, moveDest.lat, moveDest.lng);
          setMoveMode(null);
          setMoveDest(null);
        }
      }
    },
    [moveMode, moveDest, sim],
  );

  const handleMovePathDrag = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      setMoveDest(lngLat);
    },
    [],
  );

  const handleConfirmMove = useCallback(() => {
    if (moveMode && moveDest) {
      sim.moveAsset(moveMode, moveDest.lat, moveDest.lng);
      setCommandedMoves((prev) => new Map(prev).set(moveMode, moveDest));
      setSelectedAsset(sim.assets[moveMode] ?? null);
      setMoveMode(null);
      setMoveDest(null);
    }
  }, [moveMode, moveDest, sim, setSelectedAsset]);

  const handleCancelMove = useCallback(() => {
    setMoveMode(null);
    setMoveDest(null);
  }, []);

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden">
      {/* ── Simulation Controls ─────────────────────────────────────── */}
      <SimulationControls
        connected={sim.connected}
        tick={sim.tick}
        speed={sim.speed}
        onSetSpeed={sim.setSpeed}
        assetCount={Object.keys(sim.assets).length}
        pendingEvents={sim.pendingEvents}
      />

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <MapView
          assets={visibleAssets}
          visibleLayers={visibleLayers}
          onAssetClick={(tacticalAsset) => {
            if (moveMode) return; // ignore clicks during move mode
            const simAsset = sim.assets[tacticalAsset.asset_id];
            if (selectedId === tacticalAsset.asset_id) {
              setSelectedAsset(null);
            } else if (simAsset) {
              setSelectedAsset(simAsset);
            }
          }}
          selectedId={selectedId}
          mapStyle={mapStyle}
          onContextMenu={handleContextMenu}
          onMapClick={moveMode ? handleMapClick : undefined}
          movePath={movePath}
          onMovePathDrag={handleMovePathDrag}
        />

        {/* Move-mode indicator */}
        {moveMode && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-semibold"
            style={{
              background: "rgba(6,182,212,0.15)",
              border: "1px solid rgba(6,182,212,0.4)",
              color: "#22d3ee",
              backdropFilter: "blur(4px)",
            }}
          >
            {moveDest ? (
              <>
                <span>
                  {moveDest.lat.toFixed(2)}, {moveDest.lng.toFixed(2)}
                </span>
                <button
                  onClick={handleConfirmMove}
                  className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 rounded hover:bg-cyan-500/30 cursor-pointer transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={handleCancelMove}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                Click map to set destination
                <button
                  onClick={handleCancelMove}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer ml-1"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}

        {/* Asset count HUD */}
        <div className="absolute top-2 left-2 z-20 flex gap-1.5">
          {(["Military", "Infrastructure", "Logistics"] as const).map((cls) => {
            const count = visibleAssets.filter((a) => a.asset_class === cls).length;
            const color =
              cls === "Military" ? "#00d4ff" :
              cls === "Infrastructure" ? "#f59e0b" : "#94a3b8";
            if (!visibleLayers.has(cls)) return null;
            return (
              <div
                key={cls}
                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-semibold font-mono"
                style={{
                  background: "rgba(8,13,24,0.85)",
                  border: `1px solid ${color}40`,
                  color,
                  backdropFilter: "blur(4px)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: color }}
                />
                {count.toLocaleString()}
              </div>
            );
          })}
        </div>

        {/* Top-right HUD: map style toggle */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          <div
            className="flex rounded overflow-hidden text-[9px] font-semibold"
            style={{ background: "rgba(8,13,24,0.85)", border: "1px solid #27272a", backdropFilter: "blur(4px)" }}
          >
            {MAP_STYLES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMapStyle(id)}
                className={`px-2.5 py-1 cursor-pointer transition-colors ${
                  mapStyle === id
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <ContextMenu
            state={contextMenu}
            selectedAssetId={selectedId}
            onAction={handleContextMenuAction}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
  );
}
