"use client";

/**
 * useMapWaypointMode — state machine for multi-waypoint route editing.
 *
 * State: idle → selecting (asset chosen) → placing (clicks add waypoints)
 *       → confirmed (dispatches move orders) → idle
 *
 * Mirrors use-map-move.ts patterns.
 */

import { useState, useCallback, useEffect } from "react";
import type { SimAsset } from "./use-simulation";

const MAX_WAYPOINTS = 5;

export interface Waypoint {
  lng: number;
  lat: number;
}

interface UseMapWaypointModeOptions {
  assets: Record<string, SimAsset>;
  moveAsset: (assetId: string, lat: number, lon: number) => void;
}

interface UseMapWaypointModeReturn {
  waypointAssetId: string | null;
  waypoints: Waypoint[];
  startWaypointMode: (assetId: string) => void;
  handleMapClick: (lngLat: { lng: number; lat: number }) => void;
  confirm: () => void;
  cancel: () => void;
}

export function useMapWaypointMode({
  assets,
  moveAsset,
}: UseMapWaypointModeOptions): UseMapWaypointModeReturn {
  const [waypointAssetId, setWaypointAssetId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  // ESC cancels
  useEffect(() => {
    if (!waypointAssetId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWaypointAssetId(null);
        setWaypoints([]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [waypointAssetId]);

  // Auto-cancel if asset is destroyed while placing
  useEffect(() => {
    if (!waypointAssetId) return;
    const asset = assets[waypointAssetId];
    if (!asset || asset.status === "destroyed") {
      setWaypointAssetId(null);
      setWaypoints([]);
    }
  }, [waypointAssetId, assets]);

  const startWaypointMode = useCallback((assetId: string) => {
    setWaypointAssetId(assetId);
    setWaypoints([]);
  }, []);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (!waypointAssetId) return;
      setWaypoints((prev) => {
        if (prev.length >= MAX_WAYPOINTS) return prev;
        return [...prev, { lng: lngLat.lng, lat: lngLat.lat }];
      });
    },
    [waypointAssetId],
  );

  const confirm = useCallback(() => {
    if (!waypointAssetId || waypoints.length === 0) return;
    // Dispatch all move orders immediately — backend queues them natively
    for (const wp of waypoints) {
      moveAsset(waypointAssetId, wp.lat, wp.lng);
    }
    setWaypointAssetId(null);
    setWaypoints([]);
  }, [waypointAssetId, waypoints, moveAsset]);

  const cancel = useCallback(() => {
    setWaypointAssetId(null);
    setWaypoints([]);
  }, []);

  return { waypointAssetId, waypoints, startWaypointMode, handleMapClick, confirm, cancel };
}
