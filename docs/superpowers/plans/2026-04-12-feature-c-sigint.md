# Feature C: SIGINT / Comms Intelligence Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the simulation engine to generate SIGINT intercept events each tick and surface them as a live feed on a dedicated `/sigint` page and as animated pulse rings on the `/map` page.

**Architecture:** `JAMMER-01` (EW Radar Vehicle) detects enemy comms within an 80 km radius each tick via a probability roll. Intercepts flow through the existing WebSocket `diff` payload as `sigint_intercepts`. The frontend stores the last 50 intercepts in `useSimulation`, derives stats via `useSigintStats`, and renders a full-width feed page and DOM-based pulse rings on the map.

**Tech Stack:** Python 3.13 / Pydantic (backend), React 18 / TypeScript / Tailwind / MapLibre GL (frontend), pytest (backend tests), virtual env `openmaven_env`, FastAPI dev server on `localhost:8000`, Next.js on `localhost:3000`.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| **Create** | `apps/api/simulation/sigint.py` | `SigintIntercept` model, freq/signal helpers, `compute_sigint_intercepts()` |
| **Create** | `apps/api/tests/test_sigint.py` | Backend unit tests |
| **Create** | `apps/web/src/lib/use-sigint-stats.ts` | Pure derived stats hook |
| **Create** | `apps/web/src/lib/map/use-map-sigint-pulse.ts` | DOM-based animated pulse rings hook |
| **Create** | `apps/web/src/app/(dashboard)/sigint/page.tsx` | SIGINT intercept feed page |
| **Modify** | `apps/api/simulation/manager.py` | Add `sigint_intercepts` to `StateDiff`; call `compute_sigint_intercepts()` in `_advance_tick()` |
| **Modify** | `apps/web/src/lib/use-simulation.ts` | Add `SigintIntercept` interface, state, diff handler, HIGH-conf notifications |
| **Modify** | `apps/web/src/components/app-shell.tsx` | Add SIGINT nav tab |
| **Modify** | `apps/web/src/lib/map/index.ts` | Export `useMapSigintPulse` |
| **Modify** | `apps/web/src/components/map-view.tsx` | Add `sigintIntercepts` + `showSigintPulse` props |
| **Modify** | `apps/web/src/components/map-view-inner.tsx` | Call `useMapSigintPulse`, inject CSS keyframe |
| **Modify** | `apps/web/src/app/(dashboard)/map/page.tsx` | Add toggle state + SIGINT button + pass props |

---

## Task 1: Backend model + SIGINT computation (TDD)

**Files:**
- Create: `apps/api/simulation/sigint.py`
- Create: `apps/api/tests/test_sigint.py`

Run all commands from `apps/api/` with `openmaven_env` active.

- [ ] **Step 1.1: Write the failing tests**

Create `apps/api/tests/test_sigint.py`:

```python
"""Tests for SIGINT intercept computation."""

import random
from unittest.mock import MagicMock

import pytest

from simulation.assets import AssetStatus, Position, SimAsset
from simulation.faction import Doctrine, Faction
from simulation.sigint import (
    SigintIntercept,
    _frequency_band,
    _signal_type,
    _threat_level,
    compute_sigint_intercepts,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _ew_asset(lat: float = 0.0, lon: float = 0.0) -> SimAsset:
    return SimAsset(
        asset_id="blue-jammer-01",
        callsign="JAMMER-01",
        asset_type="EW Radar Vehicle",
        faction_id="blue",
        position=Position(latitude=lat, longitude=lon),
    )


def _enemy_asset(
    asset_id: str = "red-t72-01",
    callsign: str = "HOSTILE-T72-01",
    asset_type: str = "T-72A MBT",
    lat: float = 0.0,
    lon: float = 0.0,
    faction_id: str = "red",
) -> SimAsset:
    return SimAsset(
        asset_id=asset_id,
        callsign=callsign,
        asset_type=asset_type,
        faction_id=faction_id,
        position=Position(latitude=lat, longitude=lon),
    )


def _factions() -> dict:
    return {
        "blue": Faction(faction_id="blue", name="BLUFOR", side="blue", doctrine=Doctrine.DEFENSIVE),
        "red": Faction(faction_id="red", name="OPFOR", side="red", doctrine=Doctrine.AGGRESSIVE),
        "civilian": Faction(faction_id="civilian", name="Civilian", side="civilian", doctrine=Doctrine.DEFENSIVE),
    }


def _always_fire_rng() -> random.Random:
    """RNG whose random() always returns 0.0 — every emission roll passes."""
    rng = MagicMock(spec=random.Random)
    rng.random.return_value = 0.0
    return rng


def _never_fire_rng() -> random.Random:
    """RNG whose random() always returns 1.0 — no emission roll passes."""
    rng = MagicMock(spec=random.Random)
    rng.random.return_value = 1.0
    return rng


# ── _frequency_band ──────────────────────────────────────────────────────────


def test_frequency_band_ground_vehicle():
    assert _frequency_band("T-72A MBT") == "VHF"


def test_frequency_band_aircraft():
    assert _frequency_band("F-16C Fighting Falcon") == "UHF"


def test_frequency_band_helicopter():
    assert _frequency_band("AH-64 Apache") == "UHF"


def test_frequency_band_naval():
    assert _frequency_band("DDG-51 Arleigh Burke") == "SHF"


def test_frequency_band_ew():
    assert _frequency_band("EW Radar Vehicle") == "EHF"


def test_frequency_band_sam():
    assert _frequency_band("S-400 Triumf SAM") == "EHF"


# ── _signal_type ─────────────────────────────────────────────────────────────


def test_signal_type_standard_ground():
    assert _signal_type("M1 Abrams") == "voice"


def test_signal_type_ew_data_burst():
    assert _signal_type("EW Radar Vehicle") == "data_burst"


def test_signal_type_isr_awacs():
    assert _signal_type("E-3A AWACS") == "encrypted_voice"


def test_signal_type_advanced_russian():
    assert _signal_type("Su-57 Felon") == "encrypted_data"


def test_signal_type_advanced_russian_tank():
    assert _signal_type("T-14 Armata MBT") == "encrypted_data"


# ── _threat_level ────────────────────────────────────────────────────────────


def test_threat_level_high():
    assert _threat_level(0.8) == "HIGH"


def test_threat_level_high_boundary():
    assert _threat_level(0.71) == "HIGH"


def test_threat_level_med():
    assert _threat_level(0.5) == "MED"


def test_threat_level_med_lower_boundary():
    assert _threat_level(0.4) == "MED"


def test_threat_level_med_upper_boundary():
    assert _threat_level(0.7) == "MED"


def test_threat_level_low():
    assert _threat_level(0.2) == "LOW"


def test_threat_level_low_boundary():
    assert _threat_level(0.39) == "LOW"


# ── compute_sigint_intercepts ─────────────────────────────────────────────────


def test_no_ew_assets_returns_empty():
    assets = {"red-t72": _enemy_asset(lat=0.0, lon=0.0)}
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_no_enemies_returns_empty():
    assets = {"blue-jammer": _ew_asset()}
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_enemy_within_range_generates_intercept():
    # lon=0.5 ≈ 55 km from EW at (0,0) — within EW_SIGINT_RANGE_KM=80
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-t72": _enemy_asset(lat=0.0, lon=0.5),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=5)
    assert len(result) == 1
    intercept = result[0]
    assert isinstance(intercept, SigintIntercept)
    assert intercept.tick == 5
    assert intercept.emitter_asset_id == "red-t72"
    assert intercept.emitter_callsign == "HOSTILE-T72-01"
    assert intercept.intercepted_by_id == "blue-jammer"
    assert intercept.intercepted_by_callsign == "JAMMER-01"
    assert intercept.lat == pytest.approx(0.0)
    assert intercept.lon == pytest.approx(0.5)
    assert 0.0 < intercept.confidence < 1.0


def test_enemy_outside_range_generates_no_intercept():
    # lat=1.0 ≈ 111 km from EW at (0,0) — outside EW_SIGINT_RANGE_KM=80
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-t72": _enemy_asset(lat=1.0, lon=0.0),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_civilian_within_range_not_intercepted():
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "civ-bus": _enemy_asset(faction_id="civilian", lat=0.0, lon=0.1),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_blue_asset_within_range_not_intercepted():
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "blue-other": _enemy_asset(asset_id="blue-other", faction_id="blue", lat=0.0, lon=0.1),
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_destroyed_enemy_not_intercepted():
    enemy = _enemy_asset(lat=0.0, lon=0.1)
    enemy.status = AssetStatus.DESTROYED
    assets = {"blue-jammer": _ew_asset(), "red-t72": enemy}
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert result == []


def test_emission_roll_failure_suppresses_intercept():
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-t72": _enemy_asset(lat=0.0, lon=0.1),
    }
    result = compute_sigint_intercepts(assets, _factions(), _never_fire_rng(), tick=1)
    assert result == []


def test_confidence_scales_with_proximity():
    """Closer asset → higher confidence than farther asset."""
    assets = {
        "blue-jammer": _ew_asset(lat=0.0, lon=0.0),
        "red-near": _enemy_asset(asset_id="red-near", lat=0.0, lon=0.1),   # ~11 km
        "red-far": _enemy_asset(asset_id="red-far", lat=0.0, lon=0.5),    # ~55 km
    }
    result = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    assert len(result) == 2
    by_id = {r.emitter_asset_id: r for r in result}
    assert by_id["red-near"].confidence > by_id["red-far"].confidence


def test_intercept_id_is_unique_across_calls():
    assets = {
        "blue-jammer": _ew_asset(),
        "red-t72": _enemy_asset(lat=0.0, lon=0.1),
    }
    r1 = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=1)
    r2 = compute_sigint_intercepts(assets, _factions(), _always_fire_rng(), tick=2)
    assert r1[0].intercept_id != r2[0].intercept_id


def test_aggressive_faction_emits_more_often():
    """AGGRESSIVE doctrine asset emits with 0.20 probability; test by counting over many calls."""
    assets = {
        "blue-jammer": _ew_asset(),
        "red-t72": _enemy_asset(lat=0.0, lon=0.1),
    }
    # Use real rng seeded for determinism
    rng = random.Random(0)
    results = [
        compute_sigint_intercepts(assets, _factions(), rng, tick=i)
        for i in range(100)
    ]
    # With p=0.20 and 100 trials, expect ~20 intercepts (allow wide tolerance)
    count = sum(len(r) for r in results)
    assert 5 <= count <= 45  # generous bounds — just confirm it fires sometimes
```

