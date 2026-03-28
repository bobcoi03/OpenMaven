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

import { useEffect, useRef } from "react";
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
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapViewInner({
  assets,
  visibleLayers,
  onAssetClick,
  selectedId,
  mapStyle = "dark",
  className = "",
}: TacticalMapProps) {
  const containerRef      = useRef<HTMLDivElement>(null);
  const mapRef            = useRef<maplibregl.Map | null>(null);
  const markersRef        = useRef<Map<string, { marker: maplibregl.Marker; asset: TacticalAsset }>>(new Map());
  const onAssetClickRef   = useRef(onAssetClick);
  onAssetClickRef.current = onAssetClick;

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
        const existing = markersRef.current.get(asset.asset_id);

        if (existing) {
          existing.marker.setLngLat([asset.longitude, asset.latitude]);
          existing.asset = asset;
          continue;
        }

        // Build marker element: NATO symbol + callsign label
        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;";

        const inner = document.createElement("div");
        inner.style.cssText = "transition:transform 120ms ease,filter 120ms ease;line-height:0;";
        inner.innerHTML = renderNatoSymbol(asset);
        el.appendChild(inner);

        // Callsign label below the symbol
        const label = document.createElement("div");
        label.textContent = asset.callsign;
        label.style.cssText =
          "font-size:8px;font-family:'Inter',system-ui,monospace;font-weight:600;" +
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

        markersRef.current.set(asset.asset_id, { marker, asset });
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

  return <div ref={containerRef} className={`w-full h-full ${className}`} />;
}
