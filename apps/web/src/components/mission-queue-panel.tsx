"use client";

/**
 * mission-queue-panel.tsx
 *
 * Shows all in-flight and queued missions with live progress bars.
 * Positioned above the strike log panel (bottom-right).
 */

import type { MissionUpdate, SimAsset } from "@/lib/use-simulation";

interface MissionQueuePanelProps {
  activeMissions: Record<string, MissionUpdate>;
  assets: Record<string, SimAsset>;
  currentTick: number;
  initialDistances: Record<string, number>;
  onAbort: (missionId: string) => void;
}

function missionProgress(
  mission: MissionUpdate,
  assets: Record<string, SimAsset>,
  initialDist: number,
): number {
  const shooter = assets[mission.shooter_id];
  const target = assets[mission.target_id];
  if (!shooter || !target || initialDist === 0) return 0;
  const dx = (shooter.position.longitude - target.position.longitude) * 111 * Math.cos((target.position.latitude * Math.PI) / 180);
  const dy = (shooter.position.latitude - target.position.latitude) * 111;
  const currentDist = Math.hypot(dx, dy);
  return Math.min(1, Math.max(0, 1 - currentDist / initialDist));
}

export function MissionQueuePanel({
  activeMissions,
  assets,
  currentTick: _currentTick,
  initialDistances,
  onAbort,
}: MissionQueuePanelProps) {
  const missions = Object.values(activeMissions);
  if (missions.length === 0) return null;

  const inFlight = missions.filter((m) => m.status === "en_route");
  const queued = missions.filter((m) => m.status !== "en_route");

  return (
    <div
      className="absolute bottom-4 right-4 z-40 rounded-sm overflow-hidden shadow-2xl"
      style={{
        width: 280,
        background: "var(--om-bg-elevated)",
        border: "1px solid var(--om-border)",
        marginBottom: 296,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--om-border)] bg-[var(--om-bg-primary)]">
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--om-text-secondary)]">
          Mission Queue
        </span>
        <div className="flex gap-1.5">
          {inFlight.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 bg-[var(--om-blue)]/15 border border-[var(--om-blue)]/25 rounded-full text-[var(--om-blue-light)]">
              {inFlight.length} active
            </span>
          )}
          {queued.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 bg-[var(--om-orange)]/15 border border-[var(--om-orange)]/25 rounded-full text-[var(--om-orange-light)]">
              {queued.length} queued
            </span>
          )}
        </div>
      </div>

      {/* Mission rows */}
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {missions.map((mission) => {
          const shooter = assets[mission.shooter_id];
          const target = assets[mission.target_id];
          const progress = missionProgress(mission, assets, initialDistances[mission.mission_id] ?? 0);
          const isInFlight = mission.status === "en_route";

          return (
            <div key={mission.mission_id} className="px-2.5 py-2 border-b border-[var(--om-border)] last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-[var(--om-text-primary)] truncate flex-1">
                  {shooter?.callsign ?? "?"} → {target?.callsign ?? "?"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span
                    className="text-[8px] px-1.5 py-0.5 rounded-sm border"
                    style={{
                      background: isInFlight ? "rgba(74,144,226,0.15)" : "rgba(245,166,35,0.12)",
                      borderColor: isInFlight ? "rgba(74,144,226,0.35)" : "rgba(245,166,35,0.3)",
                      color: isInFlight ? "var(--om-blue-light)" : "var(--om-orange-light)",
                    }}
                  >
                    {isInFlight ? "IN FLIGHT" : "QUEUED"}
                  </span>
                  <button
                    onClick={() => onAbort(mission.mission_id)}
                    className="text-[8px] text-[var(--om-text-muted)] hover:text-[var(--om-red-light)] transition-colors cursor-pointer"
                    title="Abort mission"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-[var(--om-text-muted)] mb-1.5">
                <span>{mission.weapon_id}</span>
              </div>
              {isInFlight && (
                <div className="h-1 bg-[var(--om-bg-deep)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress * 100}%`,
                      background: "linear-gradient(90deg, #1a4a8a, #4a90e2)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
