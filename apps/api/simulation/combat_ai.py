"""
combat_ai.py — Utility-based faction AI for non-player assets.

Each tick, hostile assets score six possible actions and execute the highest.
No behavior trees — pure utility scoring for debuggability.
"""
from __future__ import annotations

import math
import random as _random
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .assets import SimAsset
    from .manager import SimulationManager

from .faction import Doctrine


# ---------------------------------------------------------------------------
# Action types
# ---------------------------------------------------------------------------

class AIAction(Enum):
    HOLD = "hold"
    ENGAGE = "engage"
    RETREAT = "retreat"
    SEEK_COVER = "seek_cover"
    CALL_SUPPORT = "call_support"
    ADVANCE = "advance"


@dataclass
class ActionScore:
    action: AIAction
    score: float


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

_EARTH_RADIUS_KM = 6371.0

_STRUCTURE_KEYWORDS = frozenset(
    {"fob", "depot", "bunker", "command", "base", "fortif", "outpost", "hq"}
)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return _EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def _is_structure(asset_type: str) -> bool:
    """Return True if the asset type string looks like a fixed structure."""
    lower = asset_type.lower()
    return any(kw in lower for kw in _STRUCTURE_KEYWORDS)


# ---------------------------------------------------------------------------
# Proximity queries
# ---------------------------------------------------------------------------

def _count_nearby_threats(
    asset: SimAsset, manager: SimulationManager, radius_km: float
) -> int:
    """Count alive enemy assets within radius_km of asset."""
    my_faction = manager.factions.get(asset.faction_id)
    if my_faction is None:
        return 0
    count = 0
    for other in manager.assets.values():
        if not other.is_alive():
            continue
        if other.asset_id == asset.asset_id:
            continue
        other_faction = manager.factions.get(other.faction_id)
        if other_faction is None:
            continue
        if other_faction.side == my_faction.side:
            continue
        dist = _haversine_km(
            asset.position.latitude,
            asset.position.longitude,
            other.position.latitude,
            other.position.longitude,
        )
        if dist <= radius_km:
            count += 1
    return count


def _count_nearby_allies(
    asset: SimAsset, manager: SimulationManager, radius_km: float
) -> int:
    """Count alive friendly assets (excluding self) within radius_km."""
    my_faction = manager.factions.get(asset.faction_id)
    if my_faction is None:
        return 0
    count = 0
    for other in manager.assets.values():
        if not other.is_alive():
            continue
        if other.asset_id == asset.asset_id:
            continue
        other_faction = manager.factions.get(other.faction_id)
        if other_faction is None:
            continue
        if other_faction.side != my_faction.side:
            continue
        dist = _haversine_km(
            asset.position.latitude,
            asset.position.longitude,
            other.position.latitude,
            other.position.longitude,
        )
        if dist <= radius_km:
            count += 1
    return count


def _has_nearby_structure(
    asset: SimAsset, manager: SimulationManager, radius_km: float
) -> bool:
    """Return True if a friendly structure is within radius_km."""
    my_faction = manager.factions.get(asset.faction_id)
    if my_faction is None:
        return False
    for other in manager.assets.values():
        if not other.is_alive():
            continue
        other_faction = manager.factions.get(other.faction_id)
        if other_faction is None:
            continue
        if other_faction.side != my_faction.side:
            continue
        if not _is_structure(other.asset_type):
            continue
        dist = _haversine_km(
            asset.position.latitude,
            asset.position.longitude,
            other.position.latitude,
            other.position.longitude,
        )
        if dist <= radius_km:
            return True
    return False


# ---------------------------------------------------------------------------
# Doctrine modifiers
# ---------------------------------------------------------------------------

_DOCTRINE_MODIFIERS: dict[Doctrine, dict[AIAction, float]] = {
    Doctrine.AGGRESSIVE: {
        AIAction.ENGAGE: 1.3,
        AIAction.ADVANCE: 1.3,
    },
    Doctrine.DEFENSIVE: {
        AIAction.HOLD: 1.3,
        AIAction.RETREAT: 1.3,
    },
    Doctrine.GUERRILLA: {
        AIAction.ENGAGE: 1.3,
        AIAction.RETREAT: 1.3,
    },
    Doctrine.ASYMMETRIC: {
        AIAction.ENGAGE: 1.3,
        AIAction.RETREAT: 1.3,
    },
}


