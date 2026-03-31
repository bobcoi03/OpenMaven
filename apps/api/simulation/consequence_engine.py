"""
consequence_engine.py — LLM Faction Commander.

One LLM call per significant event per faction (not every tick).
Triggers: strike executed, leader killed, capability threshold, morale shift.
Returns JSON array of commands applied to the faction's assets.

Cost estimate: ~$0.00024/call (gpt-4o-mini), ~$0.012/hour of gameplay.
"""
from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .assets import SimAsset
    from .faction import Faction
    from .manager import SimulationManager
    from .events import SimEvent

from .events import EventType

logger = logging.getLogger(__name__)

_TRIGGER_EVENT_TYPES = frozenset(
    {
        EventType.STRIKE,
        EventType.LEADERSHIP_CHANGE,
        EventType.MORALE_SHIFT,
        EventType.RESOURCE_DEPLETION,
        EventType.RETALIATION,
    }
)

_CAPABILITY_THRESHOLD = 0.3
_SYSTEM_PROMPT = """You are a tactical AI commander for a military faction in a simulation.
Given the current faction state and a triggering event, issue orders to your assets.

Respond ONLY with a JSON array of command objects. No explanation.

Available commands:
- {"command": "move", "asset_id": "<id>", "lat": <float>, "lon": <float>}
- {"command": "engage", "asset_id": "<id>", "target_id": "<id>"}
- {"command": "retreat", "asset_id": "<id>"}
- {"command": "hold", "asset_id": "<id>"}
- {"command": "concentrate", "asset_ids": ["<id>", ...], "lat": <float>, "lon": <float>}

Issue 1-3 commands maximum. Only reference asset IDs listed in the faction state."""


class ConsequenceEngine:
    """Async LLM commander that issues orders on significant events."""

    def __init__(self) -> None:
        self._last_call_tick: dict[str, int] = {}
        self._cooldown_ticks: int = 10

    def _should_trigger(
        self,
        event: SimEvent,
        faction_id: str,
        manager: SimulationManager,
    ) -> bool:
        """Return True if this event warrants an LLM call for this faction."""
        last = self._last_call_tick.get(faction_id, -(self._cooldown_ticks + 1))
        if (manager.tick - last) < self._cooldown_ticks:
            return False
        if event.event_type in _TRIGGER_EVENT_TYPES:
            return True
        faction = manager.factions.get(faction_id)
        if faction is not None and faction.capability < _CAPABILITY_THRESHOLD:
            return True
        return False

    def _build_prompt(
        self,
        faction: Faction,
        event: SimEvent,
        manager: SimulationManager,
    ) -> str:
        """Build a prompt string from current faction state and triggering event."""
        faction_assets = [
            a for a in manager.assets.values()
            if a.faction_id == faction.faction_id and a.is_alive()
        ]
        assets_summary = "\n".join(
            f"  - {a.asset_id} ({a.callsign}, {a.asset_type}): "
            f"health={a.health:.2f}, status={a.status.value}, "
            f"pos=({a.position.latitude:.3f}, {a.position.longitude:.3f})"
            for a in faction_assets
        )
        recent_events = getattr(manager, "event_log", [])[-5:]
        recent_summary = "\n".join(
            f"  - tick {e.scheduled_tick}: {e.description}" for e in recent_events
        )
        return f"""FACTION: {faction.name} (side={faction.side}, doctrine={faction.doctrine.value})
Capability: {faction.capability:.2f}  Morale: {faction.morale:.2f}

TRIGGERING EVENT (tick {event.scheduled_tick}):
  {event.description}

FACTION ASSETS:
{assets_summary}

RECENT EVENTS:
{recent_summary}

Issue 1-3 tactical commands. You may move, retreat, hold, engage, or concentrate assets.
Respond with a JSON array only."""

    async def _call_llm(self, prompt: str) -> list[dict[str, Any]]:
        """Call gpt-4o-mini and return parsed command list."""
        try:
            import openai
        except ImportError:
            logger.warning("openai package not installed — skipping LLM call")
            return []

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not set — skipping LLM call")
            return []

        client = openai.AsyncOpenAI(api_key=api_key)
        try:
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=256,
            )
            text = response.choices[0].message.content or "[]"
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.warning("LLM returned non-JSON: %s", exc)
            return []
        except Exception as exc:
            logger.warning("LLM call failed: %s", exc)
            return []

    def _apply_commands(
        self,
        commands: list[dict[str, Any]],
        faction: Faction,
        manager: SimulationManager,
    ) -> None:
        """Apply the returned command list to the simulation state."""
        from .assets import AssetStatus

        for cmd in commands:
            command_type = cmd.get("command")
            asset_id = cmd.get("asset_id")

            if asset_id:
                asset = manager.assets.get(asset_id)
                if asset is None or not asset.is_alive():
                    continue
            else:
                asset = None

            if command_type == "move" and asset:
                lat = cmd.get("lat")
                lon = cmd.get("lon")
                if lat is not None and lon is not None:
                    try:
                        manager.command_move(
                            asset_id=asset_id,
                            dest_lat=float(lat),
                            dest_lon=float(lon),
                            dest_alt=asset.position.altitude_m,
                            terrain="open",
                        )
                    except Exception as exc:
                        logger.debug("move command failed: %s", exc)

            elif command_type == "retreat" and asset:
                from .combat_ai import _execute_retreat
                _execute_retreat(asset, manager)

            elif command_type == "hold" and asset:
                asset.status = AssetStatus.HOLDING

            elif command_type == "engage" and asset:
                target_id = cmd.get("target_id")
                if target_id and target_id in manager.assets:
                    target = manager.assets[target_id]
                    if target.is_alive():
                        try:
                            weapons = getattr(asset, "weapons", [])
                            weapon_id = weapons[0] if weapons else "small_arms"
                            manager.command_strike_mission(
                                shooter_id=asset_id,
                                weapon_id=weapon_id,
                                target_id=target_id,
                            )
                        except Exception as exc:
                            logger.debug("engage command failed: %s", exc)

            elif command_type == "concentrate":
                asset_ids: list[str] = cmd.get("asset_ids", [])
                lat = cmd.get("lat")
                lon = cmd.get("lon")
                if lat is not None and lon is not None:
                    for aid in asset_ids:
                        a = manager.assets.get(aid)
                        if a and a.is_alive():
                            try:
                                manager.command_move(
                                    asset_id=aid,
                                    dest_lat=float(lat),
                                    dest_lon=float(lon),
                                    dest_alt=a.position.altitude_m,
                                    terrain="open",
                                )
                            except Exception as exc:
                                logger.debug("concentrate command failed: %s", exc)

    async def process_event(
        self,
        event: SimEvent,
        manager: SimulationManager,
    ) -> None:
        """
        Evaluate a significant event and issue LLM commander orders if triggered.

        This is async — fire with asyncio.ensure_future() from the tick loop.
        """
        faction_id = event.faction_id
        if faction_id is None:
            return
        if not self._should_trigger(event, faction_id, manager):
            return
        faction = manager.factions.get(faction_id)
        if faction is None or faction.side == "blue":
            return

        prompt = self._build_prompt(faction, event, manager)
        commands = await self._call_llm(prompt)
        self._apply_commands(commands, faction, manager)
        self._last_call_tick[faction_id] = manager.tick
        logger.info(
            "ConsequenceEngine: %d command(s) issued to %s at tick %d",
            len(commands),
            faction.name,
            manager.tick,
        )
