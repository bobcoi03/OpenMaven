"""LLM Faction Commander — consequence engine for significant battlefield events.

Fires at most once per faction per MIN_TICKS_BETWEEN_CALLS ticks.  Each call
builds a compact situation report, asks the LLM to decide the faction's
response, and returns a list of mutations that SimulationManager can apply
immediately via ``_apply_mutation``.

Significant triggers (checked by the caller):
  - A strike was executed against this faction this tick
  - A faction leader was killed
  - Faction capability dropped below LOW_CAPABILITY_THRESHOLD

The LLM is optional: if no API key is configured the engine is a no-op.
If the LLM call fails or returns malformed JSON, the engine logs the error
and returns an empty list — the simulation continues unaffected.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from simulation.manager import SimulationManager

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MIN_TICKS_BETWEEN_CALLS: int = 10   # rate-limit per faction
LOW_CAPABILITY_THRESHOLD: float = 0.5
MAX_NEARBY_ASSETS: int = 10          # assets to include in context
NEARBY_RADIUS_KM: float = 50.0      # context radius around faction centroid
MAX_CONSEQUENCE_STEPS: int = 3       # max tool-call rounds per evaluation

# Commands the LLM is allowed to issue (maps to _apply_mutation actions)
_ALLOWED_ACTIONS: frozenset[str] = frozenset({
    "move_asset",
    "update_morale",
    "update_leader",
})

_SYSTEM_PROMPT = """\
You are the AI commander for a military faction in a real-time simulation.
You receive a compact situation report and must decide your faction's
tactical response.

Respond ONLY with a JSON array of command objects.  Each object has:
  { "action": "<action>", "description": "<short human-readable label>", "params": { ... } }

Available actions and their required params:

  move_asset   — reposition an asset
    params: { "asset_id": str, "latitude": float, "longitude": float }

  update_morale — adjust faction morale (positive = boost, negative = hit)
    params: { "faction_id": str, "severity": float }   // severity 0.0–0.5

  update_leader — remove a killed leader from the succession chain
    params: { "faction_id": str, "leader_id": str }

