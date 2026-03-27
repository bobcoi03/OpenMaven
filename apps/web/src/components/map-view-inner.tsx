"use client";

/**
 * map-view-inner.tsx
 *
 * Tactical MapLibre map component.  Renders battlefield assets from the
 * Smart Maven simulation engine as class-coded markers on a satellite base
 * layer.  Supports layer visibility toggling (Military / Infrastructure /
 * Logistics) and displays a detail popup on hover.
 *
 * Must be loaded via next/dynamic with ssr:false — maplibre-gl is
 * browser-only.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";

// ── Satellite base style ──────────────────────────────────────────────────────

const satelliteStyle: maplibregl.StyleSpecification = {
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
    {
      id: "esri-satellite",
      type: "raster",
      source: "esri",
      minzoom: 0,
      maxzoom: 18,
    },
  ],
};

// ── Marker colour palette ─────────────────────────────────────────────────────

const CLASS_COLORS: Record<AssetClass, string> = {
  Military:       "#00d4ff",   // bright cyan  — friendly forces
  Infrastructure: "#f59e0b",   // amber        — fixed installations
  Logistics:      "#94a3b8",   // slate        — supply lines
};

const CLASS_BORDER: Record<AssetClass, string> = {
  Military:       "#0891b2",
  Infrastructure: "#b45309",
  Logistics:      "#475569",
};

// ── SVG shapes per asset class ────────────────────────────────────────────────

function markerSvg(asset: TacticalAsset): string {
  const fill  = CLASS_COLORS[asset.asset_class];
  const stroke = CLASS_BORDER[asset.asset_class];

  // MIL-2525-inspired shapes (simplified)
  switch (asset.asset_class) {
    case "Military":
      // Rotated square (diamond) — standard friendly ground unit symbol
      if (asset.asset_type === "Jet") {
        return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="8,1 15,8 8,15 1,8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
          <line x1="8" y1="4" x2="8" y2="12" stroke="${stroke}" stroke-width="1"/>
        </svg>`;
      }
      if (asset.asset_type === "Infantry") {
        return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="${fill}99" stroke="${fill}" stroke-width="1.5"/>
        </svg>`;
      }
      // Tank — solid diamond
      return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="7,1 13,7 7,13 1,7" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      </svg>`;

    case "Infrastructure": {
      // Square with inner cross — installation symbol
      const isCritical =
        asset.status === "CRITICAL" ||
        (asset.efficiency_pct !== undefined && asset.efficiency_pct < 30) ||
        (asset.structural_pct !== undefined && asset.structural_pct < 30);
      const infill = isCritical ? "#ef4444" : fill;
      return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="12" height="12" rx="1" fill="${infill}33" stroke="${infill}" stroke-width="1.5"/>
        <line x1="7" y1="3" x2="7" y2="11" stroke="${infill}" stroke-width="1"/>
        <line x1="3" y1="7" x2="11" y2="7" stroke="${infill}" stroke-width="1"/>
      </svg>`;
    }

    case "Logistics":
      // Small open circle — supply/logistics unit
      return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="6" r="4.5" fill="${fill}44" stroke="${fill}" stroke-width="1.5"/>
      </svg>`;

    default:
      return `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="${fill}"/></svg>`;
  }
}

// ── Popup HTML ────────────────────────────────────────────────────────────────

function buildPopupHtml(asset: TacticalAsset): string {
  const color = CLASS_COLORS[asset.asset_class];

  const metricLine = (() => {
    if (asset.speed_kmh !== undefined) {
      return `<span style="color:#94a3b8">SPD</span> ${asset.speed_kmh} km/h &nbsp;
              <span style="color:#94a3b8">HDG</span> ${asset.heading_deg ?? "—"}°`;
    }
    if (asset.efficiency_pct !== undefined) return `<span style="color:#94a3b8">EFF</span> ${asset.efficiency_pct.toFixed(1)}%`;
    if (asset.output_mw      !== undefined) return `<span style="color:#94a3b8">OUT</span> ${asset.output_mw.toFixed(1)} MW`;
    if (asset.structural_pct !== undefined) return `<span style="color:#94a3b8">STR</span> ${asset.structural_pct.toFixed(1)}%`;
    return "";
  })();

  const statusBadge = asset.status
    ? `<span style="padding:1px 5px;border-radius:2px;font-size:9px;font-weight:600;
         background:${asset.status === "CRITICAL" ? "#ef4444" : asset.status === "DEGRADED" ? "#f59e0b" : "#10b981"}22;
         color:${asset.status === "CRITICAL" ? "#ef4444" : asset.status === "DEGRADED" ? "#f59e0b" : "#10b981"}">
        ${asset.status}
       </span>`
    : "";

  return `
    <div style="font-family:'Inter',system-ui,sans-serif;padding:4px 2px;min-width:160px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
        <strong style="font-size:11px;color:#e2e8f0">${asset.asset_type}</strong>
        ${statusBadge}
      </div>
      <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px">
        ${asset.asset_class}
      </div>
      <div style="font-size:10px;color:#94a3b8;font-family:monospace">${metricLine}</div>
      <div style="font-size:9px;color:#475569;margin-top:3px;font-family:monospace">
        ${asset.latitude.toFixed(4)}°N &nbsp; ${asset.longitude.toFixed(4)}°E
      </div>
    </div>
  `;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TacticalMapProps {
  assets: TacticalAsset[];
  visibleLayers: Set<AssetClass>;
  onAssetClick?: (asset: TacticalAsset) => void;
  selectedId?: string | null;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MapViewInner({
  assets,
  visibleLayers,
  onAssetClick,
  selectedId,
  className = "",
}: TacticalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);
  const markersRef   = useRef<Map<string, { marker: maplibregl.Marker; asset: TacticalAsset }>>(new Map());

  // ── Initialise map ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle,
      // Centre on the theatre: Eastern Syria / Western Iraq border
      center: [43.0, 33.0],
      zoom: 5.5,
      attributionControl: true,
      maxZoom: 16,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // Intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync markers when assets or visibleLayers change ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function renderMarkers() {
      if (!map) return;

      // Remove all existing markers
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();

      const visible = assets.filter((a) => visibleLayers.has(a.asset_class));

      for (const asset of visible) {
        const isCritical =
          asset.status === "CRITICAL" ||
          (asset.efficiency_pct !== undefined && asset.efficiency_pct < 30) ||
          (asset.structural_pct !== undefined && asset.structural_pct < 30);

        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;";
        el.innerHTML = markerSvg(asset);

        if (isCritical) {
          const inner = el.firstElementChild as HTMLElement | null;
          if (inner) inner.classList.add("tac-marker-pulse");
        }

        // Hover scale
        el.addEventListener("mouseenter", () => {
          el.style.transform = "scale(1.6)";
          el.style.zIndex    = "10";
          el.style.filter    = "drop-shadow(0 0 4px " + CLASS_COLORS[asset.asset_class] + ")";
        });
        el.addEventListener("mouseleave", () => {
          el.style.transform = "scale(1)";
          el.style.zIndex    = "1";
          el.style.filter    = "";
        });

        const popup = new maplibregl.Popup({
          offset: 14,
          closeButton: false,
          className: "tac-popup",
        }).setHTML(buildPopupHtml(asset));

        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([asset.longitude, asset.latitude])
          .setPopup(popup)
          .addTo(map!);

        el.addEventListener("click", () => onAssetClick?.(asset));

        markersRef.current.set(asset.asset_id, { marker, asset });
      }
    }

    // Run after map loads (may already be loaded on re-renders)
    if (map.loaded()) {
      renderMarkers();
    } else {
      map.once("load", renderMarkers);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, visibleLayers]);

  // ── Highlight selected marker ───────────────────────────────────────────────
  useEffect(() => {
    markersRef.current.forEach(({ marker, asset }) => {
      const el = marker.getElement();
      if (asset.asset_id === selectedId) {
        el.style.transform = "scale(2)";
        el.style.zIndex    = "20";
        el.style.filter    = "drop-shadow(0 0 8px " + CLASS_COLORS[asset.asset_class] + ")";
      } else {
        el.style.transform = "scale(1)";
        el.style.zIndex    = "1";
        el.style.filter    = "";
      }
    });
  }, [selectedId]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} />;
}
