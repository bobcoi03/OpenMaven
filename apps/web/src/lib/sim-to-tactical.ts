/**
 * Bridge: convert SimAsset → TacticalAsset so the existing map renders live data.
 */

import type { SimAsset } from "./use-simulation";
import type { TacticalAsset, AssetClass, AssetType } from "./tactical-mock";

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

/** Map asset_type to the simplified AssetType the map markers understand. */
function toMapType(assetType: string): AssetType {
  if (assetType.includes("Jet") || assetType.includes("F-16") || assetType.includes("F-35") || assetType.includes("AWACS") || assetType.includes("AC-130")) return "Jet";
  if (assetType.includes("Cargo") || assetType.includes("C-17") || assetType.includes("Chinook")) return "Cargo Plane";
  if (assetType.includes("Tank") || assetType.includes("Abrams") || assetType.includes("T-72") || assetType.includes("Bradley") || assetType.includes("BMP") || assetType.includes("BTR")) return "Tank";
  if (assetType.includes("Infantry") || assetType.includes("Mortar")) return "Infantry";
  if (assetType.includes("Truck") || assetType.includes("HEMTT") || assetType.includes("HMMWV") || assetType.includes("Technical")) return "Truck";
  if (assetType.includes("Oil") || assetType.includes("Hospital") || assetType.includes("Base")) return "Oil Plant";
  if (assetType.includes("Bridge")) return "Bridge";
  if (assetType.includes("Bus") || assetType.includes("Sedan")) return "Truck";
  // Default: anything airborne is a Jet
  return "Jet";
}

export function simAssetToTactical(sim: SimAsset): TacticalAsset {
  return {
    asset_id: sim.asset_id,
    asset_type: toMapType(sim.asset_type),
    asset_class: TYPE_TO_CLASS[sim.asset_type] ?? "Military",
    latitude: sim.position.latitude,
    longitude: sim.position.longitude,
    timestamp: new Date().toISOString(),
    speed_kmh: sim.speed_kmh,
    heading_deg: sim.position.heading_deg,
  };
}

export function simAssetsToTactical(assets: Record<string, SimAsset>): TacticalAsset[] {
  return Object.values(assets)
    .filter((a) => a.status !== "destroyed")
    .map(simAssetToTactical);
}
