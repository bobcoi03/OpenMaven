/**
 * useMapLines — GeoJSON dashed line layers for strike missions, AI plans, and movement orders.
 *
 * Manages three layers:
 *   - strike-line (red dashed) — active missions + selected pairing
 *   - planned-line (yellow dashed) — AI-planned strikes before execution
 *   - movement-line (blue dotted) — asset movement orders (current → destination)
 */

import { useCallback, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

type LinePair = { from: [number, number]; to: [number, number] };

interface UseMapLinesOptions {
  strikeLine: LinePair | null | undefined;
  strikeLines: LinePair[] | undefined;
  plannedLines: LinePair[] | null | undefined;
  movementLines: LinePair[] | undefined;
}

/** Generic helper: sync a GeoJSON line layer with a set of line features. */
function syncLineLayer(
  map: maplibregl.Map,
  sourceId: string,
  layerId: string,
  features: GeoJSON.Feature[],
  color: string,
  dash: number[],
  opacity: number,
) {
  if (features.length === 0) {
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch { /* already removed */ }
    return;
  }

  const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(geojson);
  } else {
    map.addSource(sourceId, { type: "geojson", data: geojson });
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": 2,
        "line-dasharray": dash,
        "line-opacity": opacity,
      },
    });
  }
}

function toFeature(line: LinePair): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [line.from, line.to] },
    properties: {},
  };
}

export function useMapLines(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapLinesOptions,
) {
  const strikeLineRef = useRef(options.strikeLine);
  strikeLineRef.current = options.strikeLine;
  const strikeLinesRef = useRef(options.strikeLines);
  strikeLinesRef.current = options.strikeLines;
  const plannedLinesRef = useRef(options.plannedLines);
  plannedLinesRef.current = options.plannedLines;
  const movementLinesRef = useRef(options.movementLines);
  movementLinesRef.current = options.movementLines;

  const drawAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    // ── Strike lines (red) ─────────────────────────────────
    const strikeFeatures: GeoJSON.Feature[] = [];
    const sl = strikeLineRef.current;
    if (sl) strikeFeatures.push(toFeature(sl));
    for (const line of strikeLinesRef.current ?? []) {
      if (sl && sl.from[0] === line.from[0] && sl.from[1] === line.from[1]) continue;
      strikeFeatures.push(toFeature(line));
    }
    syncLineLayer(map, "strike-line-source", "strike-line-layer", strikeFeatures, "#CD4246", [4, 3], 0.8);

    // ── Planned lines (yellow) ─────────────────────────────
    const planned = plannedLinesRef.current;
    const plannedFeatures: GeoJSON.Feature[] = (planned ?? []).map(toFeature);
    syncLineLayer(map, "planned-line-source", "planned-line-layer", plannedFeatures, "#D4A017", [6, 4], 0.7);

    // ── Movement lines (blue dotted) ────────────────────────
    const movement = movementLinesRef.current;
    const movementFeatures: GeoJSON.Feature[] = (movement ?? []).map(toFeature);
    syncLineLayer(map, "movement-line-source", "movement-line-layer", movementFeatures, "#2D72D2", [3, 5], 0.45);
  }, [mapRef]);

  // Redraw when any line data changes
  useEffect(() => {
    drawAll();
  }, [options.strikeLine, options.strikeLines, options.plannedLines, options.movementLines, drawAll]);

  // Re-apply after style changes (setStyle nukes all sources/layers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => drawAll();
    map.on("styledata", handler);
    return () => { map.off("styledata", handler); };
  }, [mapRef, drawAll]);
}
