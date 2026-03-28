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

    # Give all mobile assets initial patrol waypoints
    mgr.assign_all_patrols()

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


_MAX_SPEEDS: dict[str, float] = {
    "M1 Abrams": 65, "T-72A MBT": 60, "M2 Bradley IFV": 66,
    "BMP-2 IFV": 65, "BTR-82A APC": 80, "HMMWV Transport": 110,
    "Technical (Armed Pickup)": 100, "M977 HEMTT Supply Truck": 90,
    "Civilian Bus": 60, "Civilian Sedan": 120,
    "Infantry Squad": 8,
}


def _add_blue_assets(mgr: SimulationManager) -> None:
    """BLUFOR Coalition assets with geographically accurate positions.

    Placement rules:
    - Naval: Mediterranean Sea, 20-50 km offshore from Syrian coast
    - Aircraft: Airborne over AO at realistic altitudes
    - Ground armor/vehicles: On or near actual roads (M4, M7, M20 highways)
    - Artillery: Set back from front lines, near FOBs
    - Air defense: Near coalition bases
    """
    blue_assets = [
        # ── Drones (airborne over Euphrates Valley) ──────────────────
        # Over Deir ez-Zor area, orbiting at altitude
        ("REAPER-01", "MQ-9 Reaper", 35.35, 40.12, 7580, 10.0, 370, "FLIR SS380-HD", ["hellfire", "gbu_38_jdam"]),
        # Over Al-Mayadin, along Euphrates
        ("REAPER-02", "MQ-9 Reaper", 35.02, 40.44, 6200, 245.0, 310, "MTS-B EO/IR", ["hellfire"]),
        # High-altitude ISR over northern Syria
        ("HAWKEYE-01", "RQ-4 Global Hawk", 36.10, 39.50, 18200, 270.0, 575, "EISS / MP-RTIP Radar", []),

        # ── Fighter Jets (airborne) ──────────────────────────────────
        # Over eastern Syria, heading southeast toward Iraqi border
        ("FALCON-01", "F-16C Fighting Falcon", 35.50, 40.80, 9150, 135.0, 780, "AN/APG-68 Radar", ["gbu_38_jdam", "gbu_12_paveway"]),
        # Over Al-Qa'im border area
        ("FALCON-02", "F-16C Fighting Falcon", 34.40, 41.00, 8800, 310.0, 820, "AN/APG-68 Radar", ["gbu_38_jdam"]),
        # Over Raqqa area
        ("LIGHTNING-01", "F-35B Lightning II", 35.95, 39.00, 10500, 90.0, 920, "AN/APG-81 AESA", ["gbu_12_paveway", "cruise_missile"]),

        # ── ISR (high-altitude orbits) ───────────────────────────────
        # AWACS over northern AO, racetrack orbit
        ("SENTRY-01", "E-3A AWACS", 36.50, 40.00, 9100, 180.0, 720, "AN/APY-2 Radar", []),

        # ── Gunship (loitering over Euphrates Valley) ────────────────
        ("SPOOKY-01", "AC-130 Hercules", 35.10, 40.30, 4500, 190.0, 480, "AN/APQ-180 Radar", ["autocannon_30mm", "artillery_155"]),

        # ── Helicopters (low altitude, near ground forces) ───────────
        # Apache near Al-Bukamal, supporting ground ops
        ("APACHE-01", "AH-64 Apache", 34.48, 40.32, 850, 280.0, 230, "AN/APG-78 Longbow", ["hellfire"]),
        # Chinook resupply run along M7 highway corridor
        ("CHINOOK-01", "CH-47 Chinook", 34.90, 40.50, 1200, 45.0, 260, None, []),

        # ── Ground Armor (on M7 highway near Al-Bukamal) ────────────
        # M7 highway runs through Al-Bukamal (34.46°N, 40.34°E)
        ("THUNDER-01", "M1 Abrams", 34.46, 40.34, 175, 90.0, 0, None, ["small_arms"]),
        # On road 1km east of Al-Bukamal
        ("THUNDER-02", "M1 Abrams", 34.46, 40.36, 175, 90.0, 0, None, ["small_arms"]),
        # Advancing north along road toward Al-Mayadin
        ("THUNDER-03", "M1 Abrams", 34.65, 40.39, 180, 0.0, 0, None, ["small_arms"]),
        # Bradley escorting armor column
        ("BULLDOG-01", "M2 Bradley IFV", 34.50, 40.35, 175, 90.0, 0, None, ["autocannon_30mm"]),
        # HMMWV on M20 highway near Al-Tanf base (33.52°N, 38.66°E)
        ("WARHORSE-01", "HMMWV Transport", 33.52, 38.67, 540, 45.0, 55, None, ["small_arms"]),

        # ── Artillery (set back from front, near coalition FOB) ──────
        # HIMARS 15km behind front line, south of Al-Bukamal
        ("STEEL-RAIN-01", "M142 HIMARS", 34.35, 40.25, 175, 0.0, 0, None, ["himars_rocket"]),
        # Howitzer battery near Euphrates
        ("HOWITZER-01", "M777 Howitzer", 34.40, 40.28, 175, 45.0, 0, None, ["artillery_155"]),
        # Mortar team forward-deployed with ground forces
        ("BASEPLATE-01", "M224 Mortar", 34.48, 40.33, 175, 0.0, 0, None, ["mortar_81mm"]),

        # ── Naval (Eastern Mediterranean, offshore from Tartus) ──────
        # DDG-51 destroyer — 40km offshore in open Mediterranean
        ("AEGIS-01", "DDG-51 Arleigh Burke", 34.65, 34.50, 0, 90.0, 55, "AN/SPY-1D Radar", ["cruise_missile", "sam_missile"]),
        # SSN submarine — deep Mediterranean, 60km offshore
        ("SHADOW-01", "USS Seawolf SSN-21", 34.40, 34.20, -120, 195.0, 46, "BQQ-10 Sonar", ["torpedo"]),
        # LHD amphibious — between destroyer and coast, 50km offshore
        ("GATOR-01", "USS Wasp LHD-1", 34.55, 34.80, 0, 270.0, 37, "AN/SPS-52 Radar", []),

        # ── Air Defense (near coalition bases) ───────────────────────
        # Patriot battery at Al-Tanf base
        ("PATRIOT-01", "MIM-104 Patriot", 33.53, 38.65, 540, 0.0, 0, "AN/MPQ-53 Radar", ["sam_missile"]),
        # Iron Dome protecting Al-Bukamal area
        ("IRON-DOME-01", "Iron Dome Defense System", 34.42, 40.30, 175, 90.0, 0, "EL/M-2084 Radar", ["sam_missile"]),

        # ── EW (near front line) ─────────────────────────────────────
        ("JAMMER-01", "EW Radar Vehicle", 34.55, 40.38, 175, 60.0, 0, "AESA Jammer Array", []),

        # ── Logistics ────────────────────────────────────────────────
        # C-17 inbound from Turkey, over northern Syria
        ("ATLAS-01", "C-17 Globemaster III", 36.30, 38.50, 8500, 135.0, 830, None, []),
        # Supply truck on M20 highway heading east
        ("SUPPLY-07", "M977 HEMTT Supply Truck", 33.80, 39.10, 450, 90.0, 55, None, []),
        # Field hospital at Al-Tanf base
        ("MEDIC-01", "Field Hospital", 33.51, 38.68, 540, 0.0, 0, None, []),
    ]

    for callsign, atype, lat, lon, alt, hdg, spd, sensor, weapons in blue_assets:
        mgr.add_asset(SimAsset(
            asset_id=f"blue-{callsign.lower()}",
            callsign=callsign,
            asset_type=atype,
            faction_id="blue",
            position=Position(latitude=lat, longitude=lon, altitude_m=alt, heading_deg=hdg),
            speed_kmh=spd,
            max_speed_kmh=max(spd, _MAX_SPEEDS.get(atype, spd)),
            sensor_type=sensor,
            weapons=weapons,
        ))


