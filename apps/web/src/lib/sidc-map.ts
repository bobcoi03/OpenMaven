/**
 * sidc-map.ts
 *
 * Maps simulation asset types to MIL-STD-2525C Symbol Identification Codes (SIDC).
 * The SIDC encodes affiliation, battle dimension, and unit function into a 15-char
 * code that the `milsymbol` library renders as proper NATO tactical symbols.
 *
 * SIDC format (MIL-STD-2525C):
 *   Pos 1:   Coding scheme  (S = Warfighting)
 *   Pos 2:   Affiliation    (F=Friend, H=Hostile, N=Neutral, U=Unknown)
 *   Pos 3:   Dimension      (A=Air, G=Ground, S=Sea Surface, U=Subsurface)
 *   Pos 4:   Status         (P=Present)
 *   Pos 5-10: Function ID
 *   Pos 11-15: Modifiers (padded with dashes)
 */

import type { Affiliation } from "./tactical-mock";

/** Affiliation → SIDC character (position 2) */
const AFF_CHAR: Record<Affiliation, string> = {
  friendly: "F",
  hostile:  "H",
  neutral:  "N",
  unknown:  "U",
};

/**
 * Asset type → partial SIDC (positions 3-10: dimension + status + function).
 * Affiliation character is inserted separately.
 */
const TYPE_SIDC: Record<string, string> = {
  // ── Air: Fixed-Wing ───────────────────────
  "MQ-9 Reaper":            "APMFQ-----",  // Air, UAV
  "RQ-4 Global Hawk":       "APMFQ-----",  // Air, UAV
  "F-16C Fighting Falcon":  "APMFF-----",  // Air, Fighter
  "F-35B Lightning II":     "APMFF-----",  // Air, Fighter
  "AC-130 Hercules":        "APMFA-----",  // Air, Attack
  "E-3A AWACS":             "APMFRW----",  // Air, Airborne C2
  "C-17 Globemaster III":   "APMFT-----",  // Air, Transport
  "Hovering Recon Drone":   "APMFQ-----",  // Air, UAV

  // ── Air: Rotary-Wing ─────────────────────
  "AH-64 Apache":           "APMHA-----",  // Air, Rotary Attack
  "CH-47 Chinook":          "APMHU-----",  // Air, Rotary Utility

  // ── Ground: Armor ────────────────────────
  "M1 Abrams":              "GPUCA-----",  // Ground, Armor
  "T-72A MBT":              "GPUCA-----",  // Ground, Armor
  "M2 Bradley IFV":         "GPUCIM----",  // Ground, Mech Infantry
  "BMP-2 IFV":              "GPUCIM----",  // Ground, Mech Infantry
  "BTR-82A APC":            "GPUCIM----",  // Ground, Mech Infantry

  // ── Ground: Infantry ─────────────────────
  "Infantry Squad":         "GPUCI-----",  // Ground, Infantry

  // ── Ground: Artillery ────────────────────
  "M142 HIMARS":            "GPUCFR----",  // Ground, Rocket Artillery
  "M777 Howitzer":          "GPUCF-----",  // Ground, Field Artillery
  "M224 Mortar":            "GPUCFM----",  // Ground, Mortar

  // ── Ground: Air Defense ──────────────────
  "S-400 Triumf SAM":       "GPUCD-----",  // Ground, Air Defense
  "MIM-104 Patriot":        "GPUCD-----",  // Ground, Air Defense
  "Iron Dome Defense System":"GPUCD-----",  // Ground, Air Defense

  // ── Ground: EW ───────────────────────────
  "EW Radar Vehicle":       "GPUEW-----",  // Ground, Electronic Warfare

  // ── Ground: Transport ────────────────────
  "HMMWV Transport":        "GPUST-----",  // Ground, Transport
  "Technical (Armed Pickup)":"GPUST-----",  // Ground, Transport
  "M977 HEMTT Supply Truck":"GPUST-----",  // Ground, Transport

  // ── Ground: Installations ────────────────
  "Field Hospital":         "GPUSM-----",  // Ground, Medical
  "Forward Operating Base": "GPUH------",  // Ground, HQ/Installation

  // ── Ground: Civilian Vehicles ────────────
  "Civilian Bus":           "GPUST-----",  // Ground, CSS Transport
  "Civilian Sedan":         "GPUST-----",  // Ground, CSS Transport

  // ── Sea Surface ──────────────────────────
  "DDG-51 Arleigh Burke":   "SPCLDD----",  // Sea, Destroyer
  "USS Wasp LHD-1":         "SPCLCA----",  // Sea, Amphibious
  "Patrol Boat":            "SPCLP-----",  // Sea, Patrol
  "HMS Queen Elizabeth CVN": "SPCLCV----",  // Sea, Carrier

  // ── Subsurface ───────────────────────────
  "USS Seawolf SSN-21":     "UPSLA-----",  // Subsurface, Attack Sub
};

/** Build a full 15-char SIDC for a given asset type and affiliation. */
export function getSidc(assetType: string, affiliation: Affiliation): string {
  const aff = AFF_CHAR[affiliation];
  const partial = TYPE_SIDC[assetType] ?? "GPUCI-----"; // fallback: ground infantry
  return `S${aff}${partial}`;
}
