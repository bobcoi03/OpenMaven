/**
 * useMapMovePreview — dashed preview line from asset to cursor in move mode,
 * plus the confirmed move path with draggable endpoint.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

interface MovePath {
  from: [number, number];
  to: [number, number];
}

interface UseMapMovePreviewOptions {
  moveMode: string | null | undefined;
  movePath: MovePath | null | undefined;
  onMovePathDrag?: (lngLat: { lng: number; lat: number }) => void;
  markersRef: React.RefObject<Map<string, { marker: maplibregl.Marker; asset: { longitude: number; latitude: number } }>>;
}

export function useMapMovePreview(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapMovePreviewOptions,
) {
  const onDragRef = useRef(options.onMovePathDrag);
  onDragRef.current = options.onMovePathDrag;
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Cursor style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = options.moveMode ? "crosshair" : "";
  }, [options.moveMode, mapRef]);

  // Preview line (asset → cursor) when in move mode without locked destination
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !options.moveMode || options.movePath) return;

    const PREVIEW_SOURCE = "move-preview-source";
    const PREVIEW_LAYER = "move-preview-layer";

    const entry = options.markersRef.current.get(options.moveMode);
    if (!entry) return;
    const origin: [number, number] = [entry.asset.longitude, entry.asset.latitude];

    function ensureLayer() {
      if (!map || map.getSource(PREVIEW_SOURCE)) return;
      map.addSource(PREVIEW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: PREVIEW_LAYER,
        type: "line",
        source: PREVIEW_SOURCE,
        paint: {
          "line-color": "#2D72D2",
          "line-width": 1.5,
          "line-dasharray": [4, 4],
          "line-opacity": 0.45,
        },
      });
    }

    function onMouseMove(e: maplibregl.MapMouseEvent) {
      if (!map) return;
      ensureLayer();
      const source = map.getSource(PREVIEW_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: [origin, [e.lngLat.lng, e.lngLat.lat]] },
          properties: {},
        }],
      });
    }

    if (map.loaded() && map.isStyleLoaded()) ensureLayer();
    map.on("mousemove", onMouseMove);

    return () => {
      map.off("mousemove", onMouseMove);
      try {
        if (map.getLayer(PREVIEW_LAYER)) map.removeLayer(PREVIEW_LAYER);
        if (map.getSource(PREVIEW_SOURCE)) map.removeSource(PREVIEW_SOURCE);
      } catch { /* map removed */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.moveMode, options.movePath]);

  // Confirmed move path (dashed line + draggable endpoint)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const SOURCE_ID = "move-path-source";
    const LAYER_ID = "move-path-layer";
    const movePath = options.movePath;

    function addPathLayer() {
      if (!map || !mapRef.current) return;

      if (!movePath) {
        try {
          if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
          if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        } catch { /* map removed */ }
        if (destMarkerRef.current) {
          destMarkerRef.current.remove();
          destMarkerRef.current = null;
        }
        return;
      }

      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: [movePath.from, movePath.to] },
          properties: {},
        }],
      };

      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
        map.addLayer({
          id: LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": "#2D72D2",
            "line-width": 2,
            "line-dasharray": [4, 3],
            "line-opacity": 0.7,
          },
        });
      }

      if (!destMarkerRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border:2px solid #2D72D2;border-radius:50%;" +
          "background:rgba(45,114,210,0.2);cursor:grab;box-shadow:0 0 6px rgba(45,114,210,0.5);";
        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat(movePath.to)
          .addTo(map);

        marker.on("dragend", () => {
          const lngLat = marker.getLngLat();
          onDragRef.current?.({ lng: lngLat.lng, lat: lngLat.lat });
        });
        destMarkerRef.current = marker;
      } else {
        destMarkerRef.current.setLngLat(movePath.to);
      }
    }

    if (map.loaded() && map.isStyleLoaded()) {
      addPathLayer();
    } else {
      map.once("styledata", addPathLayer);
    }

    return () => {
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch { /* map removed */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.movePath?.from[0], options.movePath?.from[1], options.movePath?.to[0], options.movePath?.to[1]]);
}