# ── OPFOR Assets ─────────────────────────────────────────────────────────────


def _add_red_assets(mgr: SimulationManager) -> None:
    """OPFOR assets positioned around Deir ez-Zor city and northern Euphrates.

    T-72s and BMPs on roads in/around Deir ez-Zor (35.33°N, 40.14°E).
    Technicals on side roads. S-400s set back to protect the city.
    """
    red_assets = [
        # T-72s on main road through Deir ez-Zor
        ("HOSTILE-T72-01", "T-72A MBT", 35.33, 40.13, 210, 180.0, 0, "1A40 Fire Control", ["small_arms"]),
        ("HOSTILE-T72-02", "T-72A MBT", 35.31, 40.15, 210, 180.0, 0, "1A40 Fire Control", ["small_arms"]),
        # BMPs on road south of Deir ez-Zor toward Al-Mayadin
        ("HOSTILE-BMP-01", "BMP-2 IFV", 35.20, 40.20, 200, 200.0, 0, None, ["autocannon_30mm"]),
        ("HOSTILE-BMP-02", "BMP-2 IFV", 35.15, 40.25, 200, 200.0, 0, None, ["autocannon_30mm"]),
        # Technicals on roads near Al-Mayadin (35.02°N, 40.45°E)
        ("HOSTILE-TECH-01", "Technical (Armed Pickup)", 35.02, 40.44, 195, 160.0, 65, None, ["small_arms"]),
        ("HOSTILE-TECH-02", "Technical (Armed Pickup)", 34.95, 40.40, 190, 145.0, 70, None, ["small_arms"]),
        # S-400 batteries north of Deir ez-Zor, defending the city
        ("GROWLER-01", "S-400 Triumf SAM", 35.45, 40.05, 250, 0.0, 0, "91N6E Radar", ["sam_missile"]),
        # Second S-400 near Raqqa (35.95°N, 39.01°E)
        ("GROWLER-02", "S-400 Triumf SAM", 35.90, 39.05, 280, 0.0, 0, "91N6E Radar", ["sam_missile"]),
    ]

    for callsign, atype, lat, lon, alt, hdg, spd, sensor, weapons in red_assets:
        mgr.add_asset(SimAsset(
            asset_id=f"red-{callsign.lower()}",
            callsign=callsign,
            asset_type=atype,
            faction_id="red",
            position=Position(latitude=lat, longitude=lon, altitude_m=alt, heading_deg=hdg),
            speed_kmh=spd,
            max_speed_kmh=max(spd, _MAX_SPEEDS.get(atype, spd)),
            sensor_type=sensor,
            weapons=weapons,
        ))


