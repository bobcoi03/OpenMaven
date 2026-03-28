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

export interface MapViewProps {
  assets: TacticalAsset[];
  visibleLayers: Set<AssetClass>;
  onAssetClick?: (asset: TacticalAsset) => void;
  selectedId?: string | null;
  mapStyle?: MapStyleId;
  className?: string;
}

const MapViewInner = dynamic(
  () => import("./map-view-inner").then((m) => m.MapViewInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#0a0e1a]">
        <span className="text-[11px] text-slate-600 tracking-widest uppercase">
          Initialising map…
        </span>
      </div>
    ),
  },
);

export function MapView(props: MapViewProps) {
  return <MapViewInner {...props} />;
}