Rules:
- Only issue commands for assets and factions that appear in the situation report.
- Prefer 1–3 targeted commands over a long list.
- If no action is needed, return an empty array: []
- Respond with valid JSON only.  No prose, no markdown fences.
"""


# ── Helpers ──────────────────────────────────────────────────────────────────


def _build_situation_report(faction_id: str, mgr: "SimulationManager") -> str:
    """Build a compact JSON situation report for the given faction."""
    from simulation.rules import haversine_km

    faction = mgr.factions.get(faction_id)
    if faction is None:
        return "{}"

    # Faction overview
    faction_data: dict[str, Any] = {
        "faction_id": faction.faction_id,
        "name": faction.name,
        "doctrine": faction.doctrine.value,
        "capability": round(faction.capability, 2),
        "morale": round(faction.morale, 2),
        "resources": {
            "fuel": round(faction.resources.fuel, 2),
            "ammo": round(faction.resources.ammo, 2),
            "manpower": round(faction.resources.manpower, 2),
        },
        "current_leader": (
            faction.current_leader().name if faction.current_leader() else None
        ),
    }

    # Own assets (alive, summarised)
    own_assets = [
        {
            "asset_id": a.asset_id,
            "callsign": a.callsign,
            "type": a.asset_type,
            "health": round(a.health, 2),
            "status": a.status.value,
            "lat": round(a.position.latitude, 4),
            "lon": round(a.position.longitude, 4),
        }
        for a in mgr.assets.values()
        if a.faction_id == faction_id and a.is_alive()
    ]

    # Compute centroid of own assets
    if own_assets:
        c_lat = sum(a["lat"] for a in own_assets) / len(own_assets)
        c_lon = sum(a["lon"] for a in own_assets) / len(own_assets)
    else:
        c_lat, c_lon = 33.0, 36.0  # fallback to theatre centre

    # Nearby enemy assets within radius
    nearby_enemies = []
    for a in mgr.assets.values():
        if a.faction_id == faction_id:
            continue
        if a.faction_id == "civilian":
            continue
        if not a.is_alive():
            continue
        dist = haversine_km(c_lat, c_lon, a.position.latitude, a.position.longitude)
        if dist <= NEARBY_RADIUS_KM:
            nearby_enemies.append({
                "asset_id": a.asset_id,
                "callsign": a.callsign,
                "type": a.asset_type,
                "faction": a.faction_id,
                "health": round(a.health, 2),
                "dist_km": round(dist, 1),
                "lat": round(a.position.latitude, 4),
                "lon": round(a.position.longitude, 4),
            })

    nearby_enemies.sort(key=lambda x: x["dist_km"])
    nearby_enemies = nearby_enemies[:MAX_NEARBY_ASSETS]

    # Recent events that mention this faction (last 10, most recent first)
    recent_events: list[dict[str, Any]] = []
    for evt in reversed(mgr.event_log):
        if evt.faction_id == faction_id or evt.faction_id is None:
            recent_events.append({
                "tick": evt.scheduled_tick,
                "type": evt.event_type.value,
                "description": evt.description,
            })
        if len(recent_events) >= 10:
            break

    report = {
        "tick": mgr.tick,
        "faction": faction_data,
        "own_assets": own_assets,
        "nearby_enemies": nearby_enemies,
        "recent_events": recent_events,
    }
    return json.dumps(report, separators=(",", ":"))


def _parse_commands(raw: str) -> list[dict[str, Any]]:
    """Parse the LLM's JSON response into a list of command dicts.

    Returns an empty list if parsing fails or the response is empty.
    """
    raw = raw.strip()
    if not raw:
        return []

    # Strip markdown fences if the model wrapped output despite instructions
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(
            line for line in lines if not line.startswith("```")
        ).strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("ConsequenceEngine: JSON parse failed — raw=%r", raw[:200])
        return []

    if not isinstance(data, list):
        logger.warning("ConsequenceEngine: expected list, got %s", type(data))
        return []

    validated: list[dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        action = item.get("action")
        params = item.get("params", {})
        if action not in _ALLOWED_ACTIONS:
            logger.warning("ConsequenceEngine: ignoring unknown action=%r", action)
            continue
        validated.append({"action": action, "params": params})

    return validated


def _call_llm_sync(situation: str) -> str:
    """Synchronous LLM call — intended to run in a thread via asyncio.to_thread."""
    from dependencies import LLM_MODEL, get_llm_client

    client = get_llm_client()
    if client is None:
        return "[]"

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": situation},
            ],
            max_tokens=512,
            temperature=0.3,
        )
        return response.choices[0].message.content or "[]"
    except Exception as exc:
        logger.warning("ConsequenceEngine: LLM call failed: %s", exc)
        return "[]"


# ── Engine ───────────────────────────────────────────────────────────────────


class ConsequenceEngine:
    """Evaluates significant battlefield events and issues LLM-driven faction commands.

    Usage (from SimulationManager):

        _consequence_engine: ConsequenceEngine = ConsequenceEngine()

        # In _advance_tick, after resolving events:
        asyncio.create_task(
            self._consequence_engine.maybe_evaluate(faction_id, trigger, self)
        )
    """

    def __init__(self) -> None:
        # faction_id → last tick on which we ran an evaluation
        self._last_eval: dict[str, int] = {}

    def is_ready(self, faction_id: str, current_tick: int) -> bool:
        """Return True if this faction is due for an evaluation."""
        last = self._last_eval.get(faction_id, -(MIN_TICKS_BETWEEN_CALLS + 1))
        return current_tick - last >= MIN_TICKS_BETWEEN_CALLS

    async def maybe_evaluate(
        self,
        faction_id: str,
        trigger: str,
        mgr: "SimulationManager",
    ) -> None:
        """Evaluate and apply consequences for a significant event, if rate-limit allows.

        Args:
            faction_id: The faction experiencing the significant event.
            trigger: Short human-readable description of what triggered this call.
            mgr: Live SimulationManager (read + write access to world state).
        """
        if not self.is_ready(faction_id, mgr.tick):
            logger.debug(
                "ConsequenceEngine: skipping %s (rate-limited, last=%d, now=%d)",
                faction_id,
                self._last_eval.get(faction_id, 0),
                mgr.tick,
            )
            return

        self._last_eval[faction_id] = mgr.tick
        logger.info(
            "ConsequenceEngine tick=%d: evaluating faction=%s trigger=%s",
            mgr.tick,
            faction_id,
            trigger,
        )

        situation = _build_situation_report(faction_id, mgr)
        raw = await asyncio.to_thread(_call_llm_sync, situation)
        commands = _parse_commands(raw)

        if not commands:
            logger.debug("ConsequenceEngine: no commands issued for %s", faction_id)
            return

        applied = 0
        for cmd in commands:
            try:
                mgr._apply_mutation_from_consequence(cmd["action"], cmd["params"])
                applied += 1
            except Exception as exc:
                logger.warning(
                    "ConsequenceEngine: failed to apply action=%s params=%s: %s",
                    cmd["action"],
                    cmd["params"],
                    exc,
                )

        logger.info(
            "ConsequenceEngine tick=%d: applied %d/%d command(s) for %s",
            mgr.tick,
            applied,
            len(commands),
            faction_id,
        )
