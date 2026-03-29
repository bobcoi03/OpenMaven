"use client";

/**
 * map-view-inner.tsx
 *
 * Tactical MapLibre map with MIL-STD-2525 NATO markers rendered via milsymbol.
 * Markers are colored by affiliation (friendly/hostile/neutral) and shaped by
 * battle dimension (air/ground/sea/subsurface).  Each marker shows a callsign
 * label below the symbol.
 *
 * Must be loaded via next/dynamic with ssr:false — maplibre-gl is browser-only.
 */

import { useCallback, useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import ms from "milsymbol";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";
import { getSidc } from "@/lib/sidc-map";

// ── Map styles ───────────────────────────────────────────────────────────────

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "esri-satellite", type: "raster", source: "esri", minzoom: 0, maxzoom: 18 },
  ],
};

export type MapStyleId = "dark" | "satellite";

export const MAP_STYLES: { id: MapStyleId; label: string; style: string | maplibregl.StyleSpecification }[] = [
  { id: "dark",      label: "Dark",      style: DARK_STYLE },
  { id: "satellite", label: "Satellite",  style: SATELLITE_STYLE },
];

// ── NATO symbol rendering ────────────────────────────────────────────────────

const MARKER_SIZE = 18;

function renderNatoSymbol(asset: TacticalAsset): string {
  const sidc = getSidc(asset.sim_asset_type, asset.affiliation);
  const symbol = new ms.Symbol(sidc, { size: MARKER_SIZE });
  return symbol.asSVG();
}

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
    asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string };
    lngLat?: { lng: number; lat: number };
    x: number;
    y: number;
  }) => void;
  onMapClick?: (lngLat: { lng: number; lat: number }) => void;
  /** Dashed path line from asset to destination. */
  movePath?: {
    from: [number, number]; // [lng, lat]
    to: [number, number];   // [lng, lat]
  } | null;
  /** Called when the destination endpoint is dragged to a new position. */
  onMovePathDrag?: (lngLat: { lng: number; lat: number }) => void;
  /** Sensor range circles: array of {lng, lat, range_km} */
  sensorRanges?: Array<{ lng: number; lat: number; range_km: number }>;
  /** Asset ID being moved, or null. Used for cursor + preview line. */
  moveMode?: string | null;
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
}: TacticalMapProps) {
  const containerRef        = useRef<HTMLDivElement>(null);
  const mapRef              = useRef<maplibregl.Map | null>(null);
  const markersRef          = useRef<Map<string, { marker: maplibregl.Marker; asset: TacticalAsset }>>(new Map());
  const onAssetClickRef     = useRef(onAssetClick);
  onAssetClickRef.current   = onAssetClick;
  const onContextMenuRef    = useRef(onContextMenu);
  onContextMenuRef.current  = onContextMenu;
  const onMapClickRef         = useRef(onMapClick);
  onMapClickRef.current       = onMapClick;
  const onMovePathDragRef     = useRef(onMovePathDrag);
  onMovePathDragRef.current   = onMovePathDrag;
  const destMarkerRef         = useRef<maplibregl.Marker | null>(null);

  const resolvedStyle = MAP_STYLES.find((s) => s.id === mapStyle)?.style ?? DARK_STYLE;

  // ── Initialise map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolvedStyle,
      center: [43.0, 33.0],
      zoom: 5.5,
      attributionControl: {},
      maxZoom: 16,
    });

    mapRef.current = map;

    // Map-level right-click (on empty space)
    map.on("contextmenu", (e) => {
      e.preventDefault();
      onContextMenuRef.current?.({
        type: "map",
        lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        x: e.point.x,
        y: e.point.y,
      });
    });

    // Map-level click (for move-mode)
    map.on("click", (e) => {
      onMapClickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Switch style when mapStyle prop changes ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(resolvedStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle]);

  // ── Cursor + preview line for move mode ─────────────────────────────────────
  // When moveMode is set but no destination chosen yet, draw a dashed line
  // from the asset to the cursor. Runs entirely in MapLibre (no React re-renders).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.getCanvas().style.cursor = moveMode ? "crosshair" : "";

    // Only show preview when in move mode without a locked destination
    if (!moveMode || movePath) return;

    const PREVIEW_SOURCE = "move-preview-source";
    const PREVIEW_LAYER = "move-preview-layer";

    // Find the asset's current position from our markers
    const entry = markersRef.current.get(moveMode);
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
          geometry: {
            type: "LineString",
            coordinates: [origin, [e.lngLat.lng, e.lngLat.lat]],
          },
          properties: {},
        }],
      });
    }

    if (map.loaded() && map.isStyleLoaded()) {
      ensureLayer();
    }
    map.on("mousemove", onMouseMove);

    return () => {
      map.off("mousemove", onMouseMove);
      try {
        if (map.getLayer(PREVIEW_LAYER)) map.removeLayer(PREVIEW_LAYER);
        if (map.getSource(PREVIEW_SOURCE)) map.removeSource(PREVIEW_SOURCE);
      } catch { /* map removed */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveMode, movePath]);

  // ── Sync markers — add/remove/update without full rebuild ──────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function syncMarkers() {
      if (!map) return;

      const visible = assets.filter((a) => visibleLayers.has(a.asset_class));
      const visibleIds = new Set(visible.map((a) => a.asset_id));

      // Remove markers for assets no longer visible
      markersRef.current.forEach(({ marker }, id) => {
        if (!visibleIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });

      for (const asset of visible) {
        // Ghost markers get a unique key so they don't collide with the real detection
        const markerId = asset.is_ghost ? `ghost-${asset.asset_id}` : asset.asset_id;

        const existing = markersRef.current.get(markerId);

        if (existing) {
          existing.marker.setLngLat([asset.longitude, asset.latitude]);
          existing.asset = asset;
          // Update ghost opacity based on age
          if (asset.is_ghost) {
            const age = asset.ghost_age_ticks ?? 0;
            const opacity = Math.max(0.15, 1.0 - age / 60);
            existing.marker.getElement().style.opacity = String(opacity);
          }
          continue;
        }

        // Build marker element: NATO symbol + callsign label
        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;";

        // Ghost styling: faded, pulsing dashed border
        if (asset.is_ghost) {
          const age = asset.ghost_age_ticks ?? 0;
          const opacity = Math.max(0.15, 1.0 - age / 60);
          el.style.opacity = String(opacity);
          el.style.filter = "saturate(0.3)";
        }

        const inner = document.createElement("div");
        inner.style.cssText = "transition:transform 120ms ease,filter 120ms ease;line-height:0;";
        inner.innerHTML = renderNatoSymbol(asset);
        el.appendChild(inner);

        // Callsign label below the symbol
        const label = document.createElement("div");
        const ghostSuffix = asset.is_ghost
          ? ` (${Math.round((asset.ghost_age_ticks ?? 0) * 10)}s ago)`
          : "";
        const confidenceSuffix = !asset.is_ghost && asset.detection_confidence !== undefined
          ? ` ${Math.round(asset.detection_confidence * 100)}%`
          : "";
        label.textContent = asset.callsign + confidenceSuffix + ghostSuffix;
        label.style.cssText =
          "font-size:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,system-ui,monospace;font-weight:600;" +
          "color:#d4d4d8;text-shadow:0 1px 3px rgba(0,0,0,0.9);" +
          "white-space:nowrap;margin-top:1px;letter-spacing:0.03em;pointer-events:none;";
        el.appendChild(label);

        // Hover effects (on inner, not el, to preserve MapLibre's transform)
        el.addEventListener("mouseenter", () => {
          inner.style.transform = "scale(1.4)";
          el.style.zIndex       = "10";
          inner.style.filter    = "drop-shadow(0 0 6px rgba(255,255,255,0.5))";
        });
        el.addEventListener("mouseleave", () => {
          inner.style.transform = "scale(1)";
          el.style.zIndex       = "1";
          inner.style.filter    = "";
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([asset.longitude, asset.latitude])
          .addTo(map!);

        const assetId = asset.asset_id;
        el.addEventListener("click", () => {
          const entry = markersRef.current.get(assetId);
          if (entry) onAssetClickRef.current?.(entry.asset);
        });

        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const entry = markersRef.current.get(assetId);
          if (entry) {
            const rect = containerRef.current?.getBoundingClientRect();
            const x = e.clientX - (rect?.left ?? 0);
            const y = e.clientY - (rect?.top ?? 0);
            onContextMenuRef.current?.({
              type: "asset",
              asset: {
                asset_id: entry.asset.asset_id,
                callsign: entry.asset.callsign,
                weapons: entry.asset.weapons ?? [],
                faction_id: entry.asset.faction_id,
              },
              x,
              y,
            });
          }
        });

        markersRef.current.set(markerId, { marker, asset });
      }
    }

    if (map.loaded()) {
      syncMarkers();
    } else {
      map.once("load", syncMarkers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, visibleLayers]);

  // ── Highlight selected marker ───────────────────────────────────────────────
  useEffect(() => {
    markersRef.current.forEach(({ marker, asset }) => {
      const el = marker.getElement();
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;
      if (asset.asset_id === selectedId) {
        inner.style.transform = "scale(1.8)";
        el.style.zIndex       = "20";
        inner.style.filter    = "drop-shadow(0 0 8px rgba(255,255,255,0.6))";
      } else {
        inner.style.transform = "scale(1)";
        el.style.zIndex       = "1";
        inner.style.filter    = "";
      }
    });
  }, [selectedId]);

  // ── Draw move path (dashed line + draggable endpoint) ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const SOURCE_ID = "move-path-source";
    const LAYER_ID = "move-path-layer";

    function addPathLayer() {
      // Guard: map may have been removed between scheduling and execution
      if (!map || !mapRef.current) return;

      if (!movePath) {
        // Remove line and marker if no path
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
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [movePath.from, movePath.to],
            },
            properties: {},
          },
        ],
      };

      // Update or create source/layer
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

      // Destination marker (draggable crosshair)
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
          onMovePathDragRef.current?.({ lng: lngLat.lng, lat: lngLat.lat });
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
      // Guard: map may already be destroyed by the init effect's cleanup
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map already removed — safe to ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movePath?.from[0], movePath?.from[1], movePath?.to[0], movePath?.to[1]]);

  // ── Sensor range circles ───────────────────────────────────────────────────
  // Store latest ranges in a ref so the style listener can access current data
  const sensorRangesRef = useRef(sensorRanges);
  sensorRangesRef.current = sensorRanges;

  // Stable draw function — reads from ref so it always has fresh data
  const drawSensorRanges = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const SOURCE_ID = "sensor-ranges-source";
    const FILL_LAYER = "sensor-ranges-fill";
    const STROKE_LAYER = "sensor-ranges-stroke";

    const features: GeoJSON.Feature[] = (sensorRangesRef.current ?? []).map((s) => {
      const points: [number, number][] = [];
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        const dLat = (s.range_km / 111.32) * Math.sin(angle);
        const dLng = (s.range_km / (111.32 * Math.cos((s.lat * Math.PI) / 180))) * Math.cos(angle);
        points.push([s.lng + dLng, s.lat + dLat]);
      }
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [points] },
        properties: {},
      };
    });

    const geojson: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: FILL_LAYER,
        type: "fill",
        source: SOURCE_ID,
        paint: { "fill-color": "#2D72D2", "fill-opacity": 0.04 },
      });
      map.addLayer({
        id: STROKE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#2D72D2", "line-width": 1, "line-opacity": 0.15 },
      });
    }
  }, []);

  // Redraw whenever sensor positions change (every tick for moving assets)
  useEffect(() => {
    drawSensorRanges();
  }, [sensorRanges, drawSensorRanges]);

  // Re-apply after style changes (setStyle nukes all sources/layers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = () => drawSensorRanges();
    map.on("styledata", handler);
    return () => { map.off("styledata", handler); };
  }, [drawSensorRanges]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} onContextMenu={(e) => e.preventDefault()} />;
}
