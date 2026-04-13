/**
 * useMapTargetLock — targeting reticle overlay + camera follow.
 *
 * When a target is locked:
 *  - Draws an amber targeting reticle (outer spinning ring, inner pulsing
 *    ring, crosshair lines, blinking dot) over the locked asset using DOM
 *    overlay on the map's render loop — identical approach to sensor circles.
 *  - Smoothly pans the camera to follow the asset as it moves each tick.
 *  - On first lock, flies to the asset and zooms in if the current zoom is
 *    too low to be tactically useful.
 *
 * Must be loaded inside MapViewInner (browser-only — maplibre-gl required).
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TacticalAsset } from "@/lib/tactical-mock";

const STYLE_ID = "om-target-lock-style";

const KEYFRAMES = `
@keyframes om-lock-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to   { transform: translate(-50%, -50%) rotate(360deg); }
}
@keyframes om-lock-pulse {
  0%,100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
  50%     { opacity: 0.45; transform: translate(-50%, -50%) scale(1.08); }
}
@keyframes om-lock-blink {
  0%,49% { opacity: 1; }
  50%,100% { opacity: 0; }
}
`;

interface UseMapTargetLockOptions {
  lockedAssetId: string | null | undefined;
  assets: TacticalAsset[];
}

export function useMapTargetLock(
  mapRef: React.RefObject<maplibregl.Map | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseMapTargetLockOptions,
) {
  const lockedRef = useRef(options.lockedAssetId);
  lockedRef.current = options.lockedAssetId;

  const assetsRef = useRef(options.assets);
  assetsRef.current = options.assets;

  // Wrapper div that holds all reticle sub-elements
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

  // Last known position — used to detect movement and gate camera easing
  const prevPosRef = useRef<{ lng: number; lat: number } | null>(null);

  // ── Build reticle DOM elements once ──────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Inject keyframe animations once per page
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
    }

    const wrapper = document.createElement("div");
    wrapper.style.cssText =
      "position:absolute;pointer-events:none;display:none;";

    // Outer dashed ring — slowly spins
    const outer = document.createElement("div");
    outer.style.cssText =
      "position:absolute;" +
      "width:90px;height:90px;" +
      "border-radius:50%;" +
      "border:1.5px dashed rgba(255,176,0,0.65);" +
      "animation:om-lock-spin 10s linear infinite;" +
      "transform:translate(-50%,-50%);";

    // Inner solid ring — pulses
    const inner = document.createElement("div");
    inner.style.cssText =
      "position:absolute;" +
      "width:48px;height:48px;" +
      "border-radius:50%;" +
      "border:1px solid rgba(255,176,0,0.5);" +
      "animation:om-lock-pulse 2s ease-in-out infinite;" +
      "transform:translate(-50%,-50%);";

    // Crosshair — horizontal line
    const crossH = document.createElement("div");
    crossH.style.cssText =
      "position:absolute;" +
      "width:90px;height:1px;" +
      "background:rgba(255,176,0,0.2);" +
      "transform:translate(-50%,-50%);";

    // Crosshair — vertical line
    const crossV = document.createElement("div");
    crossV.style.cssText =
      "position:absolute;" +
      "width:1px;height:90px;" +
      "background:rgba(255,176,0,0.2);" +
      "transform:translate(-50%,-50%);";

    // Centre blinking dot
    const dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute;" +
      "width:4px;height:4px;" +
      "border-radius:50%;" +
      "background:rgba(255,176,0,1);" +
      "transform:translate(-50%,-50%);" +
      "animation:om-lock-blink 1s step-end infinite;";

    // Callsign label — floats above the outer ring
    const label = document.createElement("div");
    label.style.cssText =
      "position:absolute;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',monospace;" +
      "font-size:9px;font-weight:700;letter-spacing:0.12em;" +
      "color:rgba(255,176,0,0.95);" +
      "text-shadow:0 1px 4px rgba(0,0,0,0.9);" +
      "white-space:nowrap;" +
      "transform:translate(-50%, -58px);";

    wrapper.appendChild(outer);
    wrapper.appendChild(inner);
    wrapper.appendChild(crossH);
    wrapper.appendChild(crossV);
    wrapper.appendChild(dot);
    wrapper.appendChild(label);
    container.appendChild(wrapper);

    wrapperRef.current = wrapper;
    labelRef.current = label;

    return () => {
      wrapper.remove();
      wrapperRef.current = null;
      labelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render loop — position reticle over the locked asset every frame ──────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function updateReticle() {
      const map = mapRef.current;
      const wrapper = wrapperRef.current;
      const label = labelRef.current;
      if (!map || !wrapper) return;

      const lockedId = lockedRef.current;
      if (!lockedId) {
        wrapper.style.display = "none";
        return;
      }

      const asset = assetsRef.current.find((a) => a.asset_id === lockedId);
      if (!asset) {
        wrapper.style.display = "none";
        return;
      }

      const pt = map.project([asset.longitude, asset.latitude]);
      wrapper.style.display = "";
      wrapper.style.left = `${pt.x}px`;
      wrapper.style.top = `${pt.y}px`;

      if (label) {
        label.textContent = `◎ ${asset.callsign}`;
      }
    }

    map.on("render", updateReticle);
    updateReticle();

    return () => {
      map.off("render", updateReticle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera follow — ease to asset position when it moves ─────────────────

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const lockedId = options.lockedAssetId;

    if (!lockedId) {
      prevPosRef.current = null;
      return;
    }

    const asset = options.assets.find((a) => a.asset_id === lockedId);
    if (!asset) return;

    const newPos = { lng: asset.longitude, lat: asset.latitude };
    const prev = prevPosRef.current;

    if (!prev) {
      // First lock — fly to the asset, zoom in if needed
      map.flyTo({
        center: [newPos.lng, newPos.lat],
        zoom: Math.max(map.getZoom(), 8),
        duration: 1200,
      });
    } else {
      const moved =
        Math.abs(newPos.lng - prev.lng) > 0.00005 ||
        Math.abs(newPos.lat - prev.lat) > 0.00005;
      if (moved) {
        map.easeTo({ center: [newPos.lng, newPos.lat], duration: 600 });
      }
    }

    prevPosRef.current = newPos;
  // Re-run every time the asset list or locked ID changes (i.e. every tick)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.lockedAssetId, options.assets]);
}
