/**
 * useMapZoneControl — renders Voronoi zone control polygons.
 *
 * Computes Voronoi regions from alive asset positions each render.
 * Blue zones, red zones, and contested (both within 30km) in amber.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — d3-delaunay v6 ships no bundled types; runtime is well-tested
import { Delaunay } from "d3-delaunay";
import type { TacticalAsset } from "@/lib/tactical-mock";
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from "geojson";

const SOURCE_ID = "zone-control-source";
const FILL_LAYER_ID = "zone-control-fill";
const LINE_LAYER_ID = "zone-control-line";

// Map bounds to clip Voronoi to [west, south, east, north]
const BOUNDS: [number, number, number, number] = [25, 28, 65, 45];

interface UseMapZoneControlOptions {
  assets: TacticalAsset[];
  visible: boolean;
}

function factionColor(faction: string, type: "fill" | "line"): string {
  if (faction === "blue") {
    return type === "fill" ? "rgba(74,144,226,0.12)" : "rgba(74,144,226,0.3)";
  }
  if (faction === "contested") {
    return type === "fill" ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.35)";
  }
  return type === "fill" ? "rgba(224,92,92,0.12)" : "rgba(224,92,92,0.3)";
}

function buildGeoJSON(assets: TacticalAsset[]): FeatureCollection {
  const alive = assets.filter((a) => a.sim_status !== "destroyed");
  if (alive.length < 3) return { type: "FeatureCollection", features: [] };

  const points = alive.map((a) => [a.longitude, a.latitude] as [number, number]);
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi(BOUNDS);

  const features = alive.map((asset, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return null;

    // Determine if contested: any enemy within 30km
    const [cx, cy] = points[i];
    const isBlue = asset.faction_id === "blue";
    const contested = alive.some((other, j) => {
      if (j === i) return false;
      const otherIsBlue = other.faction_id === "blue";
      if (isBlue === otherIsBlue) return false;
      const dx = (points[j][0] - cx) * 111 * Math.cos((cy * Math.PI) / 180);
      const dy = (points[j][1] - cy) * 111;
      return Math.hypot(dx, dy) < 30;
    });

    const faction = contested ? "contested" : asset.faction_id === "blue" ? "blue" : "red";

    const feature: Feature<Geometry, GeoJsonProperties> = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cell] },
      properties: {
        fill: factionColor(faction, "fill"),
        line: factionColor(faction, "line"),
      },
    };
    return feature;
  }).filter((f): f is Feature<Geometry, GeoJsonProperties> => f !== null);

  return { type: "FeatureCollection", features };
}

export function useMapZoneControl(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapZoneControlOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

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

      map.addLayer(
        {
          id: FILL_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: { "fill-color": ["get", "fill"], "fill-opacity": 1 },
        },
        // Insert below markers (first symbol layer)
        map.getStyle().layers.find((l) => l.type === "symbol")?.id,
      );

      map.addLayer(
        {
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: { "line-color": ["get", "line"], "line-width": 1, "line-opacity": 0.8 },
        },
        map.getStyle().layers.find((l) => l.type === "symbol")?.id,
      );
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
      if (m.getLayer(LINE_LAYER_ID)) m.removeLayer(LINE_LAYER_ID);
      if (m.getLayer(FILL_LAYER_ID)) m.removeLayer(FILL_LAYER_ID);
      if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const { assets, visible } = optionsRef.current;
    const visibility = visible ? "visible" : "none";
    if (map.getLayer(FILL_LAYER_ID)) map.setLayoutProperty(FILL_LAYER_ID, "visibility", visibility);
    if (map.getLayer(LINE_LAYER_ID)) map.setLayoutProperty(LINE_LAYER_ID, "visibility", visibility);

    if (visible) source.setData(buildGeoJSON(assets));
  });
}
