# Feature C: SIGINT / Comms Intelligence Feed — Design Spec

**Date:** 2026-04-12
**Branch:** `feat/ui-tactical-overlays`
**Status:** Approved — ready for implementation planning

---

## Overview

Feature C surfaces the `comms_intelligence` signal domain as a live intercept feed. The simulation engine is extended to generate `SigintIntercept` events each tick — enemy assets emit comms, the existing `JAMMER-01` EW asset detects and intercepts them. Intercepts flow through the existing WebSocket `diff` payload and are displayed on a dedicated `/sigint` page and as pulse rings on the `/map` page.

---

## Decisions

| Question | Choice | Rationale |
|---|---|---|
| Data source | Extend simulation engine | Intercepts tied to real asset positions; EW asset has a meaningful role; no new infrastructure. Designed so a Kafka consumer can replace the sim generator later with no frontend changes. |
| UI home | Dedicated `/sigint` page | Map page is already crowded. Full page gives the feed room. |
| Page layout | Full-width feed (Overview pattern) | `SimulationControls` + stats bar + scrollable intercept list. |
| Row richness | Rich two-line rows | Line 1: callsign + freq band + signal type + confidence. Line 2: coordinates + intercepting asset + threat level badge. |
| Map integration | `useMapSigintPulse` hook on `/map` | Since `sigint_intercepts` is in the WS diff, the map page gets it free from its own `useSimulation()` call. No shared context needed. |

---

## Backend

### 1. New model: `SigintIntercept`

File: `apps/api/simulation/sigint.py` (new)

```python
from pydantic import BaseModel

class SigintIntercept(BaseModel):
    intercept_id: str           # uuid4
    tick: int
    emitter_asset_id: str       # e.g. "red-hostile-t72-01"
    emitter_callsign: str       # e.g. "HOSTILE-T72-01"
    intercepted_by_id: str      # e.g. "blue-jammer-01"
    intercepted_by_callsign: str
    lat: float
    lon: float
    frequency_band: str         # VHF | UHF | SHF | EHF
    signal_type: str            # voice | encrypted_voice | data_burst | encrypted_data
    confidence: float           # 0.0–1.0, scaled by distance from EW asset
    threat_level: str           # HIGH (>0.7) | MED (0.4–0.7) | LOW (<0.4)
```

### 2. Frequency band assignment

| Asset category | Band |
|---|---|
| Ground vehicles, infantry | VHF |
| Aircraft, helicopters | UHF |
| Naval assets | SHF |
| Command, EW, ISR assets | EHF |

Derived from `asset_type` string at intercept time — no new asset fields required.

### 3. Signal type assignment

| Asset profile | Signal type |
|---|---|
| Standard ground / air | `voice` |
| Command assets, ISR (AWACS, Global Hawk) | `encrypted_voice` |
| Data-link equipped (EW, sensor platforms) | `data_burst` |
| Advanced Russian assets (Su-57, T-14, S-400) | `encrypted_data` |

Derived from `asset_type` at intercept time.

### 4. `compute_sigint_intercepts()` — called each tick

File: `apps/api/simulation/sigint.py`

```
1. Find all blue-side EW assets (asset_type contains "EW" or "Jammer" — matches "EW Radar Vehicle"; avoids false-positives on fighter AESA radar strings)
2. For each enemy (non-blue, non-civilian) asset:
   a. For each EW asset: compute haversine distance
   b. If distance <= ew_intercept_range_km:
      - Roll emission_probability (default 0.15; AGGRESSIVE doctrine factions: 0.20)
      - If roll passes → generate SigintIntercept
        - confidence = 1.0 - (dist / ew_intercept_range_km)
        - threat_level = HIGH if confidence > 0.7, MED if > 0.4, else LOW
3. Return list[SigintIntercept]
```

EW intercept range is derived from the asset's existing `sensor_range_km` field — no new asset fields.

### 5. `StateDiff` extension

File: `apps/api/simulation/manager.py`

```python
class StateDiff(BaseModel):
    ...
    sigint_intercepts: list[SigintIntercept] = []
```

`compute_sigint_intercepts()` called inside `_run_tick()`, result appended to the diff before broadcast. Snapshot (`get_snapshot()`) returns `sigint_intercepts: []` — intercepts are streaming-only, not persisted.

---

## Frontend

### 1. New TypeScript interface

File: `apps/web/src/lib/use-simulation.ts`

```typescript
export interface SigintIntercept {
  intercept_id: string;
  tick: number;
  emitter_asset_id: string;
  emitter_callsign: string;
  intercepted_by_id: string;
  intercepted_by_callsign: string;
  lat: number;
  lon: number;
  frequency_band: string;
  signal_type: string;
  confidence: number;
  threat_level: "HIGH" | "MED" | "LOW";
}
```

`StateDiff` extended with `sigint_intercepts?: SigintIntercept[]`.

### 2. `use-simulation.ts` changes