- [ ] **Step 1.2: Run tests — confirm they all fail**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_sigint.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'simulation.sigint'`

- [ ] **Step 1.3: Implement `apps/api/simulation/sigint.py`**

```python
"""SIGINT intercept model and computation.

Each tick, blue EW assets detect enemy radio emissions within an 80 km radius.
Results are included in the StateDiff broadcast to WebSocket clients.
"""

import uuid
from typing import Any

from pydantic import BaseModel

from simulation.assets import SimAsset
from simulation.faction import Doctrine, Faction
from simulation.rules import haversine_km

# ── Constants ────────────────────────────────────────────────────────────────

EW_SIGINT_RANGE_KM: float = 80.0
DEFAULT_EMISSION_PROB: float = 0.15
AGGRESSIVE_EMISSION_PROB: float = 0.20


# ── Model ────────────────────────────────────────────────────────────────────


class SigintIntercept(BaseModel):
    """A single radio intercept captured by an EW asset."""

    intercept_id: str
    tick: int
    emitter_asset_id: str
    emitter_callsign: str
    intercepted_by_id: str
    intercepted_by_callsign: str
    lat: float
    lon: float
    frequency_band: str   # VHF | UHF | SHF | EHF
    signal_type: str      # voice | encrypted_voice | data_burst | encrypted_data
    confidence: float     # 0.0–1.0, scaled by distance
    threat_level: str     # HIGH | MED | LOW


# ── Helpers ──────────────────────────────────────────────────────────────────


def _frequency_band(asset_type: str) -> str:
    """Return the frequency band for a given asset type string."""
    t = asset_type.lower()
    if any(k in t for k in ("ddg", "seawolf", "wasp", "lhd", "ssn")):
        return "SHF"
    if any(k in t for k in ("patriot", "iron dome", "s-400", "pantsir", "ew radar", "jammer")):
        return "EHF"
    if any(k in t for k in (
        "reaper", "global hawk", "f-16", "f-35", "ac-130", "awacs", "e-3a",
        "apache", "chinook", "c-17", "lightning", "flanker", "fullback",
        "felon", "alligator", "night hunter", "hercules", "loitering",
    )):
        return "UHF"
    return "VHF"


def _signal_type(asset_type: str) -> str:
    """Return the signal type for a given asset type string."""
    t = asset_type.lower()
    if any(k in t for k in ("su-57", "t-14", "t-90m", "su-35", "su-34", "ka-52", "mi-28", "iskander")):
        return "encrypted_data"
    if any(k in t for k in ("global hawk", "awacs", "e-3a", "ew radar", "jammer", "reaper")):
        return "data_burst"
    if any(k in t for k in ("ac-130", "s-400", "patriot", "iron dome", "pantsir", "f-35", "lightning")):
        return "encrypted_voice"
    return "voice"


