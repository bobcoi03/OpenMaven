"use client";

/**
 * drone-hud.tsx
 *
 * Tactical HUD panel displayed alongside the FLIR feed.
 * Shows drone telemetry and current target info.
 */

import type { SimAsset, DetectionEntry } from "@/lib/use-simulation";

interface DroneHudProps {
  drone: SimAsset;
  target: DetectionEntry | null;
  connected: boolean;
  onStrike?: () => void;
  strikeState?: "ready" | "in_flight" | "no_shooter";
}

function HudRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[9px] font-semibold tracking-widest text-[var(--om-text-muted)] uppercase">
        {label}
      </span>
      <span className="text-[11px] font-mono text-[var(--om-text-primary)]">{value}</span>
    </div>
  );
}

export function DroneHud({ drone, target, connected, onStrike, strikeState }: DroneHudProps) {
  const { position, speed_kmh, callsign, asset_type, health } = drone;
  const healthPct = Math.max(0, Math.min(100, health));
  const healthColor =
    healthPct > 60
      ? "var(--om-green, #22c55e)"
      : healthPct > 30
        ? "var(--om-orange, #f97316)"
        : "var(--om-red-light, #f87171)";

  const coords = `${position.latitude.toFixed(4)}°N  ${position.longitude.toFixed(4)}°E`;
  const altitude = `${Math.round(position.altitude_m)} m`;
  const heading = `${Math.round(position.heading_deg).toString().padStart(3, "0")}°`;
  const speed = `${Math.round(speed_kmh)} km/h`;

  return (
    <div className="flex flex-col gap-0 h-full bg-[var(--om-bg-deep)] border-l border-[var(--om-border-strong)] text-[var(--om-text-primary)] font-mono select-none">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--om-border)]">
        <div className="flex items-center justify-between">
          <div className="text-[10px] tracking-widest text-[var(--om-text-muted)] uppercase">
            Camera Feed
          </div>
          <div
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded-sm"
            style={{
              background: connected ? "rgba(34,197,94,0.1)" : "rgba(205,66,70,0.1)",
              border: `1px solid ${connected ? "rgba(34,197,94,0.3)" : "rgba(205,66,70,0.3)"}`,
              color: connected ? "var(--om-green, #22c55e)" : "var(--om-red-light, #f87171)",
            }}
          >
            {connected ? "LIVE" : "OFFLINE"}
          </div>
        </div>
        <div className="mt-1 text-[15px] font-semibold tracking-wide text-[var(--om-blue-light)]">
          {callsign}
        </div>
        <div className="text-[10px] text-[var(--om-text-muted)]">{asset_type}</div>
      </div>

      {/* Telemetry */}
      <div className="px-4 py-3 border-b border-[var(--om-border)] flex flex-col gap-2">
        <div className="text-[9px] tracking-widest text-[var(--om-text-muted)] uppercase mb-1">
          Telemetry
        </div>
        <HudRow label="Alt" value={altitude} />
        <HudRow label="Hdg" value={heading} />
        <HudRow label="Spd" value={speed} />
        <HudRow label="Pos" value={coords} />
      </div>

      {/* Health */}
      <div className="px-4 py-3 border-b border-[var(--om-border)]">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[9px] tracking-widest text-[var(--om-text-muted)] uppercase">
            Systems
          </span>
          <span className="text-[11px] font-mono" style={{ color: healthColor }}>
            {healthPct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--om-bg-elevated)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${healthPct}%`, background: healthColor }}
          />
        </div>
      </div>

      {/* Target */}
      <div className="px-4 py-3 flex-1">
        <div className="text-[9px] tracking-widest text-[var(--om-text-muted)] uppercase mb-2">
          Target
        </div>
        {target ? (
          <div className="flex flex-col gap-2">
            <HudRow label="ID" value={target.target_id.slice(0, 8).toUpperCase()} />
            <HudRow
              label="Conf"
              value={`${Math.round(target.confidence * 100)}%`}
            />
            <HudRow
              label="Pos"
              value={`${target.lat.toFixed(4)}  ${target.lon.toFixed(4)}`}
            />
            {/* Strike button */}
            {onStrike && strikeState !== "in_flight" && (
              <button
                onClick={onStrike}
                disabled={strikeState === "no_shooter"}
                className="mt-2 w-full px-2 py-1.5 rounded-sm text-[10px] font-bold tracking-widest cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: strikeState === "no_shooter" ? "rgba(205,66,70,0.05)" : "rgba(205,66,70,0.18)",
                  border: "1px solid rgba(205,66,70,0.5)",
                  color: "var(--om-red-light)",
                }}
              >
                {strikeState === "no_shooter" ? "NO SHOOTER" : "⚡ STRIKE"}
              </button>
            )}
            {strikeState === "in_flight" && (
              <div
                className="mt-2 w-full px-2 py-1.5 rounded-sm text-[10px] font-bold tracking-widest text-center"
                style={{
                  background: "rgba(249,115,22,0.1)",
                  border: "1px solid rgba(249,115,22,0.4)",
                  color: "var(--om-orange, #f97316)",
                }}
              >
                MISSILE EN ROUTE
              </div>
            )}
          </div>
        ) : (
          <div className="text-[10px] text-[var(--om-text-muted)]">No target detected</div>
        )}
      </div>
    </div>
  );
}