- `sigintIntercepts: SigintIntercept[]` state, initialized `[]`
- In `handleMessage` diff branch: prepend new intercepts, cap ring-buffer to 50 (same pattern as `strikeLog`)
- HIGH confidence intercepts (`threat_level === "HIGH"`) fire `addNotification`:
  - `severity: "amber"`
  - `title: "SIGINT — High confidence intercept"`
  - `body: "${callsign} · ${frequency_band} · ${Math.round(confidence * 100)}%"`
  - `assetLon`, `assetLat` set so notification click flies the map to the intercept location
- `UseSimulationReturn` exposes `sigintIntercepts: SigintIntercept[]`

### 3. New derived hook: `use-sigint-stats.ts`

File: `apps/web/src/lib/use-sigint-stats.ts`

Pure `useMemo` hook — no side effects, same pattern as `useOverviewStats`.

```typescript
interface UseSigintStatsOptions {
  sigintIntercepts: SigintIntercept[];
  assets: Record<string, SimAsset>;
  tick: number;
}

export interface SigintStats {
  totalIntercepts: number;
  highConfCount: number;       // threat_level === "HIGH"
  activeEwAssets: number;      // distinct intercepted_by_id values seen in last 10 ticks
  recentIntercepts: SigintIntercept[];  // last 20, newest first
}
```

### 4. `/sigint` page

File: `apps/web/src/app/(dashboard)/sigint/page.tsx`

**Structure:**
```
SigintPage
├── SimulationControls              ← reused, identical to Overview/Map
├── Stats bar (flex row)
│   ├── "INTERCEPTS: N"  (blue chip)
│   ├── "HIGH CONF: N"   (red chip)
│   └── "ACTIVE EW: N"   (amber chip)
└── Intercept feed (flex-1, overflow-y-auto)
    ├── Feed header "INTERCEPT FEED"
    └── InterceptRow × N
```

**`InterceptRow` — two-line layout:**
```
Line 1: [dot] [T+tick] [FREQ BAND] [CALLSIGN · signal_type]       [confidence%]
Line 2:        [lat°N lon°E]  [intercepted by CALLSIGN]            [HIGH/MED/LOW badge]
```

- Confidence dot + badge color: red = HIGH (`T.redLt`), amber = MED (`T.orangeLt`), green = LOW (`T.greenLt`)
- Freq band rendered in `T.blueLt` as a fixed-width `w-[28px]` chip
- `max-h` set to fill remaining viewport height; empty state: `"No intercepts yet — simulation may be paused"` centered in `T.textMuted`
- Local `const T = { ... }` token object — no CSS vars (established pattern from Overview/Decisions pages)

### 5. Nav tab

File: `apps/web/src/components/app-shell.tsx`

```typescript
{ name: "SIGINT", href: "/sigint", icon: Radio }
```

Inserted after `Overview`, before `Map`. `Radio` imported from `lucide-react`.

### 6. Map pulse rings

File: `apps/web/src/lib/map/use-map-sigint-pulse.ts`

DOM-based hook, same architecture as `useMapSensorCircles`:
- Registers `map.on("render", updatePulses)` callback
- Uses `map.project([lon, lat])` to convert intercept coords to screen pixels each frame
- Each active intercept renders two DOM elements appended to `containerRef`:
  - **Inner dot:** 8px filled circle, color by threat level
  - **Outer ring:** CSS `animation: sigint-pulse 2s ease-out forwards` — expands outward and fades
- Rings keyed by `intercept_id`, pruned when `currentTick - intercept.tick > PULSE_TTL` (10 ticks)
- Ring size scales with confidence: `basePx(12) + confidence * 12`

**Toggle:** `showSigintPulse: boolean` prop. Wired to a `"SIGINT"` button in the map page HUD (same style as existing `"Sensors"` toggle).

**Wiring:**
- `map-view-inner.tsx` — calls `useMapSigintPulse(mapRef, containerRef, { sigintIntercepts, showSigintPulse })`
- `map-view.tsx` — passes `sigintIntercepts` and `showSigintPulse` props through
- `map/page.tsx` — `const [showSigintPulse, setShowSigintPulse] = useState(true)`, reads `sim.sigintIntercepts`
- `apps/web/src/lib/map/index.ts` — exports `useMapSigintPulse`

---

## Data flow

```
sim tick
  └─ compute_sigint_intercepts()
       └─ StateDiff.sigint_intercepts = [...]
            └─ WS broadcast { type: "diff", data: { sigint_intercepts: [...] } }
                 └─ use-simulation.ts handleMessage
                      ├─ setSigintIntercepts (prepend, cap 50)
                      └─ HIGH conf → addNotification (amber)
                           └─ /sigint page  ← useSimulation() → useSigintStats()
                           └─ /map page     ← useSimulation() → useMapSigintPulse()
```

---

## Scope boundary

Feature C does **not** include:
- Kafka consumer for `comms_intelligence` topic (designed as a future drop-in replacement for `compute_sigint_intercepts`)
- Click-to-focus intercept on map from the `/sigint` page (the notification tray already handles this for HIGH-conf intercepts)
- Filtering or searching the intercept feed
- Persistence of intercepts across page navigation (streaming only)
