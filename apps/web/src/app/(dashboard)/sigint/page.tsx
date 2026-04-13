"use client";

import { useSimulation } from "@/lib/use-simulation";
import { useSigintStats } from "@/lib/use-sigint-stats";
import { SimulationControls } from "@/components/simulation-controls";
import type { SigintIntercept } from "@/lib/use-simulation";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bgDeep:        "#1E2229",
  bgElevated:    "#2D323A",
  bgSurface:     "#353B44",
  border:        "rgba(255,255,255,0.08)",
  textPrimary:   "#E2E8F0",
  textSecondary: "#94A3B8",
  textMuted:     "#64748B",
  blueLt:        "#4C90F0",
  greenLt:       "#32A467",
  orangeLt:      "#EC9A3C",
  redLt:         "#E76A6E",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function threatColor(level: SigintIntercept["threat_level"]): string {
  if (level === "HIGH") return T.redLt;
  if (level === "MED") return T.orangeLt;
  return T.greenLt;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InterceptRow({ intercept }: { intercept: SigintIntercept }) {
  const color = threatColor(intercept.threat_level);
  const confPct = `${Math.round(intercept.confidence * 100)}%`;

  return (
    <div
      className="flex flex-col px-4 py-2.5"
      style={{ borderBottom: `1px solid ${T.border}` }}
    >
      {/* Line 1 */}
      <div className="flex items-center gap-2.5">
        {/* Threat dot */}
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: color }}
        />
        {/* Tick */}
        <span
          className="font-mono text-[9px] w-10 shrink-0"
          style={{ color: T.textMuted }}
        >
          T+{intercept.tick}
        </span>
        {/* Freq band chip */}
        <span
          className="text-[9px] font-semibold w-7 shrink-0"
          style={{ color: T.blueLt }}
        >
          {intercept.frequency_band}
        </span>
        {/* Callsign + signal type */}
        <span
          className="flex-1 text-[11px] truncate"
          style={{ color: T.textPrimary }}
        >
          {intercept.emitter_callsign}
          <span style={{ color: T.textMuted }}> · {intercept.signal_type}</span>
        </span>
        {/* Confidence */}
        <span
          className="text-[9px] font-semibold tabular-nums shrink-0"
          style={{ color }}
        >
          {confPct}
        </span>
      </div>

      {/* Line 2 */}
      <div className="flex items-center gap-3 mt-1 pl-[26px]">
        <span className="text-[9px]" style={{ color: T.textMuted }}>
          {intercept.lat.toFixed(2)}°N {intercept.lon.toFixed(2)}°E
        </span>
        <span className="text-[9px]" style={{ color: T.textMuted }}>
          via {intercept.intercepted_by_callsign}
        </span>
        {/* Threat badge */}
        <span
          className="px-1.5 py-px rounded-sm text-[8px] font-semibold uppercase"
          style={{
            background: `${color}18`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {intercept.threat_level}
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SigintPage() {
  const sim = useSimulation();
  const stats = useSigintStats({
    sigintIntercepts: sim.sigintIntercepts,
    assets: sim.assets,
    tick: sim.tick,
  });

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: T.bgDeep }}
    >
      {/* Sim controls */}
      <SimulationControls
        connected={sim.connected}
        tick={sim.tick}
        speed={sim.speed}
        onSetSpeed={sim.setSpeed}
        assetCount={Object.keys(sim.assets).length}
        pendingEvents={sim.pendingEvents}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {/* Stats bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-sm flex-wrap"
          style={{ background: T.bgElevated, border: `1px solid ${T.border}` }}
        >
          <span
            className="text-[9px] font-semibold tracking-widest uppercase mr-1"
            style={{ color: T.textMuted }}
          >
            SIGINT
          </span>

          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(76,144,240,0.15)",
              border: "1px solid rgba(76,144,240,0.35)",
              color: T.blueLt,
            }}
          >
            Intercepts: {stats.totalIntercepts}
          </span>

          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(231,106,110,0.15)",
              border: "1px solid rgba(231,106,110,0.35)",
              color: T.redLt,
            }}
          >
            High Conf: {stats.highConfCount}
          </span>

          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(236,154,60,0.15)",
              border: "1px solid rgba(236,154,60,0.35)",
              color: T.orangeLt,
            }}
          >
            Active EW: {stats.activeEwAssets}
          </span>
        </div>

        {/* Intercept feed */}
        <div
          className="flex flex-col rounded-sm overflow-hidden"
          style={{ background: T.bgElevated, border: `1px solid ${T.border}` }}
        >
          {/* Feed header */}
          <div
            className="px-4 py-2.5 text-[9px] font-semibold tracking-widest uppercase"
            style={{
              color: T.textMuted,
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            INTERCEPT FEED
          </div>

          {/* Rows */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {stats.recentIntercepts.length === 0 ? (
              <div
                className="flex items-center justify-center py-12 text-[11px]"
                style={{ color: T.textMuted }}
              >
                No intercepts yet — simulation may be paused
              </div>
            ) : (
              stats.recentIntercepts.map((intercept) => (
                <InterceptRow key={intercept.intercept_id} intercept={intercept} />
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
