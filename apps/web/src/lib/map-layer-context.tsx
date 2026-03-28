"use client";

/**
 * map-layer-context.tsx
 *
 * Provides a React context for toggling tactical map layer visibility
 * (Military, Infrastructure, Logistics).  Consumed by the AppShell left
 * sidebar (to render the toggle controls) and by MapViewInner (to filter
 * which asset classes are rendered as map markers).
 */

import { createContext, useContext, useState, useCallback } from "react";
import type { AssetClass } from "@/lib/tactical-mock";
import type { SimAsset } from "@/lib/use-simulation";

interface MapLayerContextValue {
  visibleLayers: Set<AssetClass>;
  toggleLayer: (layer: AssetClass) => void;
  isVisible: (layer: AssetClass) => boolean;
  selectedAsset: SimAsset | null;
  setSelectedAsset: (asset: SimAsset | null) => void;
}

const MapLayerContext = createContext<MapLayerContextValue>({
  visibleLayers: new Set(["Military", "Infrastructure", "Logistics"]),
  toggleLayer: () => {},
  isVisible: () => true,
  selectedAsset: null,
  setSelectedAsset: () => {},
});

export function MapLayerProvider({ children }: { children: React.ReactNode }) {
  const [visibleLayers, setVisibleLayers] = useState<Set<AssetClass>>(
    new Set(["Military", "Infrastructure", "Logistics"] as AssetClass[]),
  );
  const [selectedAsset, setSelectedAssetRaw] = useState<SimAsset | null>(null);

  function toggleLayer(layer: AssetClass) {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  const setSelectedAsset = useCallback((asset: SimAsset | null) => {
    setSelectedAssetRaw(asset);
  }, []);

  return (
    <MapLayerContext.Provider
      value={{
        visibleLayers,
        toggleLayer,
        isVisible: (layer) => visibleLayers.has(layer),
        selectedAsset,
        setSelectedAsset,
      }}
    >
      {children}
    </MapLayerContext.Provider>
  );
}

export function useMapLayers(): MapLayerContextValue {
  return useContext(MapLayerContext);
}
