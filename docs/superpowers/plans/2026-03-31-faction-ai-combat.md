# Plan: Faction AI & Combat Behaviors (Phase 5)

**Branch:** `feat/faction-ai-combat`
**Started:** 2026-04-13

---

## Status

| Phase | Task | Status |
|-------|------|--------|
| 5.1 | Rule-based RedAI — `red_ai.py` | ✅ Done (merged to main) |
| 5.1 | Target lock UI + reticle overlay | ✅ Done (merged to main) |
| 5.2 | Suppression field on SimAsset | ✅ Done |
| 5.2 | Cover bonus damage reduction | ✅ Done |
| 5.2 | Retreat behavior (health < 30% → nearest FOB) | ✅ Done |
| 5.2 | Call-for-reinforcements (outnumbered → allies converge) | ✅ Done |
| 5.2 | Suppression application (hit → suppressed N ticks) | ✅ Done |
| 5.3 | LLM Faction Commander — `consequence_engine.py` | ✅ Done |
| 5.3 | Wire consequence engine into SimulationManager | ✅ Done |

---

## Phase 5.2 — Combat Behaviors

### 1. SimAsset changes (`assets.py`)
- Add `suppressed_until_tick: int = 0`
- Add `suppress(until_tick: int)` method
- Add `is_suppressed(current_tick: int) -> bool`

### 2. Cover bonus (`red_ai.py`)
- Assets within 1 km of a structure get 20–40% damage reduction
- Structure categories: `reinforced_structure`, `light_structure`, `command_node`, `supply_depot`, `Forward Operating Base`
- Implemented via `_cover_multiplier(target, mgr)` → float (0.6–1.0)

### 3. Retreat behavior (`red_ai.py`)
- Per-tick check: red assets with health < 0.3 and not already RTB
- Find nearest friendly "Forward Operating Base" or "Field Hospital"
- Issue `command_move` via manager, set `status = RTB`
- Emit RETALIATION event: "{callsign} falling back to {fob_callsign}"

### 4. Call for reinforcements (`red_ai.py`)
- After engagement: if shooter has < N allies within 10 km vs M enemies
- Ratio threshold: enemies >= 2× allies → request reinforcements
- Find up to 3 non-engaged red allies within 20 km
- Issue `command_move` to converge on shooter's position

### 5. Suppression (`red_ai.py`, `manager.py`)
- When red AI hits blue asset: `target.suppress(mgr.tick + SUPPRESSION_TICKS[doctrine])`
- When blue mission hits red asset: `target.suppress(self.tick + 5)` in `_resolve_strike_mission`
- Suppressed red assets skipped as shooters (can't engage)
- Suppressed blue assets show in StateDiff asset_updates with `"event": "suppressed"`

---

## Phase 5.3 — LLM Faction Commander

### `consequence_engine.py`
- `ConsequenceEngine` class with `evaluate(event_type, faction_id, mgr)` async method
- Fires on: `STRIKE`, leader killed, faction capability < 0.5, geofence breach
- Builds compact faction context (not full dump): doctrine, capability, morale, resources, nearby assets
- Calls LLM (Gemini 2.5 Pro via existing client) with tool-calling for `get_faction_state`, `get_assets_near`
- Returns `list[ConsequenceCommand]` — structured move/engage/retreat/hold commands
- Each command applied as a mutation via `mgr._apply_mutation`
- Rate-limited: one call per faction per 10 ticks minimum (avoid spam on low capability)

### Wiring into manager.py
- `_advance_tick` calls `asyncio.create_task(self._run_consequence_check())` on significant events
- Significant = tick % 10 == 0 OR a STRIKE event fired this tick OR mission completed with `destroyed=True`
