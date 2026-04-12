# Commander's Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level "Overview" tab with faction KPI cards, mission status, K/D ratio, and a live event feed — all derived from the existing `useSimulation()` hook with no backend changes.

**Architecture:** Two new files — `use-overview-stats.ts` (pure derived stats hook, no side effects) and `overview/page.tsx` (layout + wiring). One modified file — `app-shell.tsx` gets a new "Overview" tab. The page calls `useSimulation()` independently, exactly like `map/page.tsx`.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Tailwind CSS, lucide-react, existing `useSimulation()` hook.

---

## File Map

| File | Action |
|------|--------|
| `apps/web/src/lib/use-overview-stats.ts` | Create — pure derived stats hook |
| `apps/web/src/app/(dashboard)/overview/page.tsx` | Create — dashboard layout |
| `apps/web/src/components/app-shell.tsx` | Modify — add Overview to TABS |

---

## Task 1: Add "Overview" nav tab

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 1: Add `LayoutDashboard` to the lucide-react import**

Open `apps/web/src/components/app-shell.tsx`. Find the lucide-react import (line ~18–38). Add `LayoutDashboard` to it:

```ts
import {
  Search,
  Map as MapIcon,
  MessageSquare,
  Table,
  FileText,
  SlidersHorizontal,
  Send,
  Circle,
  Loader2,
  User,
  Bot,
  Layers,
  Crosshair,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Radar,
  Swords,
  Route,
  Shield,
  LayoutDashboard,
} from "lucide-react";
```

- [ ] **Step 2: Add the Overview tab as the first entry in TABS**

Find the `TABS` constant (around line 40–49):

```ts
const TABS = [
  // { name: "Graph", href: "/graph", icon: Network },
  // { name: "Table", href: "/table", icon: Table },
  { name: "Map", href: "/map", icon: MapIcon },
  // { name: "Query", href: "/query", icon: MessageSquare },
  // { name: "Sources", href: "/sources", icon: FileText },
  { name: "Assets", href: "/assets", icon: Crosshair },
  { name: "Decisions", href: "/decisions", icon: SlidersHorizontal },
  { name: "Design", href: "/design", icon: Layers },
] as const;
```

Replace it with:

```ts
const TABS = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Map", href: "/map", icon: MapIcon },
  { name: "Assets", href: "/assets", icon: Crosshair },
  { name: "Decisions", href: "/decisions", icon: SlidersHorizontal },
  { name: "Design", href: "/design", icon: Layers },
] as const;
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors related to `LayoutDashboard` or `TABS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/app-shell.tsx
git commit -m "feat(overview): add Overview nav tab to app shell"
```

---

## Task 2: Create `use-overview-stats.ts`

**Files:**
- Create: `apps/web/src/lib/use-overview-stats.ts`

- [ ] **Step 1: Create the file with types and hook**

Create `apps/web/src/lib/use-overview-stats.ts` with the full content:

```ts
"use client";

import { useMemo } from "react";
import type {
  SimAsset,
  SimFaction,
  MissionUpdate,
  StrikeLogEntry,
} from "@/lib/use-simulation";

// ── Output types ──────────────────────────────────────────────────────────────

export interface FactionStats {
  factionId: string;
  name: string;
  side: string;
  totalAssets: number;
  aliveAssets: number;
  destroyedAssets: number;
  /** Mean health of alive assets, 0–100. 0 when no alive assets. */
  avgHealthPct: number;
  /** 0–1 from SimFaction.morale */
  morale: number;
  /** 0–1 from SimFaction.capability */
  capability: number;
  /** (morale + capability) / 2 */
  readiness: number;
}

export interface MissionSummary {
  active: number;
  complete: number;
  aborted: number;
}

export interface OverviewStats {
  /** Always ordered: BLUFOR first, REDFOR second, others after. */
  factions: FactionStats[];
  /** REDFOR destroyed / BLUFOR destroyed. null when BLUFOR destroyed === 0. */
  kdRatio: number | null;
  missionSummary: MissionSummary;
  /** strikeLog.slice(0, 50) — newest first (ordering comes from use-simulation). */
  recentEvents: StrikeLogEntry[];
  tick: number;
}

// ── Input type ────────────────────────────────────────────────────────────────

