"use client";

/**
 * strike-log-panel.tsx
 *
 * Detailed strike log panel showing completed/aborted strike missions
 * with coordinates, weapon, health, damage, and outcome.
 */

import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import type { StrikeLogEntry } from "@/lib/use-simulation";
import { WEAPON_PROFILES } from "@/lib/weapon-data";

interface StrikeLogPanelProps {
  entries: StrikeLogEntry[];
  currentTick: number;
}

function OutcomeIcon({ outcome }: { outcome: string | undefined }) {
  if (outcome === "destroyed") return <CheckCircle size={10} className="text-[var(--om-red)] shrink-0" />;
  if (outcome === "damaged") return <AlertTriangle size={10} className="text-[var(--om-orange)] shrink-0" />;
  return <XCircle size={10} className="text-[var(--om-text-muted)] shrink-0" />;
}

function OutcomeLabel({ outcome }: { outcome: string | undefined }) {
  if (outcome === "destroyed") return <span className="text-[var(--om-red)] font-semibold">DESTROYED</span>;
  if (outcome === "damaged") return <span className="text-[var(--om-orange)] font-semibold">HIT</span>;
  if (outcome === "missed") return <span className="text-[var(--om-text-muted)] font-semibold">MISS</span>;
  if (outcome === "aborted") return <span className="text-[var(--om-text-muted)] font-semibold">ABORTED</span>;
  return <span className="text-[var(--om-text-secondary)]">{outcome ?? "—"}</span>;
}

export function StrikeLogPanel({ entries, currentTick }: StrikeLogPanelProps) {
  return (
    <div
      className="absolute bottom-4 left-4 z-40 w-[300px] rounded-sm overflow-hidden shadow-2xl"
      style={{
        background: "var(--om-bg-elevated)",
        border: "1px solid var(--om-border)",
        maxHeight: "280px",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--om-border)] bg-[var(--om-bg-primary)]">
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--om-text-secondary)]">
          Strike Log
        </span>
        <span className="text-[8px] text-[var(--om-text-muted)]">
          {entries.length} mission{entries.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Entries */}
      <div className="overflow-y-auto" style={{ maxHeight: "240px" }}>
        {entries.map((entry) => {
          const ticksAgo = currentTick - entry.tick;
          const weapon = WEAPON_PROFILES[entry.weapon_id];
          const outcome = entry.result?.outcome ?? entry.status;
          const r = entry.result;

          return (
            <div
              key={entry.mission_id}
              className="px-2.5 py-2 border-b border-[var(--om-border)] last:border-b-0"
            >
              {/* Row 1: Outcome + callsigns + time */}
              <div className="flex items-center gap-1.5 mb-1">
                <OutcomeIcon outcome={outcome} />
                <span className="text-[9px] font-semibold text-[var(--om-text-primary)] truncate flex-1">
                  {entry.shooter_callsign} → {entry.target_callsign}
                </span>
                <span className="text-[8px] text-[var(--om-text-muted)] shrink-0">
                  {ticksAgo > 0 ? `${ticksAgo} tick${ticksAgo > 1 ? "s" : ""} ago` : "now"}
                </span>
              </div>

              {/* Row 2: Outcome label + weapon */}
              <div className="flex items-center gap-2 text-[8px] mb-0.5">
                <OutcomeLabel outcome={outcome} />
                <span className="text-[var(--om-text-muted)]">
                  {weapon?.display_name ?? entry.weapon_id}
                </span>
              </div>

              {/* Row 3: Details grid */}
              <div className="flex gap-3 text-[8px] text-[var(--om-text-muted)]">
                {r?.target_asset_type && (
                  <span>Type: <span className="text-[var(--om-text-secondary)]">{r.target_asset_type}</span></span>
                )}
                {r?.damage_percent !== undefined && (
                  <span>Dmg: <span className="text-[var(--om-text-secondary)]">{Math.round(r.damage_percent * 100)}%</span></span>
                )}
                {r?.target_health !== undefined && (
                  <span>HP: <span className="text-[var(--om-text-secondary)]">{Math.round(r.target_health * 100)}%</span></span>
                )}
              </div>

              {/* Row 4: Coordinates + distance */}
              {r?.target_lat !== undefined && r?.target_lon !== undefined && (
                <div className="flex gap-3 text-[8px] text-[var(--om-text-muted)] mt-0.5">
                  <span>
                    {r.target_lat.toFixed(3)}°N, {r.target_lon.toFixed(3)}°E
                  </span>
                  {r.distance_km !== undefined && (
                    <span>{r.distance_km}km</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
