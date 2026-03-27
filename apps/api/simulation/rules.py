"""Deterministic rules engine — strike resolution, movement, infrastructure cascading."""

import math
import random
from enum import Enum

from pydantic import BaseModel

from simulation.profiles import (
    StrikeProfile,
    WeaponProfile,
    get_strike_profile,
    get_weapon_profile,
)


# ── Strike Resolution ────────────────────────────────────────────────────────


class StrikeOutcome(str, Enum):
    DESTROYED = "destroyed"
    DAMAGED = "damaged"
    MISSED = "missed"


class StrikeResult(BaseModel):
    """Result of resolving a strike."""

    outcome: StrikeOutcome
    hit: bool
    destroyed: bool
    crew_survived: bool
    damage_percent: float  # 0.0–1.0
    description: str


def resolve_strike(weapon: WeaponProfile, target: StrikeProfile) -> StrikeResult:
    """Roll a strike: weapon accuracy vs target hardness."""
    hit = random.random() < weapon.accuracy

    if not hit:
        return StrikeResult(
            outcome=StrikeOutcome.MISSED,
            hit=False,
            destroyed=False,
            crew_survived=True,
            damage_percent=0.0,
            description="Strike missed the target.",
        )

    # Penetration vs hardness determines kill probability
    kill_chance = weapon.penetration / max(target.hardness, 0.01)
    kill_chance = min(kill_chance, 1.0)
    destroyed = random.random() < kill_chance

    # Partial damage if not destroyed
    damage = 1.0 if destroyed else random.uniform(0.1, 0.6)
    crew_survived = random.random() < target.crew_survival

    if destroyed:
        return StrikeResult(
            outcome=StrikeOutcome.DESTROYED,
            hit=True,
            destroyed=True,
            crew_survived=crew_survived,
            damage_percent=1.0,
            description="Target destroyed.",
        )

    return StrikeResult(
        outcome=StrikeOutcome.DAMAGED,
        hit=True,
        destroyed=False,
        crew_survived=True,
        damage_percent=damage,
        description=f"Target hit, {damage:.0%} damage sustained.",
    )


def resolve_strike_by_names(weapon_id: str, asset_type: str) -> StrikeResult | None:
    """Convenience: resolve a strike from weapon ID and asset type name."""
    weapon = get_weapon_profile(weapon_id)
    if weapon is None:
        return None
    target = get_strike_profile(asset_type)
    return resolve_strike(weapon, target)


# ── Movement ─────────────────────────────────────────────────────────────────


# Terrain multipliers: 1.0 = flat/open, lower = slower
TERRAIN_SPEED: dict[str, float] = {
    "open": 1.0,
    "urban": 0.5,
    "mountainous": 0.3,
    "forest": 0.6,
    "desert": 0.9,
    "water": 1.0,  # naval assets
    "air": 1.0,  # aircraft ignore terrain
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points in kilometers."""
    r = 6371.0  # Earth radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def ticks_to_arrive(
    speed_kmh: float,
    distance_km: float,
    terrain: str = "open",
    tick_duration_s: float = 10.0,
) -> int:
    """Calculate how many ticks it takes to travel a distance."""
    multiplier = TERRAIN_SPEED.get(terrain, 1.0)
    effective_speed = speed_kmh * multiplier

    if effective_speed <= 0:
        return -1  # cannot move

    hours = distance_km / effective_speed
    seconds = hours * 3600
    ticks = math.ceil(seconds / tick_duration_s)
    return max(ticks, 1)


def bearing_degrees(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate initial bearing from point 1 to point 2 in degrees."""
    d_lon = math.radians(lon2 - lon1)
    lat1_r = math.radians(lat1)
    lat2_r = math.radians(lat2)

    x = math.sin(d_lon) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(lat2_r) * math.cos(d_lon)

    bearing = math.degrees(math.atan2(x, y))
    return (bearing + 360) % 360


def interpolate_position(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
    fraction: float,
) -> tuple[float, float]:
    """Linear interpolation between two lat/lon points. Fraction 0–1."""
    fraction = max(0.0, min(1.0, fraction))
    lat = lat1 + (lat2 - lat1) * fraction
    lon = lon1 + (lon2 - lon1) * fraction
    return lat, lon


# ── Infrastructure Cascading ─────────────────────────────────────────────────


class DependencyLink(BaseModel):
    """A dependency between two assets: source SUPPLIES/CONNECTS target."""

    source_id: str
    target_id: str
    link_type: str  # "supplies", "connects", "defends"
    degradation_rate: float = 0.1  # how much the target degrades per tick without source


def find_dependents(
    destroyed_id: str,
    dependencies: list[DependencyLink],
) -> list[DependencyLink]:
    """Find all assets that depend on a destroyed asset."""
    return [dep for dep in dependencies if dep.source_id == destroyed_id]
