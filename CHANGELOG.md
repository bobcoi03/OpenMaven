# Changelog

## [0.2.0] — 2026-04-13

### Added
- **Faction AI combat engine** (`simulation/red_ai.py`): doctrine-driven engagement loop with retreat, reinforcement, and cover-bonus passes per red faction each tick.
  - Retreat pass: assets below 30% health issue RTB orders toward nearest FOB/field hospital with a 20-tick cooldown to prevent spam.
  - Reinforce pass: after an engagement, if the shooter is outnumbered 2:1 locally, up to 3 nearby allies converge on the contact point.
  - Cover bonus: assets sheltering within 1 km of a structure take 20–40% reduced damage depending on structure hardness.
  - Per-doctrine cooldowns (AGGRESSIVE 3 ticks, DEFENSIVE 8, GUERRILLA 2, ASYMMETRIC 6) and target scoring matrices.
- **Suppression mechanic** (`simulation/assets.py`): `suppress(until_tick)` / `is_suppressed(tick)` on `SimAsset`; suppressed assets skip the engagement pass and have movement arrival delayed by 1 tick per suppressed tick (capped at +50 ticks total).
- **LLM consequence engine** (`simulation/consequence_engine.py`): async rate-limited faction commander (10-tick cooldown per faction) that builds a JSON sitrep, calls the model, parses a command array, and applies mutations via `_apply_mutation_from_consequence`.
  - Allowed actions: `move_asset`, `update_morale`, `update_leader`.
  - Triggers: red engagement, blue strike destroying a red asset, faction below 40% capability, leader killed.
  - Markdown fence stripping and action allowlist filtering on LLM output.
- **Frontend suppression/retreat UI** (`apps/web`): `SUPPRESSED` and `RETREATING` status badges in `AssetDetailPanel`; suppressed assets rendered with a yellow combat filter overlay on the tactical map.

### Fixed
- Division-by-zero in `_tick_movement` interpolation when `arrive_tick == start_tick` (`max(total_ticks, 1)` guard).
- Stale dead-asset count in `RedAI._run_reinforcements` local blue force assessment (added `is_alive()` check).
- Cover multiplier returned on first in-radius structure rather than the best (lowest) multiplier across all in-radius structures.
- `event_log` grown without bound — now capped at 1 000 entries via `collections.deque(maxlen=1000)`.
- Suppression `arrive_tick` could grow indefinitely under persistent guerrilla harassment — capped at +50 ticks beyond current tick.
- In-flight `ConsequenceEngine` asyncio tasks leaked after `stop()` — tracked in `_ce_tasks` set and cancelled on simulation stop.
- `spawn_asset` mutation accepted unknown `faction_id` without validation — now guarded with existence check.
- `SEED_PATH` removed from `dependencies.py` but still imported by `test_objects.py` — restored export.
- `test_objects.py` failed under full test suite due to Neo4j `DETACH DELETE` teardown in `test_neo4j_store.py` — fixed with autouse module fixture.
- `test_detection.py` sensor range assertion stale after fog-of-war PR bumped AN/APY-2 Radar to 45 km.
- `test_kg.py` expected graceful return from `extract_and_store` but implementation now raises `RuntimeError` when all chunks fail — updated test to `pytest.raises`.

## [0.1.0] — initial release

Kafka ingestion layer, Neo4j ontology graph, OPA policy engine, fog-of-war sensor detection, target lock reticle overlay, and simulation manager foundation.
