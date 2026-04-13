"""Red-side AI — doctrine-based targeting and counterattack engine.

Each tick the RedAI runs three passes per red faction:

  1. Retreat pass  — damaged assets (health < RETREAT_HEALTH) fall back to their
                     nearest Forward Operating Base or Field Hospital.

  2. Reinforce pass — after an engagement, if the shooter is outnumbered by local
                      blue assets, nearby red allies converge to support.

  3. Engagement pass — surviving, un-suppressed assets that have a weapon mapping
                       pick and strike the highest-priority blue target according
                       to the faction's Doctrine.

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

from simulation.assets import AssetStatus, SimAsset
from simulation.detection import compute_detections
from simulation.events import EventType
from simulation.faction import Doctrine
from simulation.profiles import CATEGORY_MAP
from simulation.rules import haversine_km, resolve_strike_by_names

if TYPE_CHECKING:
    from simulation.manager import SimulationManager

logger = logging.getLogger(__name__)


# ── Thresholds & constants ────────────────────────────────────────────────────

RETREAT_HEALTH: float = 0.30          # health fraction below which an asset retreats
REINFORCE_RATIO: float = 2.0          # enemies/allies ratio that triggers reinforcement call
REINFORCE_DETECT_KM: float = 10.0     # radius within which to count local forces
REINFORCE_RALLY_KM: float = 20.0      # radius within which to pull reinforcements
REINFORCE_MAX_ASSETS: int = 3         # max allies to redirect per reinforcement event
COVER_RADIUS_KM: float = 1.0          # km radius in which nearby structures grant cover

# Suppression duration per doctrine (ticks the blue target cannot act after being hit)
_DOCTRINE_SUPPRESSION: dict[Doctrine, int] = {
    Doctrine.AGGRESSIVE: 4,
    Doctrine.DEFENSIVE:  3,
    Doctrine.GUERRILLA:  6,   # guerrilla suppresses longer with persistent harassment
    Doctrine.ASYMMETRIC: 5,
}

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

# Asset-type substrings that count as cover-providing structures
_COVER_STRUCTURE_TYPES: tuple[str, ...] = (
    "Forward Operating Base",
    "Field Hospital",
    "Oil Plant",
    "Power Grid",
    "Oil Pump Jack",
    "command",
    "depot",
    "station",
    "bunker",
    "trench",
)

# Asset-type substrings that qualify as FOBs for retreat destinations
_FOB_TYPES: tuple[str, ...] = (
    "Forward Operating Base",
    "Field Hospital",
    "base",
    "headquarters",
    "HQ",
)

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
        # asset_id → tick on which this asset last retreated (avoid spamming RTB orders)
        self._retreat_issued: dict[str, int] = {}

    def run_tick(self, mgr: "SimulationManager") -> RedAIResult:
        """Evaluate and execute red-side behaviours for this tick.

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

            # 1. Retreat pass — damaged assets fall back before engaging.
            self._run_retreats(faction_id, mgr, result)

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

            # 2. Engagement pass — gather shooters, detect targets, fire.
            shooters = self._get_shooters(faction_id, mgr)
            if not shooters:
                continue

            detected_blue = self._detect_blue(shooters, mgr)
            if not detected_blue:
                continue

            target = self._select_target(faction.doctrine, detected_blue)
            if target is None:
                continue

            shooter = self._select_shooter(shooters, target)
            if shooter is None:
                continue

            # Cover bonus: target in cover takes reduced damage.
            cover_mult = self._cover_multiplier(target, mgr)

            weapon_id = ASSET_WEAPONS[shooter.asset_type]
            strike_result = resolve_strike_by_names(weapon_id, target.asset_type)
            if strike_result is None:
                logger.warning(
                    "RedAI: no strike result for weapon=%s target_type=%s",
                    weapon_id,
                    target.asset_type,
                )
                continue

            # Apply cover-reduced damage.
            effective_damage = strike_result.damage_percent * cover_mult
            target.apply_damage(effective_damage)
            mgr._update_faction_capability(target.faction_id)

            if strike_result.destroyed and cover_mult == 1.0:
                mgr._handle_infrastructure_cascade(target.asset_id)

            # Suppression: blue asset cannot return fire for N ticks.
            suppression_ticks = _DOCTRINE_SUPPRESSION[faction.doctrine]
            target.suppress(mgr.tick + suppression_ticks)

            # Emit RETALIATION event.
            cover_note = f" (cover: {cover_mult:.0%})" if cover_mult < 1.0 else ""
            mgr.event_queue.create_and_schedule(
                event_type=EventType.RETALIATION,
                description=(
                    f"[{faction.name}] {shooter.callsign} engaged "
                    f"{target.callsign}: {strike_result.description}{cover_note}"
                ),
                scheduled_tick=mgr.tick,
                faction_id=faction_id,
            )

            faction.consume_resources(ammo=0.05)
            self._cooldowns[faction_id] = mgr.tick + _DOCTRINE_COOLDOWN[faction.doctrine]

            alert = (
                f"INCOMING [{faction.name}] {shooter.callsign} → "
                f"{target.callsign} | {strike_result.description}"
            )
            result.alerts.append(alert)
            logger.info("RedAI tick=%d: %s", mgr.tick, alert)

            result.asset_updates.append({
                "asset_id": target.asset_id,
                "event": "damaged_by_red",
                "health": target.health,
                "status": target.status.value,
                "suppressed_until_tick": target.suppressed_until_tick,
                "attacker_callsign": shooter.callsign,
                "attacker_faction": faction.name,
                "weapon": weapon_id,
                "outcome": strike_result.outcome.value,
                "cover_multiplier": cover_mult,
            })

            # 3. Reinforce pass — check if shooter is outnumbered post-engagement.
            self._run_reinforcements(faction_id, shooter, detected_blue, mgr, result)

        return result

    # ── Retreat ───────────────────────────────────────────────────────────────

    def _run_retreats(
        self,
        faction_id: str,
        mgr: "SimulationManager",
        result: RedAIResult,
    ) -> None:
        """Order critically damaged assets to fall back to the nearest FOB."""
        # Only re-issue a retreat order if it's been > 20 ticks since the last one
        RETREAT_COOLDOWN = 20

        for asset in mgr.assets.values():
            if asset.faction_id != faction_id:
                continue
            if not asset.is_alive():
                continue
            if asset.health >= RETREAT_HEALTH:
                continue
            if asset.status == AssetStatus.RTB:
                continue  # already retreating

            last_retreat = self._retreat_issued.get(asset.asset_id, -RETREAT_COOLDOWN)
            if mgr.tick - last_retreat < RETREAT_COOLDOWN:
                continue

            fob = self._nearest_fob(asset, faction_id, mgr)
            if fob is None:
                continue

            mgr.command_move(
                asset.asset_id,
                fob.position.latitude,
                fob.position.longitude,
                dest_alt=asset.position.altitude_m,
            )
            asset.status = AssetStatus.RTB
            self._retreat_issued[asset.asset_id] = mgr.tick

            alert = (
                f"RETREAT [{mgr.factions[faction_id].name}] "
                f"{asset.callsign} (health {asset.health:.0%}) falling back to {fob.callsign}"
            )
            result.alerts.append(alert)
            logger.info("RedAI tick=%d retreat: %s", mgr.tick, alert)

            result.asset_updates.append({
                "asset_id": asset.asset_id,
                "event": "retreating",
                "health": asset.health,
                "status": asset.status.value,
                "destination_callsign": fob.callsign,
            })

    def _nearest_fob(
        self,
        asset: SimAsset,
        faction_id: str,
        mgr: "SimulationManager",
    ) -> SimAsset | None:
        """Find the nearest alive FOB/field hospital belonging to this faction."""
        best: SimAsset | None = None
        best_dist = float("inf")

        for candidate in mgr.assets.values():
            if candidate.faction_id != faction_id:
                continue
            if not candidate.is_alive():
                continue
            if candidate.asset_id == asset.asset_id:
                continue
            if not any(kw.lower() in candidate.asset_type.lower() for kw in _FOB_TYPES):
                continue

            dist = haversine_km(
                asset.position.latitude, asset.position.longitude,
                candidate.position.latitude, candidate.position.longitude,
            )
            if dist < best_dist:
                best_dist = dist
                best = candidate

        return best

    # ── Reinforcements ────────────────────────────────────────────────────────

    def _run_reinforcements(
        self,
        faction_id: str,
        shooter: SimAsset,
        detected_blue: list[SimAsset],
        mgr: "SimulationManager",
        result: RedAIResult,
    ) -> None:
        """If shooter is outnumbered locally, redirect nearby red allies to converge."""
        # Count blue forces within detection radius of shooter
        local_blue = sum(
            1 for b in detected_blue
            if haversine_km(
                shooter.position.latitude, shooter.position.longitude,
                b.position.latitude, b.position.longitude,
            ) <= REINFORCE_DETECT_KM
        )
        if local_blue == 0:
            return

        # Count red allies already near the shooter
        local_red = sum(
            1 for a in mgr.assets.values()
            if a.faction_id == faction_id
            and a.is_alive()
            and a.asset_id != shooter.asset_id
            and a.status not in (AssetStatus.RTB, AssetStatus.DESTROYED)
            and haversine_km(
                shooter.position.latitude, shooter.position.longitude,
                a.position.latitude, a.position.longitude,
            ) <= REINFORCE_DETECT_KM
        )

        # Only call for reinforcements if outnumbered by REINFORCE_RATIO
        if local_blue < REINFORCE_RATIO * max(local_red, 1):
            return

        # Find available allies within rally radius to converge
        candidates: list[tuple[float, SimAsset]] = []
        for ally in mgr.assets.values():
            if ally.faction_id != faction_id:
                continue
            if not ally.is_alive():
                continue
            if ally.asset_id == shooter.asset_id:
                continue
            if ally.status in (AssetStatus.RTB, AssetStatus.ON_MISSION, AssetStatus.DESTROYED):
                continue
            if ally.asset_type not in ASSET_WEAPONS:
                continue  # non-combatant

            dist = haversine_km(
                shooter.position.latitude, shooter.position.longitude,
                ally.position.latitude, ally.position.longitude,
            )
            if dist <= REINFORCE_RALLY_KM:
                candidates.append((dist, ally))

        # Redirect up to REINFORCE_MAX_ASSETS closest allies
        candidates.sort(key=lambda x: x[0])
        rallied = 0
        for _, ally in candidates[:REINFORCE_MAX_ASSETS]:
            mgr.command_move(
                ally.asset_id,
                shooter.position.latitude,
                shooter.position.longitude,
                dest_alt=ally.position.altitude_m,
            )
            rallied += 1
            result.asset_updates.append({
                "asset_id": ally.asset_id,
                "event": "reinforcing",
                "status": ally.status.value,
                "converging_on": shooter.asset_id,
            })

        if rallied:
            alert = (
                f"REINFORCE [{mgr.factions[faction_id].name}] "
                f"{rallied} unit(s) converging on {shooter.callsign} "
                f"(outnumbered {local_blue}:{max(local_red,1)})"
            )
            result.alerts.append(alert)
            logger.info("RedAI tick=%d reinforce: %s", mgr.tick, alert)

    # ── Cover bonus ───────────────────────────────────────────────────────────

    def _cover_multiplier(self, target: SimAsset, mgr: "SimulationManager") -> float:
        """Return a damage multiplier (< 1.0) if target is sheltering near a structure.

        Structures within COVER_RADIUS_KM grant 20–40% damage reduction depending
        on structure hardness category.
        """
        for structure in mgr.assets.values():
            if not structure.is_alive():
                continue
            if structure.asset_id == target.asset_id:
                continue
            if not any(kw.lower() in structure.asset_type.lower() for kw in _COVER_STRUCTURE_TYPES):
                continue

            dist = haversine_km(
                target.position.latitude, target.position.longitude,
                structure.position.latitude, structure.position.longitude,
            )
            if dist <= COVER_RADIUS_KM:
                # Reinforced structures provide better cover than light ones
                cat = CATEGORY_MAP.get(structure.asset_type, "")
                if cat in ("reinforced_structure", "command_node"):
                    return 0.60   # 40% reduction
                return 0.80       # 20% reduction

        return 1.0  # no cover

    # ── Private helpers ───────────────────────────────────────────────────────

    def _get_shooters(
        self,
        faction_id: str,
        mgr: "SimulationManager",
    ) -> list[SimAsset]:
        """Return alive, un-suppressed assets for this faction that have a weapon mapping."""
        return [
            a
            for a in mgr.assets.values()
            if a.faction_id == faction_id
            and a.is_alive()
            and a.status != AssetStatus.RTB
            and not a.is_suppressed(mgr.tick)
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
