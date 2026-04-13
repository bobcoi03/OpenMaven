"""SIGINT intercept model and computation.

Each tick, blue EW assets detect enemy radio emissions within an 80 km radius.
Results are included in the StateDiff broadcast to WebSocket clients.
"""

import random
import uuid

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
    if any(k in t for k in ("su-57", "t-14", "t-90m", "su-35", "su-34", "ka-52", "mi-28", "iskander", "s-400")):
        return "encrypted_data"
    if any(k in t for k in ("awacs", "e-3a", "ac-130", "patriot", "iron dome", "pantsir", "f-35", "lightning")):
        return "encrypted_voice"
    if any(k in t for k in ("global hawk", "ew radar", "jammer", "reaper")):
        return "data_burst"
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
    rng: random.Random,
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
            if dist_km >= EW_SIGINT_RANGE_KM:
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
