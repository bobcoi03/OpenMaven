"use client";

/**
 * map/page.tsx
 *
 * Smart Maven Tactical C2 View — primary operational display.
 * Logic is delegated to hooks; this file is layout + wiring.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapView } from "@/components/map-view";
import { MAP_STYLES, type MapStyleId } from "@/components/map-view-inner";
import { SimulationControls } from "@/components/simulation-controls";
import { ContextMenu } from "@/components/context-menu";
import { StrikePairingPanel } from "@/components/strike-pairing-panel";
import { StrikeLogPanel } from "@/components/strike-log-panel";
import { useMapLayers } from "@/lib/map-layer-context";
import { useSimulation, type MissionUpdate } from "@/lib/use-simulation";
import { useMapMove } from "@/lib/use-map-move";
import { MiniMapPanel } from "@/components/mini-map-panel";
import { useMapContextMenu } from "@/lib/use-map-context-menu";
import { useSensorRanges } from "@/lib/use-sensor-ranges";
import { simAssetsToTactical } from "@/lib/sim-to-tactical";
import { findBestPairing, findAllPairings, refreshPairing, type PairingSelection } from "@/lib/strike-pairing";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const router = useRouter();
  const { visibleLayers, selectedAsset, setSelectedAsset, showHeatmap, showZoneControl } = useMapLayers();
  const searchParams = useSearchParams();
  const [mapStyle, setMapStyle] = useState<MapStyleId>("dark");

  // Read lat/lng from URL (e.g. /map?lat=33.5&lng=42.8) for fly-to on load
  const flyTo = useMemo(() => {
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng, zoom: 12 };
  }, [searchParams]);
  const [showSensorRanges, setShowSensorRanges] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const [lockedAssetId, setLockedAssetId] = useState<string | null>(null);

  const sim = useSimulation();
  const selectedId = selectedAsset?.asset_id ?? null;

  // Auto-unlock if the locked asset is destroyed
  useEffect(() => {
    if (!lockedAssetId) return;
    const asset = sim.assets[lockedAssetId];
    if (!asset || asset.status === "destroyed") setLockedAssetId(null);
  }, [lockedAssetId, sim.assets]);

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

  // ── AI strike plan visualization ──────────────────────────────────────
  const [strikePlan, setStrikePlan] = useState<
    Array<{ shooterId: string; targetId: string }> | null
  >(null);

  useEffect(() => {
    function onStrikePlan(e: Event) {
      const detail = (e as CustomEvent).detail;
      const lines = detail.lines ?? [];
      setStrikePlan(
        lines.map((l: { shooter_id: string; target_id: string }) => ({
          shooterId: l.shooter_id,
          targetId: l.target_id,
        })),
      );
    }
    window.addEventListener("openmaven:strike_plan", onStrikePlan);
    return () => window.removeEventListener("openmaven:strike_plan", onStrikePlan);
  }, []);

  // Clear plan when real missions launch
  useEffect(() => {
    if (Object.keys(sim.activeMissions).length > 0 && strikePlan) {
      setStrikePlan(null);
    }
  }, [sim.activeMissions, strikePlan]);

  // Compute planned line coordinates from LIVE asset positions
  const plannedLines = useMemo(() => {
    if (!strikePlan) return null;
    const lines: Array<{ from: [number, number]; to: [number, number] }> = [];
    for (const { shooterId, targetId } of strikePlan) {
      const shooter = sim.assets[shooterId];
      const target = sim.assets[targetId];
      if (!shooter || !target) continue;
      lines.push({
        from: [shooter.position.longitude, shooter.position.latitude],
        to: [target.position.longitude, target.position.latitude],
      });
    }
    return lines.length > 0 ? lines : null;
  }, [strikePlan, sim.assets]);

  // ── Strike pairing state ──────────────────────────────────────────────
  const [pairingSelection, setPairingSelection] = useState<PairingSelection | null>(null);
  const [noShooterMsg, setNoShooterMsg] = useState(false);
  const [missionInitialDistKm, setMissionInitialDistKm] = useState(0);

  // Recompute live telemetry from current asset positions every tick
  const activePairing = useMemo(() => {
    if (!pairingSelection) return null;
    const live = refreshPairing(pairingSelection, sim.assets);
    if (!live) {
      setPairingSelection(null);
      return null;
    }
    return live;
  }, [pairingSelection, sim.assets]);

  // All alternative pairings for the selected target
  const allPairings = useMemo(() => {
    if (!pairingSelection) return [];
    const target = sim.assets[pairingSelection.targetId];
    if (!target || target.status === "destroyed") return [];
    return findAllPairings(target, sim.assets);
  }, [pairingSelection, sim.assets]);

  const handleStrikeTarget = useCallback(
    (targetId: string) => {
      const target = sim.assets[targetId];
      if (!target || target.status === "destroyed") return;

      const pairing = findBestPairing(target, sim.assets);
      if (pairing) {
        setPairingSelection({
          shooterId: pairing.shooter.asset_id,
          weaponId: pairing.weaponId,
          targetId: pairing.target.asset_id,
        });
        setNoShooterMsg(false);
      } else {
        setNoShooterMsg(true);
        setTimeout(() => setNoShooterMsg(false), 2000);
      }
    },
    [sim.assets],
  );

  const handleSelectPairing = useCallback(
    (shooterId: string, weaponId: string) => {
      if (!pairingSelection) return;
      setPairingSelection({ shooterId, weaponId, targetId: pairingSelection.targetId });
    },
    [pairingSelection],
  );

  // Find active mission for the currently selected target
  const activeMissionForTarget = useMemo((): MissionUpdate | null => {
    if (!pairingSelection) return null;
    for (const m of Object.values(sim.activeMissions)) {
      if (m.target_id === pairingSelection.targetId) return m;
    }
    return null;
  }, [pairingSelection, sim.activeMissions]);

  // Check strike log for recently completed missions for this target
  const completedMissionForTarget = useMemo((): MissionUpdate | null => {
    if (!pairingSelection) return null;
    const recent = sim.strikeLog.find(
      (e) => e.target_id === pairingSelection.targetId && sim.tick - e.tick <= 2,
    );
    if (!recent) return null;
    return {
      mission_id: recent.mission_id,
      shooter_id: "",
      weapon_id: recent.weapon_id,
      target_id: recent.target_id,
      status: recent.status as MissionUpdate["status"],
      result: recent.result,
    };
  }, [pairingSelection, sim.strikeLog, sim.tick]);

  const missionForPanel = activeMissionForTarget ?? completedMissionForTarget;

  // Auto-dismiss panel 2s after mission completes
  useEffect(() => {
    if (!completedMissionForTarget || activeMissionForTarget) return;
    const timer = setTimeout(() => setPairingSelection(null), 2000);
    return () => clearTimeout(timer);
  }, [completedMissionForTarget, activeMissionForTarget]);

  const handleConfirmStrike = useCallback(() => {
    if (!pairingSelection || !activePairing) return;
    if (sim.assets[pairingSelection.targetId]?.status === "destroyed") {
      setPairingSelection(null);
      return;
    }
    setMissionInitialDistKm(activePairing.distanceKm);
    sim.strikeMission(pairingSelection.shooterId, pairingSelection.weaponId, pairingSelection.targetId);
    // Keep panel open to show mission progress
  }, [pairingSelection, activePairing, sim]);

  const handleAbortMission = useCallback(() => {
    if (!activeMissionForTarget) return;
    sim.abortMission(activeMissionForTarget.mission_id);
    setPairingSelection(null);
  }, [activeMissionForTarget, sim]);

  const handleCancelPairing = useCallback(() => setPairingSelection(null), []);

  // Compute strike line from live pairing positions (for selected mission)
  const strikeLine = useMemo(() => {
    if (!activePairing) return null;
    return {
      from: [
        activePairing.shooter.position.longitude,
        activePairing.shooter.position.latitude,
      ] as [number, number],
      to: [
        activePairing.target.position.longitude,
        activePairing.target.position.latitude,
      ] as [number, number],
    };
  }, [activePairing]);

  // Compute strike lines for ALL active missions
  const strikeLines = useMemo(() => {
    const lines: Array<{ from: [number, number]; to: [number, number] }> = [];
    for (const m of Object.values(sim.activeMissions)) {
      const shooter = sim.assets[m.shooter_id];
      const target = sim.assets[m.target_id];
      if (!shooter || !target) continue;
      lines.push({
        from: [shooter.position.longitude, shooter.position.latitude],
        to: [target.position.longitude, target.position.latitude],
      });
    }
    return lines;
  }, [sim.activeMissions, sim.assets]);

  // Compute movement lines for all assets with active movement orders
  const movementLines = useMemo(() => {
    const lines: Array<{ from: [number, number]; to: [number, number] }> = [];
    for (const asset of Object.values(sim.assets)) {
      if (!asset.movement_order || asset.status === "destroyed") continue;
      lines.push({
        from: [asset.position.longitude, asset.position.latitude],
        to: [asset.movement_order.destination.longitude, asset.movement_order.destination.latitude],
      });
    }
    return lines;
  }, [sim.assets]);

  // ESC dismisses pairing panel (higher priority than move mode)
  useEffect(() => {
    if (!pairingSelection) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPairingSelection(null);
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [pairingSelection]);

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
    onStrikeTarget: handleStrikeTarget,
    onViewCameraFeed: (assetId: string) => router.push(`/camera/${assetId}`),
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
          showSensorRanges={showSensorRanges}
          moveMode={move.moveMode}
          strikeLine={strikeLine}
          strikeLines={strikeLines}
          plannedLines={plannedLines}
          movementLines={movementLines}
          showHeatmap={showHeatmap}
          showZoneControl={showZoneControl}
          lockedAssetId={lockedAssetId}
          flyTo={flyTo}
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

        {/* Target lock badge — shown when a target is locked */}
        {lockedAssetId && (() => {
          const locked = sim.assets[lockedAssetId];
          return (
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-sm text-[10px] font-semibold"
              style={{
                background: "rgba(20,16,8,0.9)",
                border: "1px solid rgba(255,176,0,0.5)",
                color: "rgba(255,176,0,0.95)",
                backdropFilter: "blur(4px)",
                boxShadow: "0 0 12px rgba(255,176,0,0.15)",
              }}
            >
              <span style={{ animation: "om-lock-blink 1s step-end infinite" }}>◎</span>
              <span className="tracking-widest uppercase">TGT LOCKED</span>
              <span className="opacity-50">·</span>
              <span>{locked?.callsign ?? lockedAssetId}</span>
              <button
                onClick={() => setLockedAssetId(null)}
                className="ml-1 opacity-60 hover:opacity-100 cursor-pointer transition-opacity"
                title="Unlock target"
              >
                ✕
              </button>
            </div>
          );
        })()}

        {/* Lock Target button — shown when an asset is selected and not yet locked */}
        {selectedId && selectedId !== lockedAssetId && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30"
          >
            <button
              onClick={() => setLockedAssetId(selectedId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-semibold cursor-pointer transition-colors"
              style={{
                background: "rgba(20,16,8,0.85)",
                border: "1px solid rgba(255,176,0,0.3)",
                color: "rgba(255,176,0,0.7)",
                backdropFilter: "blur(4px)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,176,0,0.7)";
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,176,0,1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,176,0,0.3)";
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,176,0,0.7)";
              }}
            >
              ◎ Lock Target
            </button>
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

        {/* Top-right HUD: map style toggle + sensor toggle + help */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          <MiniMapPanel assets={visibleAssets} visibleLayers={visibleLayers} />
          {/* Sensor range toggle */}
          <button
            onClick={() => setShowSensorRanges((v) => !v)}
            className={`px-2.5 py-1 rounded-sm text-[9px] font-semibold cursor-pointer transition-colors ${
              showSensorRanges
                ? "text-[var(--om-blue-light)]"
                : "text-[var(--om-text-muted)]"
            }`}
            style={{
              background: "rgba(30,34,41,0.85)",
              border: `1px solid ${showSensorRanges ? "rgba(45,114,210,0.4)" : "var(--om-border)"}`,
              backdropFilter: "blur(4px)",
            }}
          >
            Sensors
          </button>

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

        {/* Strike Pairing Panel */}
        {activePairing && (
          <StrikePairingPanel
            pairing={activePairing}
            allPairings={allPairings}
            activeMission={missionForPanel}
            allActiveMissions={sim.activeMissions}
            initialDistanceKm={missionInitialDistKm}
            onConfirm={handleConfirmStrike}
            onCancel={handleCancelPairing}
            onAbortMission={activeMissionForTarget ? handleAbortMission : undefined}
            onSelectPairing={handleSelectPairing}
          />
        )}

        {/* Active missions indicator */}
        {Object.keys(sim.activeMissions).length > 0 && !activePairing && (
          <div
            className="absolute bottom-4 right-4 z-40 px-3 py-1.5 rounded-sm text-[9px] font-semibold"
            style={{
              background: "rgba(30,34,41,0.9)",
              border: "1px solid rgba(205,66,70,0.4)",
              color: "var(--om-orange)",
              backdropFilter: "blur(4px)",
            }}
          >
            {Object.keys(sim.activeMissions).length} mission{Object.keys(sim.activeMissions).length > 1 ? "s" : ""} en route
          </div>
        )}

        {/* Strike Log Panel */}
        {sim.strikeLog.length > 0 && !activePairing && (
          <StrikeLogPanel entries={sim.strikeLog} currentTick={sim.tick} />
        )}

        {/* No shooter available message */}
        {noShooterMsg && (
          <div
            className="absolute bottom-4 right-4 z-40 px-4 py-2 rounded-sm text-[11px] font-semibold"
            style={{
              background: "rgba(205,66,70,0.15)",
              border: "1px solid rgba(205,66,70,0.4)",
              color: "var(--om-red-light)",
              backdropFilter: "blur(4px)",
            }}
          >
            No available shooter
          </div>
        )}

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