def _apply_doctrine_modifiers(
    scores: dict[AIAction, float], doctrine: Doctrine
) -> None:
    """Multiply scores in-place according to doctrine."""
    modifiers = _DOCTRINE_MODIFIERS.get(doctrine, {})
    for action, multiplier in modifiers.items():
        scores[action] = scores[action] * multiplier


# ---------------------------------------------------------------------------
# Core scoring
# ---------------------------------------------------------------------------

_BASE_SCORES: dict[AIAction, float] = {
    AIAction.HOLD: 0.30,
    AIAction.ENGAGE: 0.40,
    AIAction.RETREAT: 0.10,
    AIAction.SEEK_COVER: 0.20,
    AIAction.CALL_SUPPORT: 0.20,
    AIAction.ADVANCE: 0.30,
}


def score_actions(
    asset: SimAsset, manager: SimulationManager
) -> list[ActionScore]:
    """
    Return utility scores for all six actions for this asset.

    Scoring factors:
      - Health    (<0.3 → retreat, <0.6 → cover)
      - Threat proximity + numerical advantage within 10km
      - Cover availability within 2km
      - Faction doctrine multiplier
    """
    scores: dict[AIAction, float] = dict(_BASE_SCORES)

    # --- Health factor ---
    if asset.health < 0.3:
        scores[AIAction.RETREAT] += 1.0
        scores[AIAction.ENGAGE] -= 0.3
        scores[AIAction.ADVANCE] -= 0.3
    elif asset.health < 0.6:
        scores[AIAction.SEEK_COVER] += 0.2
        scores[AIAction.RETREAT] += 0.2

    # --- Threat proximity / numerical advantage ---
    threats = _count_nearby_threats(asset, manager, radius_km=10.0)
    allies = _count_nearby_allies(asset, manager, radius_km=10.0)

    if threats > 0:
        scores[AIAction.ENGAGE] += 0.3
        scores[AIAction.SEEK_COVER] += 0.2
        advantage = allies / threats
        if advantage < 0.5:
            scores[AIAction.RETREAT] += 0.4
            scores[AIAction.CALL_SUPPORT] += 0.6
        elif advantage > 2.0:
            scores[AIAction.ENGAGE] += 0.5
            scores[AIAction.ADVANCE] += 0.3

    # --- Cover availability ---
    if _has_nearby_structure(asset, manager, radius_km=2.0):
        scores[AIAction.SEEK_COVER] += 0.4

    # --- Doctrine modifiers ---
    faction = manager.factions.get(asset.faction_id)
    if faction is not None:
        _apply_doctrine_modifiers(scores, faction.doctrine)

    # Clamp negatives to zero
    scores = {a: max(0.0, s) for a, s in scores.items()}

    return [ActionScore(action=a, score=s) for a, s in scores.items()]


def pick_action(asset: SimAsset, manager: SimulationManager) -> AIAction:
    """Return the highest-scoring action for this asset."""
    scores = score_actions(asset, manager)
    return max(scores, key=lambda s: s.score).action


# ---------------------------------------------------------------------------
# Cover bonus
# ---------------------------------------------------------------------------


def cover_damage_multiplier(
    asset: "SimAsset", manager: "SimulationManager"
) -> float:
    """
    Return a damage multiplier for an asset.

    Assets near friendly structures get 20-40% damage reduction (multiplier
    between 0.60 and 0.80). Otherwise returns 1.0.
    """
    if _has_nearby_structure(asset, manager, radius_km=2.0):
        return _random.uniform(0.60, 0.80)
    return 1.0


# ---------------------------------------------------------------------------
# Behavior handlers
# ---------------------------------------------------------------------------

def _find_nearest_friendly_structure(
    asset: "SimAsset", manager: "SimulationManager"
) -> "SimAsset | None":
    """Return the closest alive friendly structure asset, or None."""
    my_faction = manager.factions.get(asset.faction_id)
    if my_faction is None:
        return None
    nearest: "SimAsset | None" = None
    best_dist = float("inf")
    for other in manager.assets.values():
        if not other.is_alive():
            continue
        if other.asset_id == asset.asset_id:
            continue
        other_faction = manager.factions.get(other.faction_id)
        if other_faction is None or other_faction.side != my_faction.side:
            continue
        if not _is_structure(other.asset_type):
            continue
        dist = _haversine_km(
            asset.position.latitude,
            asset.position.longitude,
            other.position.latitude,
            other.position.longitude,
        )
        if dist < best_dist:
            best_dist = dist
            nearest = other
    return nearest


