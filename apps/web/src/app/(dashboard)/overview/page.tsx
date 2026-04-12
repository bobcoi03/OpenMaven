"use client";

import { useSimulation } from "@/lib/use-simulation";
import {
  useOverviewStats,
  type FactionStats,
  type OverviewStats,
} from "@/lib/use-overview-stats";
import { SimulationControls } from "@/components/simulation-controls";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bgDeep:       "#1E2229",
  bgElevated:   "#2D323A",
  bgSurface:    "#353B44",
  border:       "rgba(255,255,255,0.08)",
  textPrimary:  "#E2E8F0",
  textSecondary:"#94A3B8",
  textMuted:    "#64748B",
  blueLt:       "#4C90F0",
  greenLt:      "#32A467",
  orangeLt:     "#EC9A3C",
  redLt:        "#E76A6E",
  friendly:     "#00A8DC",
  hostile:      "#FF3031",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthColor(pct: number): string {
  if (pct >= 70) return T.greenLt;
  if (pct >= 40) return T.orangeLt;
  return T.redLt;
}

function eventDotColor(status: string): string {
  if (status === "complete") return T.greenLt;
  if (status === "aborted") return T.orangeLt;
  if (status === "counterattack") return T.redLt;
  return T.blueLt;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Bar({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-24 text-[10px] shrink-0"
        style={{ color: T.textMuted }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-1.5 rounded-full"
        style={{ background: T.bgSurface }}
      >
        <div
          className="h-1.5 rounded-full transition-[width] duration-500"
          style={{ width: `${Math.round(value * 100)}%`, background: color }}
        />
      </div>
      <span
        className="w-8 text-right text-[10px]"
        style={{ color }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function FactionCard({ f }: { f: FactionStats }) {
  const accentColor = f.side === "BLUFOR" ? T.friendly : T.hostile;

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-sm"
      style={{
        background: T.bgElevated,
        border: `1px solid ${T.border}`,
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      {/* Header */}
      <div className="flex items-baseline gap-2">
        <span
          className="text-sm font-bold tracking-wide"
          style={{ color: T.textPrimary }}
        >
          {f.name}
        </span>
        <span
          className="text-[9px] font-semibold tracking-widest uppercase"
          style={{ color: accentColor }}
        >
          {f.side}
        </span>
      </div>

      {/* Asset counts */}
      <div className="flex gap-4 text-[11px]">
        <span>
          <span
            className="text-base font-bold"
            style={{ color: T.textPrimary }}
          >
            {f.aliveAssets}
          </span>
          <span style={{ color: T.textMuted }}> alive</span>
        </span>
        <span>
          <span style={{ color: T.redLt }}>✕ {f.destroyedAssets}</span>
          <span style={{ color: T.textMuted }}> lost</span>
        </span>
      </div>

      {/* Progress bars */}
      <div className="flex flex-col gap-1.5">
        <Bar
          value={f.avgHealthPct / 100}
          color={healthColor(f.avgHealthPct)}
          label="Avg Health"
        />
        <Bar value={f.readiness} color={T.blueLt} label="Readiness" />
        <Bar value={f.morale} color={T.blueLt} label="Morale" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const sim = useSimulation();
  const stats: OverviewStats = useOverviewStats({
    assets: sim.assets,
    factions: sim.factions,
    activeMissions: sim.activeMissions,
    strikeLog: sim.strikeLog,
    tick: sim.tick,
  });

  const kdLabel =
    stats.kdRatio === null ? "—" : `${stats.kdRatio} : 1`;

  const kdColor =
    stats.kdRatio === null
      ? T.textMuted
      : stats.kdRatio > 1
        ? T.greenLt
        : stats.kdRatio < 1
          ? T.redLt
          : T.textPrimary;

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: T.bgDeep }}
    >
      {/* Sim controls bar — reused from Map page */}
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

        {/* Faction KPI cards */}
        <div className="grid grid-cols-2 gap-4">
          {stats.factions.map((f) => (
            <FactionCard key={f.factionId} f={f} />
          ))}
        </div>

        {/* Mission status + K/D row */}
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-sm flex-wrap"
          style={{ background: T.bgElevated, border: `1px solid ${T.border}` }}
        >
          <span
            className="text-[9px] font-semibold tracking-widest uppercase mr-1"
            style={{ color: T.textMuted }}
          >
            MISSIONS
          </span>

          {/* Active */}
          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(45,114,210,0.15)",
              border: "1px solid rgba(45,114,210,0.35)",
              color: T.blueLt,
            }}
          >
            Active: {stats.missionSummary.active}
          </span>

          {/* Complete */}
          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(35,133,81,0.15)",
              border: "1px solid rgba(35,133,81,0.35)",
              color: T.greenLt,
            }}
          >
            Complete: {stats.missionSummary.complete}
          </span>

          {/* Aborted */}
          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              background: "rgba(200,118,25,0.15)",
              border: "1px solid rgba(200,118,25,0.35)",
              color: T.orangeLt,
            }}
          >
            Aborted: {stats.missionSummary.aborted}
          </span>

          {/* K/D ratio */}
          <div className="ml-auto flex items-center gap-2">
            <span
              className="text-[9px] font-semibold tracking-widest uppercase"
              style={{ color: T.textMuted }}
            >
              K/D
            </span>
            <span className="text-sm font-bold" style={{ color: kdColor }}>
              {kdLabel}
            </span>
          </div>
        </div>

        {/* Live event feed */}
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
            LIVE EVENT FEED
          </div>

          {/* Feed rows */}
          <div className="max-h-96 overflow-y-auto">
            {stats.recentEvents.length === 0 ? (
              <div
                className="flex items-center justify-center py-10 text-[11px]"
                style={{ color: T.textMuted }}
              >
                No events yet
              </div>
            ) : (
              <div className="flex flex-col">
                {stats.recentEvents.map((entry) => {
                  const dotColor = eventDotColor(entry.status);
                  const description =
                    entry.status === "counterattack"
                      ? `Counterattack on ${entry.target_callsign}`
                      : `${entry.shooter_callsign} → ${entry.target_callsign}`;

                  return (
                    <div
                      key={entry.mission_id}
                      className="flex items-center gap-3 px-4 py-2 text-[11px]"
                      style={{ borderBottom: `1px solid ${T.border}` }}
                    >
                      {/* Status dot */}
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: dotColor }}
                      />
                      {/* Tick */}
                      <span
                        className="font-mono text-[9px] w-12 shrink-0"
                        style={{ color: T.textMuted }}
                      >
                        T+{entry.tick}
                      </span>
                      {/* Description */}
                      <span
                        className="flex-1 truncate"
                        style={{ color: T.textSecondary }}
                      >
                        {description}
                      </span>
                      {/* Status chip */}
                      <span
                        className="px-1.5 py-0.5 rounded-sm text-[9px] font-semibold uppercase shrink-0"
                        style={{
                          background: `${dotColor}20`,
                          color: dotColor,
                        }}
                      >
                        {entry.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
