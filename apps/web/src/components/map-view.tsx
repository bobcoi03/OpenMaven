"use client";

/**
 * map-view.tsx
 *
 * Thin dynamic wrapper around MapViewInner.  next/dynamic with ssr:false is
 * required because maplibre-gl accesses browser-only APIs at import time.
 */

import dynamic from "next/dynamic";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";
import type { MapStyleId } from "./map-view-inner";
import type { Waypoint } from "@/lib/use-map-waypoint-mode";

export interface MapViewProps {
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
  movePath?: {
    from: [number, number];
    to: [number, number];
  } | null;
  onMovePathDrag?: (lngLat: { lng: number; lat: number }) => void;
  sensorRanges?: Array<{ lng: number; lat: number; range_km: number }>;
  showSensorRanges?: boolean;
  /** Asset ID being moved, or null. Used for cursor + preview line. */
  moveMode?: string | null;
  /** Red dashed line from shooter to target for active strike pairing. */
  strikeLine?: { from: [number, number]; to: [number, number] } | null;
  strikeLines?: Array<{ from: [number, number]; to: [number, number] }>;
  /** Yellow dashed lines showing AI-planned strikes (before execution). */
  plannedLines?: Array<{ from: [number, number]; to: [number, number] }> | null;
  /** Blue dotted lines showing movement orders (current position → destination). */
  movementLines?: Array<{ from: [number, number]; to: [number, number] }>;
  /** Asset ID to lock the camera and targeting reticle onto. */
  lockedAssetId?: string | null;
  showHeatmap?: boolean;
  showZoneControl?: boolean;
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
  waypointAssetId?: string | null;
  waypoints?: Waypoint[];
}

const MapViewInner = dynamic(
  () => import("./map-view-inner").then((m) => m.MapViewInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[var(--om-bg-deep)]">
        <span className="text-[11px] text-[var(--om-text-muted)] tracking-widest uppercase">
          Initialising map…
        </span>
      </div>
    ),
  },
);

export function MapView(props: MapViewProps) {
  return <MapViewInner {...props} />;
}