# ── Civilian Assets ──────────────────────────────────────────────────────────


def _add_civilian_assets(mgr: SimulationManager) -> None:
    """Civilian vehicles on major highways near cities.

    - Homs (34.73°N, 36.72°E): M5 highway
    - Damascus outskirts (33.51°N, 36.29°E): M5 highway
    """
    civ_assets = [
        # Bus on M5 highway near Homs
        ("CIV-BUS-01", "Civilian Bus", 34.73, 36.73, 500, 0.0, 40),
        # Bus on M5 between Homs and Damascus
        ("CIV-BUS-02", "Civilian Bus", 34.10, 36.50, 750, 180.0, 35),
        # Sedan on M5 entering Homs from south
        ("CIV-SEDAN-01", "Civilian Sedan", 34.70, 36.70, 500, 350.0, 50),
        # Sedan on highway near Damascus
        ("CIV-SEDAN-02", "Civilian Sedan", 33.55, 36.32, 690, 45.0, 55),
    ]

    for callsign, atype, lat, lon, alt, hdg, spd in civ_assets:
        mgr.add_asset(SimAsset(
            asset_id=f"civ-{callsign.lower()}",
            callsign=callsign,
            asset_type=atype,
            faction_id="civilian",
            position=Position(latitude=lat, longitude=lon, altitude_m=alt, heading_deg=hdg),
            speed_kmh=spd,
            max_speed_kmh=max(spd, _MAX_SPEEDS.get(atype, spd)),
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
