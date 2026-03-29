/**
 * strike-pairing.ts
 *
 * Pure pairing logic for the kill chain: given a detected enemy target,
 * find the best friendly asset + weapon combination to engage it.
 * No React — just math and scoring.
 */

import type { SimAsset } from "./use-simulation";
import {
  WEAPON_PROFILES,
  STRIKE_PROFILES,
  CATEGORY_MAP,
  type WeaponProfile,
  type StrikeProfile,
} from "./weapon-data";

// ── Types ──────────────────────────────────────────────────────────────────

/** Immutable selection — which shooter/weapon/target was chosen. */
export interface PairingSelection {
  shooterId: string;
  weaponId: string;
  targetId: string;
}

/** Live pairing with current positions and recomputed telemetry. */
export interface StrikePairing {
  shooter: SimAsset;
  weapon: WeaponProfile;
  weaponId: string;
  target: SimAsset;
  targetCategory: string;
  targetProfile: StrikeProfile;
  distanceKm: number;
  killProb: number;
  timeToTargetSec: number;
}

// ── Haversine ──────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Kill probability ───────────────────────────────────────────────────────

export function killProbability(weapon: WeaponProfile, target: StrikeProfile): number {
  const raw = weapon.accuracy * (weapon.penetration / Math.max(target.hardness, 0.01));
  return Math.min(Math.max(raw, 0), 1);
}

// ── Find all pairings ─────────────────────────────────────────────────────

const KILL_PROB_WEIGHT = 0.7;
const DISTANCE_WEIGHT = 0.3;
const MAX_RANGE_KM = 500;

/** Return ALL valid pairings sorted by score (best first). */
export function findAllPairings(
  target: SimAsset,
  friendlyAssets: Record<string, SimAsset>,
): StrikePairing[] {
  const category = CATEGORY_MAP[target.asset_type] ?? "soft_vehicle";
  const targetProfile = STRIKE_PROFILES[category];
  if (!targetProfile) return [];

  const scored: Array<{ pairing: StrikePairing; score: number }> = [];

  for (const shooter of Object.values(friendlyAssets)) {
    if (shooter.faction_id !== "blue") continue;
    if (shooter.status === "destroyed") continue;
    if (shooter.weapons.length === 0) continue;

    const distanceKm = haversineKm(
      shooter.position.latitude,
      shooter.position.longitude,
      target.position.latitude,
      target.position.longitude,
    );

    if (distanceKm > MAX_RANGE_KM) continue;

    for (const weaponId of shooter.weapons) {
      const weapon = WEAPON_PROFILES[weaponId];
      if (!weapon) continue;

      const kp = killProbability(weapon, targetProfile);
      const distanceScore = 1 - distanceKm / MAX_RANGE_KM;
      const score = KILL_PROB_WEIGHT * kp + DISTANCE_WEIGHT * distanceScore;
      const timeToTargetSec = shooter.speed_kmh > 0
        ? (distanceKm / shooter.speed_kmh) * 3600
        : 0;

      scored.push({
        score,
        pairing: {
          shooter,
          weapon,
          weaponId,
          target,
          targetCategory: category,
          targetProfile,
          distanceKm,
          killProb: kp,
          timeToTargetSec,
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.pairing);
}

/** Return the single best pairing, or null if none available. */
export function findBestPairing(
  target: SimAsset,
  friendlyAssets: Record<string, SimAsset>,
): StrikePairing | null {
  return findAllPairings(target, friendlyAssets)[0] ?? null;
}

/** Recompute telemetry for an existing pairing using live asset positions. */
export function refreshPairing(
  selection: PairingSelection,
  assets: Record<string, SimAsset>,
): StrikePairing | null {
  const shooter = assets[selection.shooterId];
  const target = assets[selection.targetId];
  if (!shooter || !target) return null;
  if (shooter.status === "destroyed" || target.status === "destroyed") return null;

  const weapon = WEAPON_PROFILES[selection.weaponId];
  if (!weapon) return null;

  const category = CATEGORY_MAP[target.asset_type] ?? "soft_vehicle";
  const targetProfile = STRIKE_PROFILES[category];
  if (!targetProfile) return null;

  const distanceKm = haversineKm(
    shooter.position.latitude,
    shooter.position.longitude,
    target.position.latitude,
    target.position.longitude,
  );

  return {
    shooter,
    weapon,
    weaponId: selection.weaponId,
    target,
    targetCategory: category,
    targetProfile,
    distanceKm,
    killProb: killProbability(weapon, targetProfile),
    timeToTargetSec: shooter.speed_kmh > 0
      ? (distanceKm / shooter.speed_kmh) * 3600
      : 0,
  };
}
