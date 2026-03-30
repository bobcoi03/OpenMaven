/**
 * useMapMarkers — sync DOM markers with asset positions.
 * Creates, updates, and removes milsymbol markers on the map.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import ms from "milsymbol";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";
import { getSidc } from "@/lib/sidc-map";

const MARKER_SIZE = 18;

function renderNatoSymbol(asset: TacticalAsset): string {
  const sidc = getSidc(asset.sim_asset_type, asset.affiliation, asset.sim_status);
  const symbol = new ms.Symbol(sidc, {
    size: MARKER_SIZE,
    simpleStatusModifier: true,
  });
  return symbol.asSVG();
}

interface UseMapMarkersOptions {
  assets: TacticalAsset[];
  visibleLayers: Set<AssetClass>;
  selectedId?: string | null;
  onAssetClick?: (asset: TacticalAsset) => void;
  onContextMenu?: (event: {
    type: "asset";
    asset: { asset_id: string; callsign: string; weapons: string[]; faction_id: string; is_ghost?: boolean };
    x: number;
    y: number;
  }) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useMapMarkers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapMarkersOptions,
) {
  const markersRef = useRef<Map<string, { marker: maplibregl.Marker; asset: TacticalAsset }>>(new Map());
  const onAssetClickRef = useRef(options.onAssetClick);
  onAssetClickRef.current = options.onAssetClick;
  const onContextMenuRef = useRef(options.onContextMenu);
  onContextMenuRef.current = options.onContextMenu;

  // Sync markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function syncMarkers() {
      if (!map) return;
      const visible = options.assets.filter((a) => options.visibleLayers.has(a.asset_class));
      const visibleIds = new Set(visible.map((a) => a.asset_id));

      // Remove markers no longer visible
      markersRef.current.forEach(({ marker }, id) => {
        if (!visibleIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      });

      for (const asset of visible) {
        const markerId = asset.is_ghost ? `ghost-${asset.asset_id}` : asset.asset_id;
        const existing = markersRef.current.get(markerId);

        if (existing) {
          existing.marker.setLngLat([asset.longitude, asset.latitude]);
          existing.asset = asset;
          if (asset.is_ghost) {
            const age = asset.ghost_age_ticks ?? 0;
            const opacity = Math.max(0.15, 1.0 - age / 60);
            existing.marker.getElement().style.opacity = String(opacity);
          }
          continue;
        }

        // Build marker element
        const el = document.createElement("div");
        el.style.cssText = "cursor:pointer;display:flex;flex-direction:column;align-items:center;";

        if (asset.is_ghost) {
          const age = asset.ghost_age_ticks ?? 0;
          el.style.opacity = String(Math.max(0.15, 1.0 - age / 60));
          el.style.filter = "saturate(0.3)";
        }

        const inner = document.createElement("div");
        inner.style.cssText = "transition:transform 120ms ease,filter 120ms ease;line-height:0;";
        inner.innerHTML = renderNatoSymbol(asset);
        el.appendChild(inner);

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

        el.addEventListener("mouseenter", () => {
          inner.style.transform = "scale(1.4)";
          el.style.zIndex = "10";
          inner.style.filter = "drop-shadow(0 0 6px rgba(255,255,255,0.5))";
        });
        el.addEventListener("mouseleave", () => {
          inner.style.transform = "scale(1)";
          el.style.zIndex = "1";
          inner.style.filter = "";
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
            const rect = options.containerRef.current?.getBoundingClientRect();
            onContextMenuRef.current?.({
              type: "asset",
              asset: {
                asset_id: entry.asset.asset_id,
                callsign: entry.asset.callsign,
                weapons: entry.asset.weapons ?? [],
                faction_id: entry.asset.faction_id,
                is_ghost: entry.asset.is_ghost,
              },
              x: e.clientX - (rect?.left ?? 0),
              y: e.clientY - (rect?.top ?? 0),
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
  }, [options.assets, options.visibleLayers]);

  // Highlight selected
  useEffect(() => {
    markersRef.current.forEach(({ marker, asset }) => {
      const el = marker.getElement();
      const inner = el.firstElementChild as HTMLElement | null;
      if (!inner) return;
      if (asset.asset_id === options.selectedId) {
        inner.style.transform = "scale(1.8)";
        el.style.zIndex = "20";
        inner.style.filter = "drop-shadow(0 0 8px rgba(255,255,255,0.6))";
      } else {
        inner.style.transform = "scale(1)";
        el.style.zIndex = "1";
        inner.style.filter = "";
      }
    });
  }, [options.selectedId]);

  return markersRef;
}