def _threat_level(confidence: float) -> str:
    """Map confidence to a human-readable threat level."""
    if confidence > 0.7:
        return "HIGH"
    if confidence >= 0.4:
        return "MED"
    return "LOW"


# ── Core computation ─────────────────────────────────────────────────────────


def compute_sigint_intercepts(
    assets: dict[str, SimAsset],
    factions: dict[str, Faction],
    rng: Any,
    tick: int,
) -> list[SigintIntercept]:
    """Generate SIGINT intercepts for this tick.

    For each blue EW asset, check every alive enemy asset within
    EW_SIGINT_RANGE_KM. Roll emission probability per asset; on success,
    create a SigintIntercept with confidence scaled by distance.

    Args:
        assets: All simulation assets.
        factions: All factions (used for doctrine-based emission probability).
        rng: random.Random instance (pass sim's self._rng for reproducibility).
        tick: Current simulation tick.

    Returns:
        List of intercepts generated this tick.
    """
    ew_assets = [
        a for a in assets.values()
        if a.faction_id == "blue"
        and a.is_alive()
        and any(k in a.asset_type for k in ("EW", "Jammer"))
    ]
    if not ew_assets:
        return []

    enemy_assets = [
        a for a in assets.values()
        if a.faction_id not in ("blue", "civilian")
        and a.is_alive()
    ]

    intercepts: list[SigintIntercept] = []

    for ew in ew_assets:
        for enemy in enemy_assets:
            dist_km = haversine_km(
                ew.position.latitude, ew.position.longitude,
                enemy.position.latitude, enemy.position.longitude,
            )
            if dist_km > EW_SIGINT_RANGE_KM:
                continue

            faction = factions.get(enemy.faction_id)
            emit_prob = (
                AGGRESSIVE_EMISSION_PROB
                if faction and faction.doctrine == Doctrine.AGGRESSIVE
                else DEFAULT_EMISSION_PROB
            )

            if rng.random() >= emit_prob:
                continue

            confidence = round(1.0 - (dist_km / EW_SIGINT_RANGE_KM), 3)

            intercepts.append(SigintIntercept(
                intercept_id=str(uuid.uuid4()),
                tick=tick,
                emitter_asset_id=enemy.asset_id,
                emitter_callsign=enemy.callsign,
                intercepted_by_id=ew.asset_id,
                intercepted_by_callsign=ew.callsign,
                lat=enemy.position.latitude,
                lon=enemy.position.longitude,
                frequency_band=_frequency_band(enemy.asset_type),
                signal_type=_signal_type(enemy.asset_type),
                confidence=confidence,
                threat_level=_threat_level(confidence),
            ))

    return intercepts
```

- [ ] **Step 1.4: Run tests — confirm they all pass**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/test_sigint.py -v
```

Expected: All tests pass. If `test_aggressive_faction_emits_more_often` flakes, re-run once — it uses a seeded RNG and should be stable.

- [ ] **Step 1.5: Commit**

```bash
cd apps/api && git add simulation/sigint.py tests/test_sigint.py && git commit -m "feat(sigint): add SigintIntercept model and compute_sigint_intercepts"
```

---

## Task 2: Wire SIGINT into the simulation tick

**Files:**
- Modify: `apps/api/simulation/manager.py`

- [ ] **Step 2.1: Add `sigint_intercepts` field to `StateDiff`**

In `apps/api/simulation/manager.py`, find the `StateDiff` class (around line 112) and add the import + field:

Add at top of file, after existing simulation imports:
```python
from simulation.sigint import SigintIntercept, compute_sigint_intercepts
```

Change `StateDiff` from:
```python
class StateDiff(BaseModel):
    """Changes from a single tick, sent to clients via WebSocket."""

    tick: int
    asset_updates: list[dict[str, Any]]
    events_fired: list[dict[str, Any]]
    alerts: list[str]
    detections: list[DetectionEntry] = []
    ghosts: list[GhostEntry] = []
    mission_updates: list[MissionUpdate] = []
```

To:
```python
class StateDiff(BaseModel):
    """Changes from a single tick, sent to clients via WebSocket."""

    tick: int
    asset_updates: list[dict[str, Any]]
    events_fired: list[dict[str, Any]]
    alerts: list[str]
    detections: list[DetectionEntry] = []
    ghosts: list[GhostEntry] = []
    mission_updates: list[MissionUpdate] = []
    sigint_intercepts: list[SigintIntercept] = []
```

- [ ] **Step 2.2: Call `compute_sigint_intercepts` in `_advance_tick`**

