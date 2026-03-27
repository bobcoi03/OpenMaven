"""Scenario loader — initialize a simulation from a scenario definition.

A scenario defines the theatre, factions, and initial asset placement.
This module builds a SimulationManager from that definition.
"""

import uuid
from typing import Any

from simulation.assets import AssetStatus, Position, SimAsset
from simulation.faction import Doctrine, Faction, Leader, Resources
from simulation.manager import SimulationManager
from simulation.rules import DependencyLink


def load_default_scenario() -> SimulationManager:
    """Load the built-in Syria/Iraq border theatre scenario."""
    mgr = SimulationManager(tick_duration_s=10.0)

    _add_factions(mgr)
    _add_blue_assets(mgr)
    _add_red_assets(mgr)
    _add_civilian_assets(mgr)
    _add_dependencies(mgr)

    return mgr


# ── Factions ─────────────────────────────────────────────────────────────────


def _add_factions(mgr: SimulationManager) -> None:
    mgr.add_faction(Faction(
        faction_id="blue",
        name="BLUFOR Coalition",
        side="blue",
        doctrine=Doctrine.DEFENSIVE,
        leadership=[
            Leader(leader_id="blue-l1", name="Gen. Harris", rank="4-Star General"),
            Leader(leader_id="blue-l2", name="Lt. Gen. Mitchell", rank="3-Star General"),
        ],
        retaliation_threshold=0.4,
    ))

    mgr.add_faction(Faction(
        faction_id="red",
        name="OPFOR",
        side="red",
        doctrine=Doctrine.AGGRESSIVE,
        leadership=[
            Leader(leader_id="red-l1", name="Gen. Volkov", rank="General"),
            Leader(leader_id="red-l2", name="Col. Petrov", rank="Colonel"),
            Leader(leader_id="red-l3", name="Maj. Karimov", rank="Major"),
        ],
        retaliation_threshold=0.3,
        resources=Resources(fuel=0.8, ammo=0.9, manpower=0.7),
    ))

    mgr.add_faction(Faction(
        faction_id="civilian",
        name="Civilian Population",
        side="civilian",
        doctrine=Doctrine.DEFENSIVE,
        retaliation_threshold=1.0,  # never retaliates
    ))


# ── BLUFOR Assets ────────────────────────────────────────────────────────────


def _add_blue_assets(mgr: SimulationManager) -> None:
    blue_assets = [
        # Drones
        ("REAPER-01", "MQ-9 Reaper", 34.4215, 40.8732, 7580, 10.84, 370, "FLIR SS380-HD", ["hellfire", "gbu_38_jdam"]),
        ("REAPER-02", "MQ-9 Reaper", 35.1102, 41.2290, 6200, 245.3, 310, "MTS-B EO/IR", ["hellfire"]),
        ("HAWKEYE-01", "RQ-4 Global Hawk", 36.1200, 40.5500, 18200, 270.0, 575, "EISS / MP-RTIP Radar", []),
        # Fighter Jets
        ("FALCON-01", "F-16C Fighting Falcon", 34.8500, 41.5200, 9150, 135.2, 780, "AN/APG-68 Radar", ["gbu_38_jdam", "gbu_12_paveway"]),
        ("FALCON-02", "F-16C Fighting Falcon", 33.9500, 42.1000, 8800, 310.5, 820, "AN/APG-68 Radar", ["gbu_38_jdam"]),
        ("LIGHTNING-01", "F-35B Lightning II", 35.2300, 41.8000, 10500, 90.0, 920, "AN/APG-81 AESA", ["gbu_12_paveway", "cruise_missile"]),
        # ISR
        ("SENTRY-01", "E-3A AWACS", 36.5000, 41.2000, 9100, 180.0, 720, "AN/APY-2 Radar", []),
        # Gunship
        ("SPOOKY-01", "AC-130 Hercules", 35.0200, 40.9000, 4500, 190.0, 480, "AN/APQ-180 Radar", ["autocannon_30mm", "artillery_155"]),
        # Helicopters
        ("APACHE-01", "AH-64 Apache", 34.3800, 40.7500, 850, 280.0, 230, "AN/APG-78 Longbow", ["hellfire"]),
        ("CHINOOK-01", "CH-47 Chinook", 34.5200, 41.0000, 1200, 45.0, 260, None, []),
        # Ground
        ("THUNDER-01", "M1 Abrams", 34.2100, 40.9800, 310, 175.0, 0, None, ["small_arms"]),
        ("THUNDER-02", "M1 Abrams", 34.3800, 40.8500, 295, 220.0, 0, None, ["small_arms"]),
        ("THUNDER-03", "M1 Abrams", 34.0500, 41.1200, 280, 90.0, 0, None, ["small_arms"]),
        ("BULLDOG-01", "M2 Bradley IFV", 34.3200, 40.9200, 300, 140.0, 0, None, ["autocannon_30mm"]),
        ("WARHORSE-01", "HMMWV Transport", 34.4800, 40.8000, 275, 350.0, 0, None, ["small_arms"]),
        # Artillery
        ("STEEL-RAIN-01", "M142 HIMARS", 34.4500, 40.7100, 290, 330.0, 0, None, ["himars_rocket"]),
        ("HOWITZER-01", "M777 Howitzer", 34.2800, 40.6300, 340, 45.0, 0, None, ["artillery_155"]),
        ("BASEPLATE-01", "M224 Mortar", 34.1800, 40.8500, 310, 0.0, 0, None, ["mortar_81mm"]),
        # Naval
        ("AEGIS-01", "DDG-51 Arleigh Burke", 34.6500, 35.8000, 0, 90.0, 55, "AN/SPY-1D Radar", ["cruise_missile", "sam_missile"]),
        ("SHADOW-01", "USS Seawolf SSN-21", 34.9000, 35.2000, -120, 195.0, 46, "BQQ-10 Sonar", ["torpedo"]),
        ("GATOR-01", "USS Wasp LHD-1", 34.7500, 35.5000, 0, 270.0, 37, "AN/SPS-52 Radar", []),
        # Air Defense
        ("PATRIOT-01", "MIM-104 Patriot", 34.7300, 41.0800, 285, 315.0, 0, "AN/MPQ-53 Radar", ["sam_missile"]),
        ("IRON-DOME-01", "Iron Dome Defense System", 34.5100, 40.9200, 195, 90.0, 0, "EL/M-2084 Radar", ["sam_missile"]),
        # EW
        ("JAMMER-01", "EW Radar Vehicle", 34.5500, 40.6800, 350, 60.0, 0, "AESA Jammer Array", []),
        # Logistics
        ("ATLAS-01", "C-17 Globemaster III", 35.8200, 41.5000, 8500, 90.0, 830, None, []),
        ("SUPPLY-07", "M977 HEMTT Supply Truck", 34.3100, 40.9500, 270, 120.0, 55, None, []),
        ("MEDIC-01", "Field Hospital", 34.6200, 41.1500, 220, 0.0, 0, None, []),
    ]

    for callsign, atype, lat, lon, alt, hdg, spd, sensor, weapons in blue_assets:
        mgr.add_asset(SimAsset(
            asset_id=f"blue-{callsign.lower()}",
            callsign=callsign,
            asset_type=atype,
            faction_id="blue",
            position=Position(latitude=lat, longitude=lon, altitude_m=alt, heading_deg=hdg),
            speed_kmh=spd,
            max_speed_kmh=spd if spd > 0 else 0,
            sensor_type=sensor,
            weapons=weapons,
        ))


