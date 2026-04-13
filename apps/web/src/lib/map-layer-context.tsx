"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { AssetClass } from "@/lib/tactical-mock";
import type { SimAsset } from "@/lib/use-simulation";

interface MapLayerContextValue {
  visibleLayers: Set<AssetClass>;
  toggleLayer: (layer: AssetClass) => void;
  isVisible: (layer: AssetClass) => boolean;
  selectedAsset: SimAsset | null;
  setSelectedAsset: (asset: SimAsset | null) => void;
  showHeatmap: boolean;
  toggleHeatmap: () => void;
  showZoneControl: boolean;
  toggleZoneControl: () => void;
  focusCoords: { lng: number; lat: number } | null;
  setFocusCoords: (coords: { lng: number; lat: number } | null) => void;
}

const MapLayerContext = createContext<MapLayerContextValue>({
  visibleLayers: new Set(["Military", "Infrastructure", "Logistics"]),
  toggleLayer: () => {},
  isVisible: () => true,
  selectedAsset: null,
  setSelectedAsset: () => {},
  showHeatmap: false,
  toggleHeatmap: () => {},
  showZoneControl: false,
  toggleZoneControl: () => {},
  focusCoords: null,
  setFocusCoords: () => {},
});

export function MapLayerProvider({ children }: { children: React.ReactNode }) {
  const [visibleLayers, setVisibleLayers] = useState<Set<AssetClass>>(
    new Set(["Military", "Infrastructure", "Logistics"] as AssetClass[]),
  );
  const [selectedAsset, setSelectedAssetRaw] = useState<SimAsset | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showZoneControl, setShowZoneControl] = useState(false);
  const [focusCoords, setFocusCoordsRaw] = useState<{ lng: number; lat: number } | null>(null);

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

  const setFocusCoords = useCallback((coords: { lng: number; lat: number } | null) => {
    setFocusCoordsRaw(coords);
  }, []);

  return (
    <MapLayerContext.Provider
      value={{
        visibleLayers,
        toggleLayer,
        isVisible: (layer) => visibleLayers.has(layer),
        selectedAsset,
        setSelectedAsset,
        showHeatmap,
        toggleHeatmap: () => setShowHeatmap((v) => !v),
        showZoneControl,
        toggleZoneControl: () => setShowZoneControl((v) => !v),
        focusCoords,
        setFocusCoords,
      }}
    >
      {children}
    </MapLayerContext.Provider>
  );
}

export function useMapLayers(): MapLayerContextValue {
  return useContext(MapLayerContext);
}
