/**
 * tactical-mock.ts
 *
 * Synthetic battlefield asset data mirroring the Python simulation engine schema
 * (simulation/asset_generator.py).  Used as a fallback when the /api/assets/tactical
 * endpoint is unreachable, and for local development.
 *
 * Theatre of Operations: Eastern Syria / Western Iraq border region
 *   Lat 29°N – 37°N  |  Lon 38°E – 48°E
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssetClass = "Military" | "Infrastructure" | "Logistics";

export type MilitaryType = "Tank" | "Jet" | "Infantry";
export type InfraType = "Oil Plant" | "Power Grid" | "Bridge";
export type LogisticsType = "Truck" | "Cargo Plane";
export type AssetType = MilitaryType | InfraType | LogisticsType;

export type InfraStatus = "OPERATIONAL" | "DEGRADED" | "CRITICAL";

export interface TacticalAsset {
  asset_id: string;
  asset_type: AssetType;
  asset_class: AssetClass;
  latitude: number;
  longitude: number;
  timestamp: string;
  // Mobile assets (Military / Logistics)
  speed_kmh?: number;
  heading_deg?: number;
  // Infrastructure assets
  status?: InfraStatus;
  efficiency_pct?: number;
  output_mw?: number;
  structural_pct?: number;
}

// ── Targeting Board Alert ─────────────────────────────────────────────────────

export type AlertStage =
  | "DYNAMIC"
  | "PENDING PAIRING"
  | "PAIRED"
  | "IN EXECUTION"
  | "COMPLETE";

export interface TargetingAlert {
  id: string;
  label: string;      // "Computer Vision Detection" | "Reported Sighting" | "AI Alert"
  asset_type: string; // Tank, Vehicle, Personnel …
  confidence: number; // 0-100
  stage: AlertStage;
  grid_ref: string;   // e.g. "37TFJ 44500 60800"
  created_ago: string;
  classification: "MS" | "CC" | "ECD";
}

// ── Pseudo-random seed helper ─────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function uuid(rng: () => number): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (rng() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Asset generation ──────────────────────────────────────────────────────────

const LAT_MIN = 29.0;
const LAT_MAX = 37.0;
const LON_MIN = 38.0;
const LON_MAX = 48.0;

interface AssetTemplate {
  type: AssetType;
  class: AssetClass;
  count: number;
}

const TEMPLATES: AssetTemplate[] = [
  { type: "Tank",        class: "Military",       count: 80 },
  { type: "Jet",         class: "Military",       count: 40 },
  { type: "Infantry",    class: "Military",       count: 120 },
  { type: "Oil Plant",   class: "Infrastructure", count: 30 },
  { type: "Power Grid",  class: "Infrastructure", count: 25 },
  { type: "Bridge",      class: "Infrastructure", count: 20 },
  { type: "Truck",       class: "Logistics",      count: 70 },
  { type: "Cargo Plane", class: "Logistics",      count: 30 },
];

function buildAsset(
  rng: () => number,
  type: AssetType,
  assetClass: AssetClass,
): TacticalAsset {
  const lat = LAT_MIN + rng() * (LAT_MAX - LAT_MIN);
  const lon = LON_MIN + rng() * (LON_MAX - LON_MIN);
  const base: TacticalAsset = {
    asset_id: uuid(rng),
    asset_type: type,
    asset_class: assetClass,
    latitude: Math.round(lat * 1e6) / 1e6,
    longitude: Math.round(lon * 1e6) / 1e6,
    timestamp: new Date().toISOString(),
  };

  if (assetClass === "Infrastructure") {
    const metric = rng() * 100;
    const status: InfraStatus =
      metric < 30 ? "CRITICAL" : metric < 60 ? "DEGRADED" : "OPERATIONAL";
    base.status = status;
    if (type === "Oil Plant")  base.efficiency_pct = Math.round(metric * 10) / 10;
    if (type === "Power Grid") base.output_mw = Math.round(metric * 5 * 10) / 10;
    if (type === "Bridge")     base.structural_pct = Math.round(metric * 10) / 10;
  } else {
    const speeds: Record<AssetType, [number, number]> = {
      Tank: [20, 55], Jet: [500, 900], Infantry: [3, 8],
      Truck: [40, 90], "Cargo Plane": [400, 650],
      "Oil Plant": [0, 0], "Power Grid": [0, 0], Bridge: [0, 0],
    };
    const [lo, hi] = speeds[type];
    base.speed_kmh = Math.round((lo + rng() * (hi - lo)) * 10) / 10;
    base.heading_deg = Math.round(rng() * 360 * 10) / 10;
  }
  return base;
}

function generateFleet(): TacticalAsset[] {
  const rng = seededRng(0xdeadc0de);
  const fleet: TacticalAsset[] = [];
  for (const { type, class: cls, count } of TEMPLATES) {
    for (let i = 0; i < count; i++) {
      fleet.push(buildAsset(rng, type, cls));
    }
  }
  return fleet;
}

export const MOCK_TACTICAL_ASSETS: TacticalAsset[] = generateFleet();

// ── Targeting alerts ──────────────────────────────────────────────────────────

export const MOCK_TARGETING_ALERTS: TargetingAlert[] = [
  { id: "a1", label: "Computer Vision Detection", asset_type: "Tank",    confidence: 94, stage: "DYNAMIC",         grid_ref: "38SLH 44500 60867", created_ago: "1s ago",   classification: "MS" },
  { id: "a2", label: "Computer Vision Detection", asset_type: "Vehicle", confidence: 88, stage: "DYNAMIC",         grid_ref: "38SLH 50120 58300", created_ago: "3s ago",   classification: "MS" },
  { id: "a3", label: "Reported Sighting",          asset_type: "TEL",    confidence: 71, stage: "DYNAMIC",         grid_ref: "38SLH 42100 62000", created_ago: "1m ago",   classification: "MS" },
  { id: "a4", label: "Computer Vision Detection", asset_type: "Tank",    confidence: 96, stage: "PENDING PAIRING", grid_ref: "38SMH 11000 44200", created_ago: "3m ago",   classification: "CC" },
  { id: "a5", label: "AI Alert",                   asset_type: "Artillery",confidence:82, stage: "PENDING PAIRING", grid_ref: "38SLH 48600 59900", created_ago: "5m ago",   classification: "MS" },
  { id: "a6", label: "Assault Vessel",             asset_type: "Ship",   confidence: 90, stage: "PENDING PAIRING", grid_ref: "37TGK 00400 88100", created_ago: "8m ago",   classification: "MS" },
  { id: "a7", label: "Computer Vision Detection", asset_type: "Vehicle", confidence: 87, stage: "PAIRED",          grid_ref: "38SLH 49100 60200", created_ago: "12m ago",  classification: "MS" },
  { id: "a8", label: "Computer Vision Detection", asset_type: "Tank",    confidence: 93, stage: "PAIRED",          grid_ref: "38SLH 51200 57800", created_ago: "15m ago",  classification: "ECD" },
  { id: "a9", label: "Reported Sighting",          asset_type: "C2 Node",confidence: 78, stage: "PAIRED",          grid_ref: "38SMH 08200 40100", created_ago: "18m ago",  classification: "MS" },
  { id:"a10", label: "Computer Vision Detection", asset_type: "Personnel",confidence:85, stage: "IN EXECUTION",    grid_ref: "38SLH 45300 61100", created_ago: "22m ago",  classification: "MS" },
  { id:"a11", label: "AI Alert",                   asset_type: "Tank",   confidence: 97, stage: "IN EXECUTION",    grid_ref: "38SLH 52000 58600", created_ago: "25m ago",  classification: "CC" },
  { id:"a12", label: "Computer Vision Detection", asset_type: "Vehicle", confidence: 91, stage: "COMPLETE",        grid_ref: "38SLH 46800 59400", created_ago: "1h ago",   classification: "ECD" },
  { id:"a13", label: "Reported Sighting",          asset_type: "Artillery",confidence:76,stage: "COMPLETE",        grid_ref: "38SMH 09100 41500", created_ago: "2h ago",   classification: "MS" },
];
