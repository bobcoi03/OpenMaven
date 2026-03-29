"use client";

/**
 * strike-pairing-panel.tsx
 *
 * Kill chain confirmation panel: shows the auto-paired shooter → weapon → target
 * with telemetry (kill probability, distance, time-to-target).
 * Includes shooter/weapon picker, mission progress, and result flash.
 * Collapsible via chevron toggle so it doesn't block map view.
 */

import { useState } from "react";
import { Crosshair, ArrowRight, X, ChevronDown, ChevronUp, Plane } from "lucide-react";
import type { StrikePairing } from "@/lib/strike-pairing";
import type { MissionUpdate } from "@/lib/use-simulation";
import { WEAPON_PROFILES } from "@/lib/weapon-data";

interface StrikePairingPanelProps {
  pairing: StrikePairing;
  allPairings: StrikePairing[];
  activeMission?: MissionUpdate | null;
  /** All active missions, keyed by mission_id — used to show busy shooters. */
  allActiveMissions?: Record<string, MissionUpdate>;
  /** Initial distance when mission was launched, for progress calculation. */
  initialDistanceKm?: number;
  onConfirm: () => void;
  onCancel: () => void;
  onAbortMission?: () => void;
  onSelectPairing: (shooterId: string, weaponId: string) => void;
}

function DataCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[8px] uppercase tracking-[0.1em] text-[var(--om-text-muted)]">
        {label}
      </span>
      <span className="text-[13px] font-semibold text-[var(--om-text-primary)]">
        {value}
        {unit && <span className="text-[10px] text-[var(--om-text-secondary)] ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

function formatDist(km: number): { value: string; unit: string } {
  if (km < 1) return { value: `${Math.round(km * 1000)}`, unit: "m" };
  return { value: km.toFixed(1), unit: "km" };
}

function formatTime(sec: number): string {
  if (sec <= 0) return "--";
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}m`;
}

/** Find the mission a shooter is currently on, if any. */
function findMissionForShooter(
  shooterId: string,
  missions?: Record<string, MissionUpdate>,
): MissionUpdate | undefined {
  if (!missions) return undefined;
  for (const m of Object.values(missions)) {
    if (m.shooter_id === shooterId && m.status === "en_route") return m;
  }
  return undefined;
}

export function StrikePairingPanel({
  pairing,
  allPairings,
  activeMission,
  allActiveMissions,
  initialDistanceKm,
  onConfirm,
  onCancel,
  onAbortMission,
  onSelectPairing,
}: StrikePairingPanelProps) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [viewingMissionShooter, setViewingMissionShooter] = useState<string | null>(null);

  const killPct = Math.round(pairing.killProb * 100);
  const dist = formatDist(pairing.distanceKm);
  const timeStr = formatTime(pairing.timeToTargetSec);

  const isEnRoute = activeMission?.status === "en_route";
  const isComplete = activeMission?.status === "complete";
  const isAborted = activeMission?.status === "aborted";
  const hasResult = isComplete || isAborted;

  // Result display
  const resultOutcome = activeMission?.result?.outcome;
  const resultColor =
    resultOutcome === "destroyed" ? "var(--om-red)" :
    resultOutcome === "damaged" ? "var(--om-orange)" :
    resultOutcome === "missed" ? "var(--om-text-muted)" :
    resultOutcome === "aborted" ? "var(--om-text-muted)" :
    "var(--om-text-primary)";
  const resultLabel =
    resultOutcome === "destroyed" ? "DESTROYED" :
    resultOutcome === "damaged" ? "HIT" :
    resultOutcome === "missed" ? "MISS" :
    resultOutcome === "aborted" ? "ABORTED" :
    activeMission?.result?.description ?? "COMPLETE";

  // Alternative pairings (excluding current)
  const alternatives = allPairings.filter(
    (p) => !(p.shooter.asset_id === pairing.shooter.asset_id && p.weaponId === pairing.weaponId),
  );

  // Mission details overlay for a busy shooter
  const viewedMission = viewingMissionShooter
    ? findMissionForShooter(viewingMissionShooter, allActiveMissions)
    : undefined;

  return (
    <div
      className="absolute bottom-4 right-4 z-40 w-[340px] rounded-sm overflow-hidden shadow-2xl"
      style={{
        background: "var(--om-bg-elevated)",
        border: "1px solid var(--om-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--om-border)]"
        style={{ background: "color-mix(in srgb, var(--om-bg-primary) 60%, transparent)" }}
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] cursor-pointer transition-colors p-0.5 -ml-0.5"
          >
            {collapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <Crosshair size={12} className="text-[var(--om-red-light)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--om-text-secondary)]">
            {isEnRoute ? "Strike Mission — En Route" : hasResult ? "Strike Mission — Result" : "Strike Pairing"}
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] cursor-pointer transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <>
          {/* Result flash */}
          {hasResult && (
            <div
              className="px-3 py-2.5 text-center border-b border-[var(--om-border)]"
              style={{ background: `color-mix(in srgb, ${resultColor} 12%, transparent)` }}
            >
              <div className="text-[14px] font-bold tracking-wider" style={{ color: resultColor }}>
                {resultLabel}
              </div>
              {activeMission?.result?.description && (
                <div className="text-[9px] text-[var(--om-text-secondary)] mt-0.5">
                  {activeMission.result.description}
                </div>
              )}
            </div>
          )}

          {/* Shooter → Weapon → Target */}
          <div className="px-3 py-3 flex items-center justify-between gap-2">
            <div className="flex flex-col items-center min-w-0">
              <span className="text-[8px] uppercase tracking-[0.08em] text-[var(--om-blue-light)]">Shooter</span>
              <span className="text-[11px] font-semibold text-[var(--om-text-primary)] truncate max-w-[90px]">
                {pairing.shooter.callsign}
              </span>
              <span className="text-[8px] text-[var(--om-text-muted)] truncate max-w-[90px]">
                {pairing.shooter.asset_type}
              </span>
            </div>

            <ArrowRight size={12} className="text-[var(--om-text-muted)] shrink-0" />

            <div className="flex flex-col items-center min-w-0">
              <span className="text-[8px] uppercase tracking-[0.08em] text-[var(--om-orange)]">Weapon</span>
              <span className="text-[11px] font-semibold text-[var(--om-text-primary)] truncate max-w-[90px]">
                {pairing.weapon.display_name}
              </span>
              <span className="text-[8px] text-[var(--om-text-muted)]">
                {pairing.weapon.blast_radius_m}m blast
              </span>
            </div>

            <ArrowRight size={12} className="text-[var(--om-text-muted)] shrink-0" />

            <div className="flex flex-col items-center min-w-0">
              <span className="text-[8px] uppercase tracking-[0.08em] text-[var(--om-red-light)]">Target</span>
              <span className="text-[11px] font-semibold text-[var(--om-text-primary)] truncate max-w-[90px]">
                {pairing.target.callsign}
              </span>
              <span className="text-[8px] text-[var(--om-text-muted)] truncate max-w-[90px]">
                {pairing.target.asset_type}
              </span>
            </div>
          </div>

          {/* Telemetry strip */}
          <div className="px-3 py-2 flex justify-around border-t border-[var(--om-border)] bg-[var(--om-bg-primary)]">
            <DataCell label="Kill Prob" value={`${killPct}%`} />
            <DataCell label="Distance" value={dist.value} unit={dist.unit} />
            <DataCell label="Time to Target" value={timeStr} />
          </div>

          {/* Mission details overlay for a busy shooter */}
          {viewedMission && viewingMissionShooter && (
            <div className="px-3 py-2 border-t border-[var(--om-border)] bg-[var(--om-orange)]/5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--om-orange)]">
                  Shooter on Mission
                </span>
                <button
                  onClick={() => setViewingMissionShooter(null)}
                  className="text-[var(--om-text-muted)] hover:text-[var(--om-text-primary)] cursor-pointer"
                >
                  <X size={10} />
                </button>
              </div>
              <div className="text-[9px] text-[var(--om-text-secondary)] space-y-0.5">
                <div>Target: <span className="text-[var(--om-text-primary)] font-medium">{viewedMission.target_id}</span></div>
                <div>Weapon: <span className="text-[var(--om-text-primary)] font-medium">{viewedMission.weapon_id}</span></div>
                <div>Status: <span className="text-[var(--om-orange)] font-medium">EN ROUTE</span></div>
              </div>
            </div>
          )}

          {/* Shooter/weapon picker toggle (only when not on mission) */}
          {!isEnRoute && !hasResult && alternatives.length > 0 && (
            <div className="border-t border-[var(--om-border)]">
              <button
                onClick={() => { setShowAlternatives((v) => !v); setViewingMissionShooter(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between text-[9px] font-semibold text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)] cursor-pointer transition-colors"
              >
                <span>{alternatives.length} alternative{alternatives.length > 1 ? "s" : ""} available</span>
                {showAlternatives ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>

              {showAlternatives && (
                <div className="max-h-[140px] overflow-y-auto border-t border-[var(--om-border)]">
                  {alternatives.map((alt) => {
                    const wp = WEAPON_PROFILES[alt.weaponId];
                    const onMission = findMissionForShooter(alt.shooter.asset_id, allActiveMissions);
                    const isBusy = !!onMission;

                    return (
                      <button
                        key={`${alt.shooter.asset_id}-${alt.weaponId}`}
                        onClick={() => {
                          if (isBusy) {
                            setViewingMissionShooter(alt.shooter.asset_id);
                          } else {
                            onSelectPairing(alt.shooter.asset_id, alt.weaponId);
                            setViewingMissionShooter(null);
                          }
                        }}
                        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer transition-colors ${
                          isBusy
                            ? "opacity-60 hover:bg-[var(--om-orange)]/5"
                            : "hover:bg-[var(--om-bg-hover)]"
                        }`}
                      >
                        <span className={`text-[9px] font-semibold truncate min-w-0 flex-1 ${
                          isBusy ? "text-[var(--om-text-muted)]" : "text-[var(--om-blue-light)]"
                        }`}>
                          {alt.shooter.callsign}
                        </span>
                        {isBusy && (
                          <span className="flex items-center gap-0.5 text-[7px] font-semibold text-[var(--om-orange)] uppercase shrink-0">
                            <Plane size={8} />
                            On Mission
                          </span>
                        )}
                        {!isBusy && (
                          <>
                            <span className="text-[8px] text-[var(--om-orange)] truncate max-w-[80px]">
                              {wp?.display_name ?? alt.weaponId}
                            </span>
                            <span className="text-[9px] font-semibold text-[var(--om-text-primary)] w-[36px] text-right">
                              {Math.round(alt.killProb * 100)}%
                            </span>
                            <span className="text-[8px] text-[var(--om-text-muted)] w-[40px] text-right">
                              {alt.distanceKm.toFixed(0)}km
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* En route progress indicator + abort button */}
          {isEnRoute && (
            <div className="px-3 py-2.5 border-t border-[var(--om-border)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--om-orange)]">
                  En Route
                </span>
                <span className="text-[9px] text-[var(--om-text-muted)]">
                  {dist.value} {dist.unit} remaining
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden mb-2"
                style={{ background: "var(--om-bg-primary)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    background: "var(--om-orange)",
                    width: `${initialDistanceKm && initialDistanceKm > 0
                      ? Math.min(100, Math.max(3, ((initialDistanceKm - pairing.distanceKm) / initialDistanceKm) * 100))
                      : 5}%`,
                  }}
                />
              </div>
              {onAbortMission && (
                <button
                  onClick={onAbortMission}
                  className="w-full px-3 py-1.5 text-[10px] font-semibold text-[var(--om-text-secondary)] bg-[var(--om-bg-primary)] border border-[var(--om-border)] rounded-sm hover:bg-[var(--om-red)]/10 hover:text-[var(--om-red-light)] hover:border-[var(--om-red)]/40 cursor-pointer transition-colors"
                >
                  Abort Mission
                </button>
              )}
            </div>
          )}

          {/* Actions — only show when no active mission */}
          {!isEnRoute && !hasResult && (
            <div className="px-3 py-2 flex gap-2 border-t border-[var(--om-border)]">
              <button
                onClick={onCancel}
                className="flex-1 px-3 py-1.5 text-[10px] font-semibold text-[var(--om-text-secondary)] bg-[var(--om-bg-primary)] border border-[var(--om-border)] rounded-sm hover:bg-[var(--om-bg-hover)] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-3 py-1.5 text-[10px] font-semibold text-white rounded-sm cursor-pointer transition-colors"
                style={{ background: "var(--om-red)" }}
              >
                Execute Strike
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
