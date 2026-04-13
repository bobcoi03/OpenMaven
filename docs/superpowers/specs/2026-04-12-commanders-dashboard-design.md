# Commander's Dashboard — Design Spec

**Date:** 2026-04-12
**Branch:** `feat/ui-tactical-overlays`
**Approach:** Page + dedicated stats hook (Option B)

---

## Scope

Add a top-level "Overview" tab to OpenMaven giving the commander a high-level battle picture. Currently the only operational view is the detail-first Map — there is no KPI summary, no faction health comparison, and no live event feed. This feature adds a dedicated dashboard page that pulls entirely from existing simulation state with no backend changes.

**In scope:**
- BLUFOR vs REDFOR KPI cards (assets alive, assets destroyed, average health %)
- Faction readiness bars (morale, capability, composite readiness) from `SimFaction`
- Kill/death ratio (REDFOR destroyed ÷ BLUFOR destroyed)
- Mission status summary (active, complete, aborted counts)
- Live event feed (scrollable list of recent `strikeLog` entries, capped at 50)
- "Overview" nav tab added to `app-shell.tsx` (first tab, before "Map")

**Out of scope:**
- Historical time-series charts or sparklines (no persistence layer)
- Replay / scrubbing (Feature A, deferred)
- Audio alerts or additional notification hooks

---

## Files

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/lib/use-overview-stats.ts` | **Create** | Accepts simulation state slices, returns `OverviewStats` via `useMemo` |
| `apps/web/src/app/(dashboard)/overview/page.tsx` | **Create** | Calls `useSimulation()` + `useOverviewStats()`, renders full layout |
| `apps/web/src/components/app-shell.tsx` | **Modify** | Add "Overview" tab to `TABS` array, positioned first |

No backend changes. No new contexts. No additional component files.

---

## Data Model

### `useOverviewStats` inputs

The hook is called from the page and receives four slices already returned by `useSimulation()`:

```ts
interface UseOverviewStatsInput {
  assets: Record<string, SimAsset>
  factions: Record<string, SimFaction>
  activeMissions: Record<string, MissionUpdate>
  strikeLog: StrikeLogEntry[]
  tick: number
}
```

### `OverviewStats` output

```ts
interface FactionStats {
  factionId: string
  name: string
  side: string           // "BLUFOR" | "REDFOR" (from SimFaction.side)
  totalAssets: number
  aliveAssets: number
  destroyedAssets: number
  avgHealthPct: number   // 0–100; mean of (asset.health * 100) for alive assets; 0 if none alive
  morale: number         // 0–1 from SimFaction.morale
  capability: number     // 0–1 from SimFaction.capability
  readiness: number      // (morale + capability) / 2
}

interface MissionSummary {
  active: number    // Object.keys(activeMissions).length
  complete: number  // strikeLog entries where status === "complete"
  aborted: number   // strikeLog entries where status === "aborted"
}

interface OverviewStats {
  factions: FactionStats[]       // always ordered BLUFOR first, REDFOR second
  kdRatio: number | null         // destroyedCount(REDFOR) / destroyedCount(BLUFOR); null when BLUFOR destroyed === 0
  missionSummary: MissionSummary
  recentEvents: StrikeLogEntry[] // strikeLog.slice(0, 50) — already newest-first from use-simulation
  tick: number
}
```

### Faction bucketing

1. Iterate `Object.values(factions)`.
2. For each faction, filter `Object.values(assets)` where `asset.faction_id === faction.faction_id`.
3. Compute per-faction stats from that filtered asset list.
4. Sort output `factions` array: entry with `side === "BLUFOR"` first; `side === "REDFOR"` second; any others appended.

### K/D ratio

```
kdRatio = destroyedCount(REDFOR) / destroyedCount(BLUFOR)
```

Returns `null` when `BLUFOR destroyed === 0` to avoid division by zero. Displayed as e.g. `"3.2 : 1"` when > 1 (BLUFOR advantage) or `"0.5 : 1"` when < 1.

---

## `use-overview-stats.ts`

Pure derived hook — no WebSocket, no side effects, no state. Single `useMemo` keyed on all four input slices.

```ts
export function useOverviewStats(input: UseOverviewStatsInput): OverviewStats {
  return useMemo(() => {
    // 1. Build per-faction stats
    // 2. Compute kdRatio
    // 3. Compute missionSummary
    // 4. Slice recentEvents
    return { factions, kdRatio, missionSummary, recentEvents, tick: input.tick }
  }, [input.assets, input.factions, input.activeMissions, input.strikeLog, input.tick])
}
```

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  SimulationControls (reused component)                          │
├──────────────────────────┬──────────────────────────────────────┤
│  BLUFOR                  │  REDFOR                              │
│  ■ 8 alive  □ 2 lost     │  ■ 5 alive  □ 4 lost                │
│  Avg health  ████░  72%  │  Avg health  ██░░░  38%             │
│  Readiness   █████  84%  │  Readiness   ███░░  61%             │
│  Morale      ████░  76%  │  Morale      ██░░░  44%             │
├──────────────────────────┴──────────────────────────────────────┤
│  MISSION STATUS                              K/D RATIO          │
│  [Active: 2]  [Complete: 7]  [Aborted: 1]   3.2 : 1            │
├─────────────────────────────────────────────────────────────────┤
│  LIVE EVENT FEED                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ● T+142  ALPHA → EnemyBravo  complete  ✓                │  │
│  │  ● T+138  STRIKER hit  retaliation — 72% health          │  │
│  │  ● T+133  New contact  34.21°N, 42.88°E — 91%            │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Top bar

`<SimulationControls>` is **reused** from `@/components/simulation-controls`, passing `sim.connected`, `sim.tick`, `sim.speed`, `sim.setSpeed`, asset count, and `sim.pendingEvents` — identical to Map page usage.

### Faction KPI cards

Two-column CSS grid (`grid-cols-2 gap-4`). Each card:
- Background: `var(--om-bg-elevated)`, border: `var(--om-border)`
- **Colored top border** (3px): `var(--om-friendly)` `#00A8DC` for BLUFOR; `var(--om-hostile)` `#FF3031` for REDFOR
- Header row: faction name (bold, `var(--om-text-primary)`) + side badge (small caps, muted)
- Asset count row: alive count prominent, destroyed count muted with a ✕ prefix
- Three progress bars stacked (Avg Health, Readiness, Morale), each labeled + percentage

