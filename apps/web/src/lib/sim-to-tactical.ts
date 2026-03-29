/**
 * Bridge: convert SimAsset → TacticalAsset so the map renders live data.
 *
 * With fog of war enabled, enemy assets are only shown if detected by a
 * friendly sensor.  Previously-detected enemies that left sensor range
 * appear as "ghost" markers at their last known position.
 */

import type { SimAsset, DetectionEntry, GhostEntry } from "./use-simulation";
import type { TacticalAsset, AssetClass, AssetType, Affiliation } from "./tactical-mock";

const TYPE_TO_CLASS: Record<string, AssetClass> = {
  "MQ-9 Reaper": "Military",
  "RQ-4 Global Hawk": "Military",
  "F-16C Fighting Falcon": "Military",
  "F-35B Lightning II": "Military",
  "AC-130 Hercules": "Military",
  "E-3A AWACS": "Military",
  "AH-64 Apache": "Military",
  "CH-47 Chinook": "Military",
  "Hovering Recon Drone": "Military",
  "M1 Abrams": "Military",
  "T-72A MBT": "Military",
  "M2 Bradley IFV": "Military",
  "BMP-2 IFV": "Military",
  "BTR-82A APC": "Military",
  "HMMWV Transport": "Military",
  "Technical (Armed Pickup)": "Military",
  "M142 HIMARS": "Military",
  "M777 Howitzer": "Military",
  "M224 Mortar": "Military",
  "Infantry Squad": "Military",
  "DDG-51 Arleigh Burke": "Military",
  "Patrol Boat": "Military",
  "HMS Queen Elizabeth CVN": "Military",
  "USS Wasp LHD-1": "Military",
  "USS Seawolf SSN-21": "Military",
  "S-400 Triumf SAM": "Military",
  "MIM-104 Patriot": "Military",
  "Iron Dome Defense System": "Military",
  "EW Radar Vehicle": "Military",
  "Forward Operating Base": "Infrastructure",
  "Oil Pump Jack": "Infrastructure",
  "Field Hospital": "Infrastructure",
  "Civilian Bus": "Infrastructure",
  "Civilian Sedan": "Infrastructure",
  "C-17 Globemaster III": "Logistics",
  "M977 HEMTT Supply Truck": "Logistics",
  "M4A1 Carbine": "Logistics",
  "NATO Ammo Crate": "Logistics",
};

const FACTION_TO_AFFILIATION: Record<string, Affiliation> = {
  blue: "friendly",
  red: "hostile",
  isis: "hostile",
  iran: "hostile",
  civilian: "neutral",
};

function toMapType(assetType: string): AssetType {
  if (assetType.includes("Jet") || assetType.includes("F-16") || assetType.includes("F-35") || assetType.includes("AWACS") || assetType.includes("AC-130")) return "Jet";
  if (assetType.includes("Cargo") || assetType.includes("C-17") || assetType.includes("Chinook")) return "Cargo Plane";
  if (assetType.includes("Tank") || assetType.includes("Abrams") || assetType.includes("T-72") || assetType.includes("Bradley") || assetType.includes("BMP") || assetType.includes("BTR")) return "Tank";
  if (assetType.includes("Infantry") || assetType.includes("Mortar")) return "Infantry";
  if (assetType.includes("Truck") || assetType.includes("HEMTT") || assetType.includes("HMMWV") || assetType.includes("Technical")) return "Truck";
  if (assetType.includes("Oil") || assetType.includes("Hospital") || assetType.includes("Base")) return "Oil Plant";
  if (assetType.includes("Bridge")) return "Bridge";
  if (assetType.includes("Bus") || assetType.includes("Sedan")) return "Truck";
  return "Jet";
}

function isOwnFaction(factionId: string): boolean {
  return factionId === "blue";
}

function isNeutral(factionId: string): boolean {
  return factionId === "civilian";
}

export function simAssetToTactical(sim: SimAsset): TacticalAsset {
  return {
    asset_id: sim.asset_id,
    asset_type: toMapType(sim.asset_type),
    asset_class: TYPE_TO_CLASS[sim.asset_type] ?? "Military",
    faction_id: sim.faction_id,
    affiliation: FACTION_TO_AFFILIATION[sim.faction_id] ?? "unknown",
    callsign: sim.callsign,
    sim_asset_type: sim.asset_type,
    sim_status: sim.status,
    latitude: sim.position.latitude,
    longitude: sim.position.longitude,
    timestamp: new Date().toISOString(),
    speed_kmh: sim.speed_kmh,
    heading_deg: sim.position.heading_deg,
    weapons: sim.weapons,
  };
}

/**
 * Convert sim assets to tactical markers with fog of war filtering.
 *
 * - Blue assets: always visible
 * - Civilian assets: always visible
 * - Enemy assets: only visible if in the detections map
 * - Ghost enemies: shown at last-known position with ghost=true flag
 */
export function simAssetsToTactical(
  assets: Record<string, SimAsset>,
  detections?: Record<string, DetectionEntry>,
  ghosts?: Record<string, GhostEntry>,
  currentTick?: number,
): TacticalAsset[] {
  const fogEnabled = detections !== undefined && Object.keys(detections).length > 0;
  const result: TacticalAsset[] = [];

  for (const asset of Object.values(assets)) {
    if (asset.status === "destroyed") continue;

    // Always show own faction + civilians
    if (isOwnFaction(asset.faction_id) || isNeutral(asset.faction_id)) {
      result.push(simAssetToTactical(asset));
      continue;
    }

    // Enemy asset — only show if detected (when fog is active)
    if (!fogEnabled) {
      result.push(simAssetToTactical(asset));
      continue;
    }

    const detection = detections[asset.asset_id];
    if (detection) {
      const tactical = simAssetToTactical(asset);
      tactical.detection_confidence = detection.confidence;
      tactical.detected_by = detection.sensor_asset_id;
      result.push(tactical);
    }
  }

  // Add ghost markers for enemies that left sensor range
  if (fogEnabled && ghosts) {
    for (const ghost of Object.values(ghosts)) {
      const asset = assets[ghost.target_id];
      if (!asset || asset.status === "destroyed") continue;

      const tactical = simAssetToTactical(asset);
      // Override position with last-known
      tactical.latitude = ghost.last_lat;
      tactical.longitude = ghost.last_lon;
      tactical.is_ghost = true;
      tactical.ghost_age_ticks = currentTick !== undefined
        ? currentTick - ghost.last_seen_tick
        : 0;
      result.push(tactical);
    }
  }

  return result;
}
