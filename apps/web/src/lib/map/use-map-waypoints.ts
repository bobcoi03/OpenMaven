/**
 * useMapWaypoints — renders waypoint dots and connecting dashed lines.
 *
 * Uses two GeoJSON sources: one for the line path, one for dot labels.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TacticalAsset } from "@/lib/tactical-mock";
import type { Waypoint } from "@/lib/use-map-waypoint-mode";

const LINE_SOURCE = "waypoint-line-source";
const DOT_SOURCE = "waypoint-dot-source";
const LINE_LAYER = "waypoint-line-layer";
const DOT_LAYER = "waypoint-dot-layer";

interface UseMapWaypointsOptions {
  waypointAssetId: string | null;
  waypoints: Waypoint[];
  assets: TacticalAsset[];
}

export function useMapWaypoints(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapWaypointsOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      const map = mapRef.current;
      if (!map) return;
      if (map.getSource(LINE_SOURCE)) return;

      map.addSource(LINE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(DOT_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: LINE_SOURCE,
        paint: {
          "line-color": "rgba(74,144,226,0.6)",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      });

      map.addLayer({
        id: DOT_LAYER,
        type: "circle",
        source: DOT_SOURCE,
        paint: {
          "circle-radius": 5,
          "circle-color": "#1a2a3a",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#4a90e2",
        },
      });
    }

    if (map.isStyleLoaded()) addLayers();
    else map.once("load", addLayers);
    map.on("styledata", addLayers);

    return () => {
      map.off("styledata", addLayers);
      const m = mapRef.current;
      if (!m) return;
      if (m.getLayer(DOT_LAYER)) m.removeLayer(DOT_LAYER);
      if (m.getLayer(LINE_LAYER)) m.removeLayer(LINE_LAYER);
      if (m.getSource(DOT_SOURCE)) m.removeSource(DOT_SOURCE);
      if (m.getSource(LINE_SOURCE)) m.removeSource(LINE_SOURCE);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const lineSource = map.getSource(LINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    const dotSource = map.getSource(DOT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!lineSource || !dotSource) return;

    const { waypointAssetId, waypoints, assets } = optionsRef.current;

    if (!waypointAssetId || waypoints.length === 0) {
      lineSource.setData({ type: "FeatureCollection", features: [] });
      dotSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const asset = assets.find((a) => a.asset_id === waypointAssetId);
    const startCoord: [number, number] = asset
      ? [asset.longitude, asset.latitude]
      : [waypoints[0].lng, waypoints[0].lat];

    const coords: [number, number][] = [
      startCoord,
      ...waypoints.map((wp) => [wp.lng, wp.lat] as [number, number]),
    ];

    lineSource.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      }],
    });

    dotSource.setData({
      type: "FeatureCollection",
      features: waypoints.map((wp, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [wp.lng, wp.lat] },
        properties: { index: i + 1 },
      })),
    });
  });
}