**Progress bar:** simple `<div>` pair — outer `bg-[var(--om-bg-surface)] h-1.5 rounded-full`, inner filled div with `transition-[width] duration-500`. Colors: health → `var(--om-green)` / `var(--om-orange)` / `var(--om-red)` based on value thresholds; readiness/morale → `var(--om-blue)`.

Health color thresholds:
- ≥ 70% → `var(--om-green)`
- 40–69% → `var(--om-orange)`
- < 40% → `var(--om-red)`

### Mission status + K/D row

Single flex row below the faction cards:
- Left: three pill badges — Active (blue), Complete (green), Aborted (amber) — matching the badge style in `decisions/page.tsx`
- Right (ml-auto): K/D ratio. Label "K/D" muted, value prominent. When `kdRatio === null` display `"—"`. When > 1 color `var(--om-green-light)`; when < 1 color `var(--om-red-light)`; when exactly 1 use `var(--om-text-primary)`.

### Live event feed

`max-h-96 overflow-y-auto` scrollable list below the mission row. Each entry is one `StrikeLogEntry`:

| Field | Display |
|-------|---------|
| Status color dot | green = complete, amber = aborted/en_route, red = counterattack |
| `T+{tick}` | Muted, monospace, right-aligned in its column |
| Description | `"{shooter_callsign} → {target_callsign}"` or `"counterattack on {target_callsign}"` |
| Status chip | Small `<span>` pill, same color as dot |

Empty state: `"No events yet"` centered, muted, when `recentEvents.length === 0`.

Feed does **not** auto-scroll to new items — user controls scroll position. New entries appear at the top (strikeLog is already newest-first).

---

## Nav Tab

In `app-shell.tsx`, add to the `TABS` array as the **first entry**:

```ts
{ name: "Overview", href: "/overview", icon: LayoutDashboard },
```

`LayoutDashboard` is already available in `lucide-react`. Position it before `"Map"` so it is the default landing tab for the dashboard group.

---

## Design Tokens Used

All styling uses existing `--om-*` CSS variables and the inline `T` object pattern from `decisions/page.tsx`. No new CSS files, no new Tailwind config.

Key tokens:
- Backgrounds: `--om-bg-deep`, `--om-bg-elevated`, `--om-bg-surface`
- Borders: `--om-border`, `--om-border-strong`
- Text: `--om-text-primary`, `--om-text-secondary`, `--om-text-muted`
- Faction accents: `--om-friendly` (#00A8DC), `--om-hostile` (#FF3031)
- Status colors: `--om-green`, `--om-green-light`, `--om-orange`, `--om-orange-light`, `--om-red`, `--om-red-light`, `--om-blue`, `--om-blue-light`

---

## No Backend Changes

All data arrives over the existing WebSocket connection via `useSimulation()`. The dashboard page calls `useSimulation()` independently (same pattern as Map page — each page manages its own hook instance and WebSocket connection).