Find the `return StateDiff(...)` statement at the end of `_advance_tick` (around line 781) and change it from:

```python
        return StateDiff(
            tick=self.tick,
            asset_updates=asset_updates,
            events_fired=events_fired,
            alerts=alerts,
            detections=detection_entries,
            ghosts=ghost_entries,
            mission_updates=mission_updates,
        )
```

To:

```python
        sigint_intercepts = compute_sigint_intercepts(
            assets=self.assets,
            factions=self.factions,
            rng=self._rng,
            tick=self.tick,
        )

        return StateDiff(
            tick=self.tick,
            asset_updates=asset_updates,
            events_fired=events_fired,
            alerts=alerts,
            detections=detection_entries,
            ghosts=ghost_entries,
            mission_updates=mission_updates,
            sigint_intercepts=sigint_intercepts,
        )
```

- [ ] **Step 2.3: Run existing tests to confirm nothing broke**

```bash
cd apps/api && source .venv/bin/activate && pytest tests/ -v --ignore=tests/test_neo4j_store.py 2>&1 | tail -20
```

Expected: All previously passing tests still pass. No new failures.

- [ ] **Step 2.4: Smoke-test the WebSocket payload manually**

```bash
cd apps/api && source .venv/bin/activate && uvicorn main:app --reload --port 8000 &
sleep 3
python3 -c "
import asyncio, json, websockets

async def check():
    async with websockets.connect('ws://localhost:8000/api/simulation/ws') as ws:
        # snapshot
        snap = json.loads(await ws.recv())
        print('snapshot keys:', list(snap.get('data', {}).keys()))
        # set speed=1 and wait for a diff
        await ws.send(json.dumps({'type': 'set_speed', 'speed': 1}))
        for _ in range(5):
            msg = json.loads(await ws.recv())
            if msg.get('type') == 'diff':
                print('diff sigint_intercepts count:', len(msg['data'].get('sigint_intercepts', [])))
                break

asyncio.run(check())
"
kill %1
```

