/**
 * useMapHeatmap — renders a MapLibre heatmap layer for red-force asset density.
 *
 * Data source: assets with faction_id !== "blue", weighted by health_pct.
 * Re-renders on every tick. Respects style switches via styledata guard.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TacticalAsset } from "@/lib/tactical-mock";

const SOURCE_ID = "heatmap-source";
const LAYER_ID = "heatmap-layer";

interface UseMapHeatmapOptions {
  assets: TacticalAsset[];
  visible: boolean;
}

export function useMapHeatmap(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapHeatmapOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Add source + layer once on mount; guard against style reloads
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      const map = mapRef.current;
      if (!map) return;
      if (map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: LAYER_ID,
        type: "heatmap",
        source: SOURCE_ID,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-radius": 40,
          "heatmap-intensity": 1,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "rgba(0,128,0,0.4)",
            0.5, "rgba(255,165,0,0.6)",
            1, "rgba(224,92,92,0.85)",
          ],
          "heatmap-opacity": 0.75,
        },
      });
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("load", addLayers);
    }

    map.on("styledata", addLayers);

    return () => {
      map.off("styledata", addLayers);
      const m = mapRef.current;
      if (!m) return;
      if (m.getLayer(LAYER_ID)) m.removeLayer(LAYER_ID);
      if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data + visibility on every render
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const { assets, visible } = optionsRef.current;

    if (!visible) {
      if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, "visibility", "none");
      return;
    }

    if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, "visibility", "visible");

    const features = assets
      .filter((a) => a.faction_id !== "blue" && a.sim_status !== "destroyed")
      .map((a) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [a.longitude, a.latitude] },
        properties: { weight: 1 },
      }));

    source.setData({ type: "FeatureCollection", features });
  });
}
