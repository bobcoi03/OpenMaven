"""Category-based strike and weapon profiles.

Rules are defined per category (~15 categories), not per individual asset.
Assets inherit from their category via CATEGORY_MAP.
"""

from pydantic import BaseModel


class StrikeProfile(BaseModel):
    """How hard a target category is to destroy."""

    hardness: float  # 0.0–1.0, resistance to destruction
    crew_survival: float  # 0.0–1.0, chance crew survives a hit


class WeaponProfile(BaseModel):
    """How effective a weapon is."""

    accuracy: float  # 0.0–1.0, probability of hitting
    blast_radius_m: float  # meters of effect radius
    penetration: float  # 0.0–1.0, ability to defeat armor/hardening


# ── Strike profiles by category ──────────────────────────────────────────────

STRIKE_PROFILES: dict[str, StrikeProfile] = {
    "armored_vehicle": StrikeProfile(hardness=0.8, crew_survival=0.3),
    "soft_vehicle": StrikeProfile(hardness=0.2, crew_survival=0.1),
    "reinforced_structure": StrikeProfile(hardness=0.9, crew_survival=0.5),
    "light_structure": StrikeProfile(hardness=0.3, crew_survival=0.6),
    "infantry_squad": StrikeProfile(hardness=0.05, crew_survival=0.4),
    "aircraft_grounded": StrikeProfile(hardness=0.4, crew_survival=0.2),
    "aircraft_airborne": StrikeProfile(hardness=0.1, crew_survival=0.05),
    "naval_vessel": StrikeProfile(hardness=0.7, crew_survival=0.4),
    "submarine": StrikeProfile(hardness=0.85, crew_survival=0.2),
    "radar_installation": StrikeProfile(hardness=0.5, crew_survival=0.7),
    "sam_site": StrikeProfile(hardness=0.6, crew_survival=0.5),
    "supply_depot": StrikeProfile(hardness=0.3, crew_survival=0.8),
    "bridge": StrikeProfile(hardness=0.6, crew_survival=1.0),
    "command_node": StrikeProfile(hardness=0.7, crew_survival=0.5),
    "civilian": StrikeProfile(hardness=0.05, crew_survival=0.3),
}

# ── Weapon profiles ──────────────────────────────────────────────────────────

WEAPON_PROFILES: dict[str, WeaponProfile] = {
    "gbu_38_jdam": WeaponProfile(accuracy=0.90, blast_radius_m=30, penetration=0.7),
    "gbu_12_paveway": WeaponProfile(accuracy=0.85, blast_radius_m=25, penetration=0.65),
    "hellfire": WeaponProfile(accuracy=0.85, blast_radius_m=15, penetration=0.9),
    "javelin": WeaponProfile(accuracy=0.92, blast_radius_m=5, penetration=0.95),
    "artillery_155": WeaponProfile(accuracy=0.60, blast_radius_m=50, penetration=0.5),
    "mortar_81mm": WeaponProfile(accuracy=0.50, blast_radius_m=20, penetration=0.3),
    "mortar_120mm": WeaponProfile(accuracy=0.55, blast_radius_m=30, penetration=0.4),
    "cruise_missile": WeaponProfile(accuracy=0.92, blast_radius_m=40, penetration=0.95),
    "ballistic_missile": WeaponProfile(accuracy=0.70, blast_radius_m=80, penetration=0.9),
    "torpedo": WeaponProfile(accuracy=0.75, blast_radius_m=20, penetration=0.85),
    "himars_rocket": WeaponProfile(accuracy=0.88, blast_radius_m=35, penetration=0.6),
    "small_arms": WeaponProfile(accuracy=0.30, blast_radius_m=0, penetration=0.05),
    "autocannon_30mm": WeaponProfile(accuracy=0.70, blast_radius_m=5, penetration=0.4),
    "sam_missile": WeaponProfile(accuracy=0.80, blast_radius_m=20, penetration=0.7),
}

# ── Asset type → strike category mapping ─────────────────────────────────────

CATEGORY_MAP: dict[str, str] = {
    # Armor
    "M1 Abrams": "armored_vehicle",
    "T-72A MBT": "armored_vehicle",
    "M2 Bradley IFV": "armored_vehicle",
    "BMP-2 IFV": "armored_vehicle",
    "BTR-82A APC": "armored_vehicle",
    # Soft vehicles
    "HMMWV Transport": "soft_vehicle",
    "M977 HEMTT Supply Truck": "soft_vehicle",
    "Technical (Armed Pickup)": "soft_vehicle",
    "Civilian Bus": "civilian",
    "Civilian Sedan": "civilian",
    # Aircraft (grounded by default — override to airborne when in flight)
    "MQ-9 Reaper": "aircraft_airborne",
    "RQ-4 Global Hawk": "aircraft_airborne",
    "F-16C Fighting Falcon": "aircraft_airborne",
    "F-35B Lightning II": "aircraft_airborne",
    "AC-130 Hercules": "aircraft_airborne",
    "E-3A AWACS": "aircraft_airborne",
    "C-17 Globemaster III": "aircraft_airborne",
    "AH-64 Apache": "aircraft_airborne",
    "CH-47 Chinook": "aircraft_airborne",
    "Hovering Recon Drone": "aircraft_airborne",
    # Naval
    "DDG-51 Arleigh Burke": "naval_vessel",
    "Patrol Boat": "naval_vessel",
    "HMS Queen Elizabeth CVN": "naval_vessel",
    "USS Wasp LHD-1": "naval_vessel",
    "USS Seawolf SSN-21": "submarine",
    # Air defense
    "S-400 Triumf SAM": "sam_site",
    "MIM-104 Patriot": "sam_site",
    "Iron Dome Defense System": "sam_site",
    # Artillery
    "M777 Howitzer": "radar_installation",  # similar hardness profile
    "M142 HIMARS": "soft_vehicle",
    "M224 Mortar": "infantry_squad",
    # Infrastructure
    "Forward Operating Base": "reinforced_structure",
    "Oil Pump Jack": "light_structure",
    "Field Hospital": "light_structure",
    "EW Radar Vehicle": "radar_installation",
    # Infantry
    "Infantry Squad": "infantry_squad",
    # Weapons/equipment (not targetable in the same way)
    "M4A1 Carbine": "supply_depot",
    "NATO Ammo Crate": "supply_depot",
}


def get_strike_profile(asset_type: str) -> StrikeProfile:
    """Look up the strike profile for an asset type."""
    category = CATEGORY_MAP.get(asset_type, "soft_vehicle")
    return STRIKE_PROFILES[category]


def get_weapon_profile(weapon_id: str) -> WeaponProfile | None:
    """Look up a weapon profile by ID. Returns None if unknown."""
    return WEAPON_PROFILES.get(weapon_id)