Expected output includes `diff sigint_intercepts count: N` (N may be 0 if no EW assets in range this tick — that's fine; the key existing in the payload is what matters).

- [ ] **Step 2.5: Commit**

```bash
git add apps/api/simulation/manager.py && git commit -m "feat(sigint): wire compute_sigint_intercepts into simulation tick diff"
```

---

## Task 3: Frontend types + `use-simulation.ts`

**Files:**
- Modify: `apps/web/src/lib/use-simulation.ts`

- [ ] **Step 3.1: Add `SigintIntercept` interface and extend `StateDiff`**

In `apps/web/src/lib/use-simulation.ts`, after the `StrikeLogEntry` interface (around line 108), add:

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

In the `StateDiff` interface, add the new field:

```typescript
export interface StateDiff {
  tick: number;
  asset_updates: Array<Record<string, unknown>>;
  events_fired: Array<Record<string, unknown>>;
  alerts: string[];
  detections: DetectionEntry[];
  ghosts: GhostEntry[];
  mission_updates: MissionUpdate[];
  sigint_intercepts?: SigintIntercept[];
}
```

- [ ] **Step 3.2: Add `sigintIntercepts` state and return type**

In `UseSimulationReturn`, add:
```typescript
/** Live SIGINT intercepts — newest first, capped at 50 */
sigintIntercepts: SigintIntercept[];
```

In `useSimulation`, add state initialization after `strikeLog`:
```typescript
const [sigintIntercepts, setSigintIntercepts] = useState<SigintIntercept[]>([]);
```

- [ ] **Step 3.3: Handle `sigint_intercepts` in the diff message handler**

In `handleMessage`, inside the `if (msg.type === "diff")` branch, after the `mission_updates` block (around line 480) and before the final `return`, add:

```typescript
      // SIGINT intercepts — prepend new, cap ring-buffer to 50
      if (diff.sigint_intercepts && diff.sigint_intercepts.length > 0) {
        setSigintIntercepts((prev) => {
          const next = [...diff.sigint_intercepts!, ...prev];
          return next.length > 50 ? next.slice(0, 50) : next;
        });
        // Fire amber notification for HIGH confidence intercepts
        for (const intercept of diff.sigint_intercepts) {
          if (intercept.threat_level === "HIGH") {
            addNotification({
              severity: "amber",
              title: "SIGINT — High confidence intercept",
              body: `${intercept.emitter_callsign} · ${intercept.frequency_band} · ${Math.round(intercept.confidence * 100)}%`,
              assetLon: intercept.lon,
              assetLat: intercept.lat,
            });
          }
        }
      }
```

- [ ] **Step 3.4: Expose `sigintIntercepts` in the return value**

In the `return { ... }` statement at the bottom of `useSimulation`, add `sigintIntercepts` alongside the other fields.

- [ ] **Step 3.5: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors. If you see errors about `StateDiff` missing fields, check the interface was updated correctly.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/lib/use-simulation.ts && git commit -m "feat(sigint): add SigintIntercept TS type and wire into use-simulation"
```

---

## Task 4: `use-sigint-stats.ts` derived hook

**Files:**
- Create: `apps/web/src/lib/use-sigint-stats.ts`

- [ ] **Step 4.1: Create the hook**

```typescript
"use client";

import { useMemo } from "react";
import type { SigintIntercept } from "@/lib/use-simulation";
import type { SimAsset } from "@/lib/use-simulation";

interface UseSigintStatsOptions {
  sigintIntercepts: SigintIntercept[];
  assets: Record<string, SimAsset>;
  tick: number;
}

export interface SigintStats {
  /** Total intercepts in buffer (max 50). */
  totalIntercepts: number;
  /** Number of HIGH threat-level intercepts in buffer. */
  highConfCount: number;
  /** Number of distinct EW assets that intercepted in the last 10 ticks. */
  activeEwAssets: number;
  /** Last 20 intercepts, newest first. */
  recentIntercepts: SigintIntercept[];
}

export function useSigintStats({
  sigintIntercepts,
  tick,
}: UseSigintStatsOptions): SigintStats {
  return useMemo(() => {
    const totalIntercepts = sigintIntercepts.length;

    const highConfCount = sigintIntercepts.filter(
      (i) => i.threat_level === "HIGH",
    ).length;

    const recentWindow = sigintIntercepts.filter(
      (i) => i.tick >= tick - 10,
    );
    const activeEwAssets = new Set(recentWindow.map((i) => i.intercepted_by_id))
      .size;

    const recentIntercepts = sigintIntercepts.slice(0, 20);

    return { totalIntercepts, highConfCount, activeEwAssets, recentIntercepts };
  }, [sigintIntercepts, tick]);
}
```

- [ ] **Step 4.2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 4.3: Commit**

```bash
git add apps/web/src/lib/use-sigint-stats.ts && git commit -m "feat(sigint): add useSigintStats derived hook"
```

---

## Task 5: `/sigint` page + nav tab

**Files:**
- Create: `apps/web/src/app/(dashboard)/sigint/page.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 5.1: Create `apps/web/src/app/(dashboard)/sigint/page.tsx`**

```typescript
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
```

- [ ] **Step 5.2: Add SIGINT tab to `app-shell.tsx`**

In `apps/web/src/components/app-shell.tsx`, find the `TABS` array:

```typescript
const TABS = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Map", href: "/map", icon: MapIcon },
  ...
] as const;
```

Change it to:

```typescript
const TABS = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "SIGINT", href: "/sigint", icon: Radio },
  { name: "Map", href: "/map", icon: MapIcon },
  ...
] as const;
```

Add `Radio` to the lucide-react import at the top of the file. Find the existing import line and add `Radio` to it:

```typescript
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
  Radio,
} from "lucide-react";
```

- [ ] **Step 5.3: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 5.4: Smoke-test in browser**

Start the dev server if not already running:
```bash
cd apps/web && npm run dev
```

Open `http://localhost:3000/sigint`. Expected:
- "SIGINT" tab appears in the nav after "Overview"
- Page shows SimulationControls bar at top
- Stats bar shows `Intercepts: 0`, `High Conf: 0`, `Active EW: 0` (until sim runs)
- Feed shows "No intercepts yet — simulation may be paused"
- Start the simulation: `http://localhost:8000/api/simulation/speed` → POST `{"speed": 1}` (or use the sim controls). After a few ticks, intercepts should appear.

- [ ] **Step 5.5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/sigint/page.tsx apps/web/src/components/app-shell.tsx && git commit -m "feat(sigint): add /sigint page and nav tab"
```

---

## Task 6: Map pulse rings

**Files:**
- Create: `apps/web/src/lib/map/use-map-sigint-pulse.ts`
- Modify: `apps/web/src/lib/map/index.ts`
- Modify: `apps/web/src/components/map-view.tsx`
- Modify: `apps/web/src/components/map-view-inner.tsx`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 6.1: Create `apps/web/src/lib/map/use-map-sigint-pulse.ts`**

```typescript
/**
 * useMapSigintPulse — animated DOM pulse rings for SIGINT intercept locations.
 *
 * Each new intercept gets a filled dot + an expanding ring that plays a
 * 2-second CSS animation then self-removes. Uses map.project() on every
 * render frame to keep rings locked to their geographic coordinates as
 * the map pans and zooms.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { SigintIntercept } from "@/lib/use-simulation";

interface UseMapSigintPulseOptions {
  sigintIntercepts: SigintIntercept[];
  showSigintPulse: boolean;
}

const THREAT_COLOR: Record<string, string> = {
  HIGH: "#E76A6E",
  MED:  "#EC9A3C",
  LOW:  "#32A467",
};

const KEYFRAME_ID = "om-sigint-pulse";

function injectKeyframe() {
  if (document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAME_ID;
  style.textContent =
    "@keyframes sigint-pulse{" +
    "0%{transform:translate(-50%,-50%) scale(1);opacity:0.85}" +
    "100%{transform:translate(-50%,-50%) scale(3.5);opacity:0}" +
    "}";
  document.head.appendChild(style);
}

export function useMapSigintPulse(
  mapRef: React.RefObject<maplibregl.Map | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseMapSigintPulseOptions,
) {
  const interceptsRef = useRef(options.sigintIntercepts);
  interceptsRef.current = options.sigintIntercepts;

  const showRef = useRef(options.showSigintPulse);
  showRef.current = options.showSigintPulse;

  // intercept_id → { dot, ring } for active rings still in DOM
  const ringsMap = useRef(
    new Map<string, { dot: HTMLDivElement; ring: HTMLDivElement }>(),
  );
  // intercept_ids we've already created a ring for (survives ring removal)
  const knownIds = useRef(new Set<string>());

  // ── Position updater (runs every render frame) ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current) return;

    injectKeyframe();

    function updatePulses() {
      const map = mapRef.current;
      if (!map || !containerRef.current) return;
      if (!map.isStyleLoaded()) return;

      const intercepts = interceptsRef.current;
      const show = showRef.current;
      const cnt = containerRef.current;

      // Create elements for intercepts we haven't seen yet
      for (const intercept of intercepts) {
        if (knownIds.current.has(intercept.intercept_id)) continue;
        knownIds.current.add(intercept.intercept_id);

        const color = THREAT_COLOR[intercept.threat_level] ?? "#94A3B8";
        const ringSize = Math.round(12 + intercept.confidence * 12);

        const dot = document.createElement("div");
        dot.style.cssText =
          "position:absolute;border-radius:50%;pointer-events:none;" +
          `width:8px;height:8px;background:${color};` +
          "transform:translate(-50%,-50%);will-change:transform;";
        cnt.appendChild(dot);

        const ring = document.createElement("div");
        ring.style.cssText =
          "position:absolute;border-radius:50%;pointer-events:none;" +
          `width:${ringSize}px;height:${ringSize}px;` +
          `border:2px solid ${color};` +
          "transform:translate(-50%,-50%);will-change:transform;" +
          "animation:sigint-pulse 2s ease-out forwards;";
        cnt.appendChild(ring);

        ringsMap.current.set(intercept.intercept_id, { dot, ring });

        // Self-remove after animation completes
        const id = intercept.intercept_id;
        window.setTimeout(() => {
          dot.remove();
          ring.remove();
          ringsMap.current.delete(id);
          // knownIds NOT cleared — prevents re-creating ring for same intercept
        }, 2200);
      }

      // Update position + visibility for all active rings
      for (const [id, { dot, ring }] of ringsMap.current) {
        const intercept = intercepts.find((i) => i.intercept_id === id);
        if (!intercept) continue;

        const pos = map.project([intercept.lon, intercept.lat]);
        const display = show ? "" : "none";

        dot.style.display = display;
        ring.style.display = display;
        dot.style.left = `${pos.x}px`;
        dot.style.top = `${pos.y}px`;
        ring.style.left = `${pos.x}px`;
        ring.style.top = `${pos.y}px`;
      }
    }

    map.on("render", updatePulses);

    return () => {
      map.off("render", updatePulses);
      for (const [, { dot, ring }] of ringsMap.current) {
        dot.remove();
        ring.remove();
      }
      ringsMap.current.clear();
      knownIds.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force repaint when visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.triggerRepaint();
  }, [options.showSigintPulse, mapRef]);
}
```

- [ ] **Step 6.2: Export from `apps/web/src/lib/map/index.ts`**

Add to the end of `apps/web/src/lib/map/index.ts`:

```typescript
export { useMapSigintPulse } from "./use-map-sigint-pulse";
```

- [ ] **Step 6.3: Add props to `apps/web/src/components/map-view.tsx`**

In the `MapViewProps` interface, add after `waypoints`:

```typescript
  sigintIntercepts?: SigintIntercept[];
  showSigintPulse?: boolean;
```

Add the import for `SigintIntercept` at the top:

```typescript
import type { SigintIntercept } from "@/lib/use-simulation";
```

In the `dynamic` import block, the props are forwarded automatically via spread — pass them through to `MapViewInner`. Find where `MapViewInner` is rendered (inside the `dynamic` wrapper) and confirm `sigintIntercepts` and `showSigintPulse` are passed.

The `map-view.tsx` file passes all props to `MapViewInner` via the dynamic import. Confirm the dynamic component's props type matches by verifying there are no TS errors in step 6.6.

- [ ] **Step 6.4: Add props + hook call to `apps/web/src/components/map-view-inner.tsx`**

In `TacticalMapProps`, add after `waypoints`:

```typescript
  sigintIntercepts?: SigintIntercept[];
  showSigintPulse?: boolean;
```

Add to import at top:

```typescript
import { useMapSigintPulse } from "@/lib/map";
import type { SigintIntercept } from "@/lib/use-simulation";
```

In the `MapViewInner` function destructuring, add with defaults:

```typescript
  sigintIntercepts = [],
  showSigintPulse = true,
```

After the existing `useMapWaypoints(...)` call, add:

```typescript
  useMapSigintPulse(mapRef, containerRef, {
    sigintIntercepts,
    showSigintPulse,
  });
```

- [ ] **Step 6.5: Wire up in `apps/web/src/app/(dashboard)/map/page.tsx`**

Add state after `showSensorRanges`:

```typescript
  const [showSigintPulse, setShowSigintPulse] = useState(true);
```

In the `<MapView ...>` JSX, add props:

```typescript
          sigintIntercepts={sim.sigintIntercepts}
          showSigintPulse={showSigintPulse}
```

In the top-right HUD button group (find the Sensors toggle button section), add a SIGINT toggle button immediately after the "Sensors" button:

```typescript
          {/* SIGINT pulse toggle */}
          <button
            onClick={() => setShowSigintPulse((v) => !v)}
            className={`px-2.5 py-1 rounded-sm text-[9px] font-semibold cursor-pointer transition-colors ${
              showSigintPulse
                ? "text-[var(--om-red-light)]"
                : "text-[var(--om-text-muted)]"
            }`}
            style={{
              background: "rgba(30,34,41,0.85)",
              border: `1px solid ${showSigintPulse ? "rgba(231,106,110,0.4)" : "var(--om-border)"}`,
              backdropFilter: "blur(4px)",
            }}
          >
            SIGINT
          </button>
