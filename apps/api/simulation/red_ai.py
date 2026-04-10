"""Red-side AI — doctrine-based targeting and counterattack engine.

Each tick, the RedAI evaluates every red faction and decides whether to
launch an engagement against blue assets it can detect with its own sensors.

Behaviour is shaped by the faction's Doctrine:

  AGGRESSIVE  — seeks engagement proactively; prioritises high-value blue targets.
  DEFENSIVE   — only fires once capability loss exceeds retaliation_threshold.
  GUERRILLA   — constant harassment; favours soft vehicles and logistics.
  ASYMMETRIC  — deliberate stand-off strikes on infrastructure and command nodes.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from simulation.assets import SimAsset
from simulation.detection import compute_detections
from simulation.events import EventType
from simulation.faction import Doctrine
from simulation.profiles import CATEGORY_MAP
from simulation.rules import haversine_km, resolve_strike_by_names

if TYPE_CHECKING:
    from simulation.manager import SimulationManager

logger = logging.getLogger(__name__)


# ── Weapon loadout per red asset type ────────────────────────────────────────
# Maps asset_type → weapon_id from WEAPON_PROFILES.
# Only asset types listed here are eligible to act as shooters.

ASSET_WEAPONS: dict[str, str] = {
    # OPFOR armour
    "T-72A MBT":           "autocannon_30mm",
    "T-90M Proryv MBT":    "autocannon_30mm",
    "T-14 Armata MBT":     "autocannon_30mm",
    "BMP-2 IFV":           "autocannon_30mm",
    "BMP-3 IFV":           "autocannon_30mm",
    "BTR-82A APC":         "autocannon_30mm",
    # OPFOR air
    "Su-35S Flanker-E":    "cruise_missile",
    "Su-34 Fullback":      "cruise_missile",
    "Su-57 Felon":         "cruise_missile",
    "Ka-52 Alligator":     "autocannon_30mm",
    "Mi-28NM Night Hunter":"autocannon_30mm",
    # OPFOR air defence — SAMs engage blue aircraft
    "S-400 Triumf SAM":    "sam_missile",
    "Pantsir-S1":          "sam_missile",
    # OPFOR ballistic
    "Iskander-M":          "ballistic_missile",
    # ISIS
    "Toyota Hilux Technical (HMG)": "small_arms",
    "Captured T-55":       "autocannon_30mm",
    "ZU-23-2 AA Gun":      "autocannon_30mm",
    "RPG-7 Team":          "small_arms",
    "Infantry Squad":      "small_arms",
    # Iran
    "Shahed-136 Loitering Munition": "cruise_missile",
}

# ── Minimum ticks between engagements per doctrine ───────────────────────────

_DOCTRINE_COOLDOWN: dict[Doctrine, int] = {
    Doctrine.AGGRESSIVE: 3,   # attacks every ~30 s sim-time
    Doctrine.DEFENSIVE:  8,   # conserves resources until threatened
    Doctrine.GUERRILLA:  2,   # constant harassment
    Doctrine.ASYMMETRIC: 6,   # deliberate, paced strikes
}

# ── Target scoring weights per doctrine ──────────────────────────────────────
# Maps CATEGORY_MAP category → desirability score (higher = more attractive).

_DOCTRINE_TARGET_SCORES: dict[Doctrine, dict[str, float]] = {
    Doctrine.AGGRESSIVE: {
        "aircraft_airborne":    10.0,
        "aircraft_grounded":     9.0,
        "armored_vehicle":       8.0,
        "sam_site":              7.0,
        "radar_installation":    6.0,
        "soft_vehicle":          5.0,
        "naval_vessel":          4.0,
        "reinforced_structure":  3.0,
        "supply_depot":          2.0,
        "infantry_squad":        1.0,
    },
    Doctrine.DEFENSIVE: {
        "aircraft_airborne":    9.0,
        "sam_site":             10.0,
        "aircraft_grounded":    8.0,
        "radar_installation":   5.0,
        "armored_vehicle":      6.0,
        "soft_vehicle":         4.0,
        "infantry_squad":       3.0,
        "supply_depot":         1.0,
        "reinforced_structure": 1.0,
    },
    Doctrine.GUERRILLA: {
        "soft_vehicle":         10.0,
        "supply_depot":          9.0,
        "infantry_squad":        8.0,
        "radar_installation":    6.0,
        "reinforced_structure":  5.0,
        "aircraft_grounded":     4.0,
        "armored_vehicle":       2.0,   # avoid heavy armour
        "aircraft_airborne":     1.0,
        "sam_site":              1.0,
    },
    Doctrine.ASYMMETRIC: {
        "reinforced_structure": 10.0,   # FOBs, command nodes
        "radar_installation":    9.0,
        "sam_site":              8.0,
        "aircraft_grounded":     7.0,
        "aircraft_airborne":     6.0,
        "supply_depot":          5.0,
        "soft_vehicle":          3.0,
        "armored_vehicle":       2.0,
        "infantry_squad":        1.0,
    },
}

_DEFAULT_TARGET_SCORE: float = 1.0


# ── Result container ──────────────────────────────────────────────────────────


@dataclass
class RedAIResult:
    """Output from a single RedAI tick."""

    alerts: list[str] = field(default_factory=list)
    asset_updates: list[dict] = field(default_factory=list)


# ── Red AI ────────────────────────────────────────────────────────────────────


class RedAI:
    """Doctrine-driven AI that fires red factions back at blue each tick.

    Instantiate once on the SimulationManager and call ``run_tick(mgr)``
    from ``_advance_tick``.  Returns a ``RedAIResult`` with alert strings
    and asset-update dicts to merge into the outgoing ``StateDiff``.
    """

    def __init__(self) -> None:
        # faction_id → tick on which this faction may next act
        self._cooldowns: dict[str, int] = {}
        # faction_id → capability recorded at simulation start (baseline)
        self._initial_capabilities: dict[str, float] = {}

    def run_tick(self, mgr: "SimulationManager") -> RedAIResult:
        """Evaluate and execute red-side engagements for this tick.

        Args:
            mgr: The live SimulationManager holding all world state.

        Returns:
            RedAIResult with alerts and asset_updates for the current tick.
        """
        result = RedAIResult()

        for faction_id, faction in mgr.factions.items():
            if faction.side != "red":
                continue

            # Record baseline capability the first time we see this faction.
            if faction_id not in self._initial_capabilities:
                self._initial_capabilities[faction_id] = faction.capability

            # Suppress faction if morale or ammo is critically low.
            if faction.morale < 0.1 or faction.resources.ammo < 0.05:
                continue

            # DEFENSIVE doctrine: only act once enough damage has been received.
            if faction.doctrine == Doctrine.DEFENSIVE:
                initial = self._initial_capabilities[faction_id]
                if not faction.should_retaliate(initial):
                    continue

            # Cooldown gate — prevent every faction attacking every tick.
            if mgr.tick < self._cooldowns.get(faction_id, 0):
                continue

            # Gather alive shooters that have a weapon mapping.
            shooters = self._get_shooters(faction_id, mgr)
            if not shooters:
                continue

            # Run red-side detection: use red sensors against blue assets.
            detected_blue = self._detect_blue(shooters, mgr)
            if not detected_blue:
                continue

            # Select the highest-priority target for this doctrine.
            target = self._select_target(faction.doctrine, detected_blue)
            if target is None:
                continue

            # Select the shooter closest to the chosen target.
            shooter = self._select_shooter(shooters, target)
            if shooter is None:
                continue

            # Resolve the strike through the existing rules engine.
            weapon_id = ASSET_WEAPONS[shooter.asset_type]
            strike_result = resolve_strike_by_names(weapon_id, target.asset_type)
            if strike_result is None:
                logger.warning(
                    "RedAI: no strike result for weapon=%s target_type=%s",
                    weapon_id,
                    target.asset_type,
                )
                continue

            # Apply damage to the blue asset.
            target.apply_damage(strike_result.damage_percent)
            mgr._update_faction_capability(target.faction_id)
            if strike_result.destroyed:
                mgr._handle_infrastructure_cascade(target.asset_id)

            # Emit a RETALIATION event so it appears in the event log.
            mgr.event_queue.create_and_schedule(
                event_type=EventType.RETALIATION,
                description=(
                    f"[{faction.name}] {shooter.callsign} engaged "
                    f"{target.callsign}: {strike_result.description}"
                ),
                scheduled_tick=mgr.tick,
                faction_id=faction_id,
            )

            # Consume a small amount of ammo.
            faction.consume_resources(ammo=0.05)

            # Set per-faction cooldown.
            self._cooldowns[faction_id] = mgr.tick + _DOCTRINE_COOLDOWN[faction.doctrine]

            # Build alert string for the frontend.
            alert = (
                f"INCOMING [{faction.name}] {shooter.callsign} → "
                f"{target.callsign} | {strike_result.description}"
            )
            result.alerts.append(alert)
            logger.info("RedAI tick=%d: %s", mgr.tick, alert)

            # Emit an asset_update so the frontend reflects the damage immediately.
            result.asset_updates.append({
                "asset_id": target.asset_id,
                "event": "damaged_by_red",
                "health": target.health,
                "status": target.status.value,
                "attacker_callsign": shooter.callsign,
                "attacker_faction": faction.name,
                "weapon": weapon_id,
                "outcome": strike_result.outcome.value,
            })

        return result

    # ── Private helpers ───────────────────────────────────────────────────────

    def _get_shooters(
        self,
        faction_id: str,
        mgr: "SimulationManager",
    ) -> list[SimAsset]:
        """Return alive assets for this faction that have a weapon mapping."""
        return [
            a
            for a in mgr.assets.values()
            if a.faction_id == faction_id
            and a.is_alive()
            and a.asset_type in ASSET_WEAPONS
        ]

    def _detect_blue(
        self,
        shooters: list[SimAsset],
        mgr: "SimulationManager",
    ) -> list[SimAsset]:
        """Run red sensors against blue assets; return detected blue SimAssets.

        Uses the existing ``compute_detections`` function so detection physics
        (inverse-square law, sensor ranges, signatures) are identical for both
        sides.
        """
        blue_targets: dict[str, SimAsset] = {
            aid: a
            for aid, a in mgr.assets.items()
            if a.faction_id == "blue" and a.is_alive()
        }
        if not blue_targets:
            return []

        sensor_dict: dict[str, SimAsset] = {s.asset_id: s for s in shooters}
        readings = compute_detections(sensor_dict, blue_targets)

        return [
            mgr.assets[r.target_id]
            for r in readings
            if r.target_id in mgr.assets
        ]

    def _select_target(
        self,
        doctrine: Doctrine,
        detected_blue: list[SimAsset],
    ) -> SimAsset | None:
        """Pick the highest-priority blue target based on doctrine scoring.

        A small random jitter is added so ties between equal-priority targets
        resolve non-deterministically, keeping the simulation from always
        attacking the same asset.
        """
        scores = _DOCTRINE_TARGET_SCORES[doctrine]
        best: SimAsset | None = None
        best_score: float = -1.0

        for asset in detected_blue:
            if not asset.is_alive():
                continue
            cat = CATEGORY_MAP.get(asset.asset_type, "soft_vehicle")
            score = scores.get(cat, _DEFAULT_TARGET_SCORE)
            score += random.uniform(0.0, 0.5)   # jitter
            if score > best_score:
                best_score = score
                best = asset

        return best

    def _select_shooter(
        self,
        shooters: list[SimAsset],
        target: SimAsset,
    ) -> SimAsset | None:
        """Pick the alive shooter closest to the chosen target."""
        best: SimAsset | None = None
        best_dist: float = float("inf")

        for shooter in shooters:
            dist = haversine_km(
                shooter.position.latitude,
                shooter.position.longitude,
                target.position.latitude,
                target.position.longitude,
            )
            if dist < best_dist:
                best_dist = dist
                best = shooter

        return best