# ── OPFOR Assets ─────────────────────────────────────────────────────────────


def _add_red_assets(mgr: SimulationManager) -> None:
    red_assets = [
        ("HOSTILE-T72-01", "T-72A MBT", 35.3200, 40.3500, 380, 210.0, 0, "1A40 Fire Control", ["small_arms"]),
        ("HOSTILE-T72-02", "T-72A MBT", 35.2800, 40.4000, 390, 225.0, 0, "1A40 Fire Control", ["small_arms"]),
        ("HOSTILE-BMP-01", "BMP-2 IFV", 35.3500, 40.3800, 375, 215.0, 0, None, ["autocannon_30mm"]),
        ("HOSTILE-BMP-02", "BMP-2 IFV", 35.4000, 40.4200, 365, 200.0, 0, None, ["autocannon_30mm"]),
        ("HOSTILE-TECH-01", "Technical (Armed Pickup)", 34.9800, 40.2100, 420, 160.0, 65, None, ["small_arms"]),
        ("HOSTILE-TECH-02", "Technical (Armed Pickup)", 35.0500, 40.1800, 400, 145.0, 70, None, ["small_arms"]),
        ("GROWLER-01", "S-400 Triumf SAM", 35.4200, 40.1500, 410, 0.0, 0, "91N6E Radar", ["sam_missile"]),
        ("GROWLER-02", "S-400 Triumf SAM", 35.6000, 40.0800, 430, 0.0, 0, "91N6E Radar", ["sam_missile"]),
    ]

    for callsign, atype, lat, lon, alt, hdg, spd, sensor, weapons in red_assets:
        mgr.add_asset(SimAsset(
            asset_id=f"red-{callsign.lower()}",
            callsign=callsign,
            asset_type=atype,
            faction_id="red",
            position=Position(latitude=lat, longitude=lon, altitude_m=alt, heading_deg=hdg),
            speed_kmh=spd,
            max_speed_kmh=spd if spd > 0 else 0,
            sensor_type=sensor,
            weapons=weapons,
        ))


# ── Civilian Assets ──────────────────────────────────────────────────────────


def _add_civilian_assets(mgr: SimulationManager) -> None:
    civ_assets = [
        ("CIV-BUS-01", "Civilian Bus", 34.6000, 40.7500, 260, 90.0, 40),
        ("CIV-BUS-02", "Civilian Bus", 34.4200, 40.6200, 245, 180.0, 35),
        ("CIV-SEDAN-01", "Civilian Sedan", 34.5800, 40.7800, 255, 270.0, 50),
        ("CIV-SEDAN-02", "Civilian Sedan", 34.3500, 40.9000, 230, 45.0, 55),
    ]

    for callsign, atype, lat, lon, alt, hdg, spd in civ_assets:
        mgr.add_asset(SimAsset(
            asset_id=f"civ-{callsign.lower()}",
            callsign=callsign,
            asset_type=atype,
            faction_id="civilian",
            position=Position(latitude=lat, longitude=lon, altitude_m=alt, heading_deg=hdg),
            speed_kmh=spd,
            max_speed_kmh=spd,
        ))


# ── Infrastructure Dependencies ──────────────────────────────────────────────


def _add_dependencies(mgr: SimulationManager) -> None:
    """Wire up infrastructure cascading links."""
    # Example: if the FOB is destroyed, the PATRIOT loses radar feed
    mgr.add_dependency(DependencyLink(
        source_id="blue-medic-01",
        target_id="blue-baseplate-01",
        link_type="supplies",
        degradation_rate=0.2,
    ))