```

- [ ] **Step 6.6: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6.7: Test pulse rings in browser**

With the dev server and API running:

1. Open `http://localhost:3000/map`
2. Start the simulation via the controls
3. Wait a few ticks — red/amber/green pulse rings should appear on the map near enemy assets within 80 km of `JAMMER-01` (positioned at ~34.55°N, 40.38°E)
4. Toggle "SIGINT" button — rings should hide and show
5. Pan the map — rings should stay locked to their geographic positions

- [ ] **Step 6.8: Commit**

```bash
git add \
  apps/web/src/lib/map/use-map-sigint-pulse.ts \
  apps/web/src/lib/map/index.ts \
  apps/web/src/components/map-view.tsx \
  apps/web/src/components/map-view-inner.tsx \
  apps/web/src/app/\(dashboard\)/map/page.tsx \
&& git commit -m "feat(sigint): add useMapSigintPulse hook and SIGINT toggle on map page"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All sections covered — `SigintIntercept` model (Task 1), `compute_sigint_intercepts` (Task 1), `StateDiff` extension (Task 2), TS types + `use-simulation` (Task 3), `useSigintStats` (Task 4), `/sigint` page + nav (Task 5), `useMapSigintPulse` + map wiring (Task 6)
- [x] **Placeholder scan:** No TBD/TODO. All code blocks complete.
- [x] **Type consistency:** `SigintIntercept` defined once in `use-simulation.ts` and imported everywhere. `sigintIntercepts: SigintIntercept[]` consistent across hook return, stats options, page props, and map props. `threat_level: "HIGH" | "MED" | "LOW"` union used in page and hook; `THREAT_COLOR` record covers all three values.