def _find_nearest_enemy(
    asset: "SimAsset", manager: "SimulationManager"
) -> "SimAsset | None":
    """Return the closest alive enemy asset, or None."""
    my_faction = manager.factions.get(asset.faction_id)
    if my_faction is None:
        return None
    nearest: "SimAsset | None" = None
    best_dist = float("inf")
    for other in manager.assets.values():
        if not other.is_alive():
            continue
        other_faction = manager.factions.get(other.faction_id)
        if other_faction is None:
            continue
        if other_faction.side == my_faction.side:
            continue
        dist = _haversine_km(
            asset.position.latitude,
            asset.position.longitude,
            other.position.latitude,
            other.position.longitude,
        )
        if dist < best_dist:
            best_dist = dist
            nearest = other
    return nearest


_SUPPRESSION_DURATION_TICKS = 5


def _execute_retreat(asset: "SimAsset", manager: "SimulationManager") -> None:
    """Move asset toward nearest friendly structure (FOB). Set status RTB."""
    from .assets import AssetStatus
    target = _find_nearest_friendly_structure(asset, manager)
    if target is None:
        return
    try:
        manager.command_move(
            asset_id=asset.asset_id,
            dest_lat=target.position.latitude,
            dest_lon=target.position.longitude,
            dest_alt=target.position.altitude_m,
            terrain="open",
        )
    except Exception:
        pass
    asset.status = AssetStatus.RTB


def _execute_seek_cover(asset: "SimAsset", manager: "SimulationManager") -> None:
    """Move to nearest structure and apply suppression."""
    target = _find_nearest_friendly_structure(asset, manager)
    if target is not None:
        try:
            manager.command_move(
                asset_id=asset.asset_id,
                dest_lat=target.position.latitude,
                dest_lon=target.position.longitude,
                dest_alt=target.position.altitude_m,
                terrain="open",
            )
        except Exception:
            pass
    asset.suppressed_until_tick = manager.tick + _SUPPRESSION_DURATION_TICKS


def _execute_call_support(asset: "SimAsset", manager: "SimulationManager") -> None:
    """Broadcast a contact event so nearby friendlies converge."""
    from .events import EventType, Mutation
    manager.event_queue.create_and_schedule(
        event_type=EventType.ALERT,
        description=(
            f"{asset.callsign} requests support at "
            f"({asset.position.latitude:.3f}, {asset.position.longitude:.3f})"
        ),
        faction_id=asset.faction_id,
        scheduled_tick=manager.tick,
        probability=1.0,
        mutations=[
            Mutation(
                action="converge_allies",
                params={
                    "rally_lat": asset.position.latitude,
                    "rally_lon": asset.position.longitude,
                    "faction_id": asset.faction_id,
                    "radius_km": 15.0,
                },
            )
        ],
    )


def _execute_advance(asset: "SimAsset", manager: "SimulationManager") -> None:
    """Move toward the nearest enemy."""
    target = _find_nearest_enemy(asset, manager)
    if target is None:
        return
    try:
        manager.command_move(
            asset_id=asset.asset_id,
            dest_lat=target.position.latitude,
            dest_lon=target.position.longitude,
            dest_alt=target.position.altitude_m,
            terrain="open",
        )
    except Exception:
        pass


def execute_action(
    asset: "SimAsset", action: AIAction, manager: "SimulationManager"
) -> None:
    """Dispatch to the correct behavior handler."""
    if action == AIAction.RETREAT:
        _execute_retreat(asset, manager)
    elif action == AIAction.SEEK_COVER:
        _execute_seek_cover(asset, manager)
    elif action == AIAction.CALL_SUPPORT:
        _execute_call_support(asset, manager)
    elif action == AIAction.ADVANCE:
        _execute_advance(asset, manager)
    # HOLD and ENGAGE: no movement commanded — asset stays


# ---------------------------------------------------------------------------
# AI tick entry point
# ---------------------------------------------------------------------------

def execute_ai_tick(manager: "SimulationManager") -> None:
    """
    Run one AI decision cycle for all non-blue-faction alive assets.

    Called once per simulation tick after movement processing.
    """
    for asset in list(manager.assets.values()):
        if not asset.is_alive():
            continue
        faction = manager.factions.get(asset.faction_id)
        if faction is None or faction.side == "blue":
            continue
        action = pick_action(asset, manager)
        execute_action(asset, action, manager)
