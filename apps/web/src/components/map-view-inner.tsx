"use client";

/**
 * map-view-inner.tsx
 *
 * Tactical MapLibre map with MIL-STD-2525 NATO markers.
 * All logic is delegated to focused hooks in lib/map/.
 *
 * Must be loaded via next/dynamic with ssr:false — maplibre-gl is browser-only.
 */

import { useRef, useEffect } from "react";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";
import {
  useMapInit,
  useMapMarkers,
  useMapMovePreview,
  useMapLines,
  useMapSensorCircles,
  useMapTargetLock,
  useMapHeatmap,
  useMapZoneControl,
  useMapWaypoints,
  MAP_STYLES,
  type MapStyleId,
} from "@/lib/map";
import type { Waypoint } from "@/lib/use-map-waypoint-mode";
import { useMapLayers } from "@/lib/map-layer-context";

// Re-export for consumers
export { MAP_STYLES, type MapStyleId };

// ── Props ─────────────────────────────────────────────────────────────────────

interface TacticalMapProps {
  assets: TacticalAsset[];
  visibleLayers: Set<AssetClass>;
  onAssetClick?: (asset: TacticalAsset) => void;
  selectedId?: string | null;
  mapStyle?: MapStyleId;
  className?: string;
  onContextMenu?: (event: {
    type: "asset" | "map";
    asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string; is_ghost?: boolean };
    lngLat?: { lng: number; lat: number };
    x: number;
    y: number;
  }) => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  movePath?: { from: [number, number]; to: [number, number] } | null;
  onMovePathDrag?: (lngLat: { lng: number; lat: number }) => void;
  sensorRanges?: Array<{ lng: number; lat: number; range_km: number }>;
  showSensorRanges?: boolean;
  moveMode?: string | null;
  strikeLine?: { from: [number, number]; to: [number, number] } | null;
  strikeLines?: Array<{ from: [number, number]; to: [number, number] }>;
  plannedLines?: Array<{ from: [number, number]; to: [number, number] }> | null;
  movementLines?: Array<{ from: [number, number]; to: [number, number] }>;
  lockedAssetId?: string | null;
  showHeatmap?: boolean;
  showZoneControl?: boolean;
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
  waypointAssetId?: string | null;
  waypoints?: Waypoint[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapViewInner({
  assets,
  visibleLayers,
  onAssetClick,
  selectedId,
  mapStyle = "dark",
  className = "",
  onContextMenu,
  onMapClick,
  movePath,
  onMovePathDrag,
  moveMode,
  sensorRanges,
  showSensorRanges = true,
  strikeLine,
  strikeLines,
  plannedLines,
  movementLines,
  lockedAssetId,
  showHeatmap = false,
  showZoneControl = false,
  flyTo,
  waypointAssetId = null,
  waypoints = [],
}: TacticalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const mapRef = useMapInit(containerRef, {
    mapStyle,
    onContextMenu: onContextMenu
      ? (e) => onContextMenu({ type: "map", lngLat: { lng: e.lng, lat: e.lat }, x: e.x, y: e.y })
      : undefined,
    onClick: onMapClick,
    flyTo,
  });

  const { focusCoords, setFocusCoords } = useMapLayers();

  useEffect(() => {
    if (!focusCoords) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [focusCoords.lng, focusCoords.lat], zoom: 12, duration: 1000 });
    // Clear after use so the same coords can trigger again on the next click
    setFocusCoords(null);
  }, [focusCoords]);

  const markersRef = useMapMarkers(mapRef, {
    assets,
    visibleLayers,
    selectedId,
    onAssetClick,
    onContextMenu: onContextMenu
      ? (e) => onContextMenu({ ...e, lngLat: undefined })
      : undefined,
    containerRef,
  });

  useMapMovePreview(mapRef, {
    moveMode,
    movePath,
    onMovePathDrag,
    markersRef,
  });

  useMapLines(mapRef, {
    strikeLine,
    strikeLines,
    plannedLines,
    movementLines,
  });

  useMapSensorCircles(mapRef, containerRef, {
    sensorRanges,
    showSensorRanges,
  });

  useMapTargetLock(mapRef, containerRef, {
    lockedAssetId,
    assets,
  });

  useMapHeatmap(mapRef, { assets, visible: showHeatmap });
  useMapZoneControl(mapRef, { assets, visible: showZoneControl });
  useMapWaypoints(mapRef, { waypointAssetId, waypoints, assets });

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