interface UseOverviewStatsInput {
  assets: Record<string, SimAsset>;
  factions: Record<string, SimFaction>;
  activeMissions: Record<string, MissionUpdate>;
  strikeLog: StrikeLogEntry[];
  tick: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOverviewStats(input: UseOverviewStatsInput): OverviewStats {
  const { assets, factions, activeMissions, strikeLog, tick } = input;

  return useMemo(() => {
    const assetList = Object.values(assets);
    const factionList = Object.values(factions);

    // ── Per-faction stats ────────────────────────────────────────────────────
    const factionStats: FactionStats[] = factionList.map((faction) => {
      const factionAssets = assetList.filter(
        (a) => a.faction_id === faction.faction_id,
      );
      const alive = factionAssets.filter((a) => a.status !== "destroyed");
      const destroyed = factionAssets.filter((a) => a.status === "destroyed");
      const avgHealthPct =
        alive.length > 0
          ? Math.round(
              (alive.reduce((sum, a) => sum + a.health, 0) / alive.length) *
                100,
            )
          : 0;
      const readiness = (faction.morale + faction.capability) / 2;

      return {
        factionId: faction.faction_id,
        name: faction.name,
        side: faction.side,
        totalAssets: factionAssets.length,
        aliveAssets: alive.length,
        destroyedAssets: destroyed.length,
        avgHealthPct,
        morale: faction.morale,
        capability: faction.capability,
        readiness,
      };
    });

    // BLUFOR first, REDFOR second, others after
    const sideOrder = (s: string): number =>
      s === "BLUFOR" ? 0 : s === "REDFOR" ? 1 : 2;
    factionStats.sort((a, b) => sideOrder(a.side) - sideOrder(b.side));

    // ── K/D ratio ────────────────────────────────────────────────────────────
    const blufor = factionStats.find((f) => f.side === "BLUFOR");
    const redfor = factionStats.find((f) => f.side === "REDFOR");
    const kdRatio =
      !blufor || !redfor || blufor.destroyedAssets === 0
        ? null
        : +(redfor.destroyedAssets / blufor.destroyedAssets).toFixed(1);

    // ── Mission summary ───────────────────────────────────────────────────────
    const missionSummary: MissionSummary = {
      active: Object.keys(activeMissions).length,
      complete: strikeLog.filter((e) => e.status === "complete").length,
      aborted: strikeLog.filter((e) => e.status === "aborted").length,
    };

    return {
      factions: factionStats,
      kdRatio,
      missionSummary,
      recentEvents: strikeLog.slice(0, 50),
      tick,
    };
  }, [assets, factions, activeMissions, strikeLog, tick]);
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/use-overview-stats.ts
git commit -m "feat(overview): add useOverviewStats derived stats hook"
```

---

## Task 3: Create `overview/page.tsx`

**Files:**
- Create: `apps/web/src/app/(dashboard)/overview/page.tsx`

- [ ] **Step 1: Create the page file**

Create `apps/web/src/app/(dashboard)/overview/page.tsx` with the full content:

```tsx
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
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the dev server and verify visually**

In a separate terminal (if not already running):

```bash
cd apps/web && npm run dev
```

Open `http://localhost:3000/overview` in a browser. Verify:
- "Overview" tab appears first in the nav, highlighted when active
- Two faction cards side-by-side with colored top borders (blue for BLUFOR, red for REDFOR)
- Each card shows alive count, lost count, and three progress bars
- Mission status row shows Active / Complete / Aborted pill badges and K/D ratio
- Event feed shows "No events yet" before simulation runs; rows appear once the sim produces events
- Simulation controls bar at top (tick counter, speed selector, connection indicator)
- Starting the simulation (`2×` speed) causes event feed rows to populate live

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(dashboard)/overview/page.tsx
git commit -m "feat(overview): add Commander's Dashboard overview page"
```

---

## Done

All three tasks complete. The Commander's Dashboard is live at `/overview`.

**Verification checklist before marking complete:**
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Nav tab "Overview" appears and is active when on `/overview`
- [ ] BLUFOR card has `#00A8DC` top border; REDFOR card has `#FF3031` top border
- [ ] Health bar turns orange below 70%, red below 40%
- [ ] K/D ratio shows `"—"` until at least one BLUFOR asset is destroyed
- [ ] K/D ratio text turns green when > 1, red when < 1
- [ ] Event feed populates in real time as missions complete/abort
- [ ] Counterattack events show in red, complete in green, aborted in amber
