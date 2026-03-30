/**
 * weapon-data.ts
 *
 * Static weapon and strike profile data mirrored from backend profiles.py.
 * Used client-side for kill probability estimation and strike pairing.
 */

// ── Weapon profiles ────────────────────────────────────────────────────────

export interface WeaponProfile {
  accuracy: number;
  blast_radius_m: number;
  penetration: number;
  display_name: string;
}

export const WEAPON_PROFILES: Record<string, WeaponProfile> = {
  gbu_38_jdam: { accuracy: 0.90, blast_radius_m: 30, penetration: 0.7, display_name: "GBU-38 JDAM" },
  gbu_12_paveway: { accuracy: 0.85, blast_radius_m: 25, penetration: 0.65, display_name: "GBU-12 Paveway" },
  hellfire: { accuracy: 0.85, blast_radius_m: 15, penetration: 0.9, display_name: "AGM-114 Hellfire" },
  javelin: { accuracy: 0.92, blast_radius_m: 5, penetration: 0.95, display_name: "FGM-148 Javelin" },
  artillery_155: { accuracy: 0.60, blast_radius_m: 50, penetration: 0.5, display_name: "155mm Artillery" },
  mortar_81mm: { accuracy: 0.50, blast_radius_m: 20, penetration: 0.3, display_name: "81mm Mortar" },
  mortar_120mm: { accuracy: 0.55, blast_radius_m: 30, penetration: 0.4, display_name: "120mm Mortar" },
  cruise_missile: { accuracy: 0.92, blast_radius_m: 40, penetration: 0.95, display_name: "Cruise Missile" },
  ballistic_missile: { accuracy: 0.70, blast_radius_m: 80, penetration: 0.9, display_name: "Ballistic Missile" },
  torpedo: { accuracy: 0.75, blast_radius_m: 20, penetration: 0.85, display_name: "Mk 48 Torpedo" },
  himars_rocket: { accuracy: 0.88, blast_radius_m: 35, penetration: 0.6, display_name: "HIMARS Rocket" },
  small_arms: { accuracy: 0.30, blast_radius_m: 0, penetration: 0.05, display_name: "Small Arms" },
  autocannon_30mm: { accuracy: 0.70, blast_radius_m: 5, penetration: 0.4, display_name: "30mm Autocannon" },
  sam_missile: { accuracy: 0.80, blast_radius_m: 20, penetration: 0.7, display_name: "SAM Missile" },
};

// ── Strike profiles by category ────────────────────────────────────────────

export interface StrikeProfile {
  hardness: number;
  crew_survival: number;
}

export const STRIKE_PROFILES: Record<string, StrikeProfile> = {
  armored_vehicle: { hardness: 0.8, crew_survival: 0.3 },
  soft_vehicle: { hardness: 0.2, crew_survival: 0.1 },
  reinforced_structure: { hardness: 0.9, crew_survival: 0.5 },
  light_structure: { hardness: 0.3, crew_survival: 0.6 },
  infantry_squad: { hardness: 0.05, crew_survival: 0.4 },
  aircraft_grounded: { hardness: 0.4, crew_survival: 0.2 },
  aircraft_airborne: { hardness: 0.1, crew_survival: 0.05 },
  naval_vessel: { hardness: 0.7, crew_survival: 0.4 },
  submarine: { hardness: 0.85, crew_survival: 0.2 },
  radar_installation: { hardness: 0.5, crew_survival: 0.7 },
  sam_site: { hardness: 0.6, crew_survival: 0.5 },
  supply_depot: { hardness: 0.3, crew_survival: 0.8 },
  bridge: { hardness: 0.6, crew_survival: 1.0 },
  command_node: { hardness: 0.7, crew_survival: 0.5 },
  civilian: { hardness: 0.05, crew_survival: 0.3 },
};

// ── Asset type → strike category mapping ───────────────────────────────────

export const CATEGORY_MAP: Record<string, string> = {
  // Armor
  "M1 Abrams": "armored_vehicle",
  "T-72A MBT": "armored_vehicle",
  "M2 Bradley IFV": "armored_vehicle",
  "BMP-2 IFV": "armored_vehicle",
  "BTR-82A APC": "armored_vehicle",
  // Soft vehicles
  "HMMWV Transport": "soft_vehicle",
  "M977 HEMTT Supply Truck": "soft_vehicle",
  "Technical (Armed Pickup)": "soft_vehicle",
  "Civilian Bus": "civilian",
  "Civilian Sedan": "civilian",
  // Aircraft
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
  // Naval
  "DDG-51 Arleigh Burke": "naval_vessel",
  "Patrol Boat": "naval_vessel",
  "HMS Queen Elizabeth CVN": "naval_vessel",
  "USS Wasp LHD-1": "naval_vessel",
  "USS Seawolf SSN-21": "submarine",
  // Air defense
  "S-400 Triumf SAM": "sam_site",
  "MIM-104 Patriot": "sam_site",
  "Iron Dome Defense System": "sam_site",
  // Artillery
  "M777 Howitzer": "radar_installation",
  "M142 HIMARS": "soft_vehicle",
  "M224 Mortar": "infantry_squad",
  // Infrastructure
  "Forward Operating Base": "reinforced_structure",
  "Oil Pump Jack": "light_structure",
  "Field Hospital": "light_structure",
  "EW Radar Vehicle": "radar_installation",
  // Infantry
  "Infantry Squad": "infantry_squad",
  // Equipment
  "M4A1 Carbine": "supply_depot",
  "NATO Ammo Crate": "supply_depot",
};
