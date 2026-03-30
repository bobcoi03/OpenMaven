"use client";

/**
 * useSensorRanges — computes sensor coverage circles from live sim state.
 *
 * Returns an array of { lng, lat, range_km } for all blue assets
 * with a sensor_range_km > 0. The backend is the single source of
 * truth for range values.
 */

import { useMemo } from "react";
import type { SimAsset } from "./use-simulation";

export interface SensorRange {
  lng: number;
  lat: number;
  range_km: number;
}

export function useSensorRanges(assets: Record<string, SimAsset>): SensorRange[] {
  return useMemo(() => {
    const ranges: SensorRange[] = [];
    for (const asset of Object.values(assets)) {
      if (asset.faction_id !== "blue") continue;
      if (asset.status === "destroyed") continue;
      if (asset.sensor_range_km > 0) {
        ranges.push({
          lng: asset.position.longitude,
          lat: asset.position.latitude,
          range_km: asset.sensor_range_km,
        });
      }
    }
    return ranges;
  }, [assets]);
}
