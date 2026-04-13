/**
 * useMapSigintPulse — animated DOM pulse rings for SIGINT intercept locations.
 *
 * Each new intercept gets a filled dot + an expanding ring that plays a
 * 2-second CSS animation then self-removes. Uses map.project() on every
 * render frame to keep rings locked to their geographic coordinates as
 * the map pans and zooms.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { SigintIntercept } from "@/lib/use-simulation";

interface UseMapSigintPulseOptions {
  sigintIntercepts: SigintIntercept[];
  showSigintPulse: boolean;
}

const THREAT_COLOR: Record<string, string> = {
  HIGH: "#E76A6E",
  MED:  "#EC9A3C",
  LOW:  "#32A467",
};

const KEYFRAME_ID = "om-sigint-pulse";

function injectKeyframe() {
  if (document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAME_ID;
  style.textContent =
    "@keyframes sigint-pulse{" +
    "0%{transform:translate(-50%,-50%) scale(1);opacity:0.85}" +
    "100%{transform:translate(-50%,-50%) scale(3.5);opacity:0}" +
    "}";
  document.head.appendChild(style);
}

export function useMapSigintPulse(
  mapRef: React.RefObject<maplibregl.Map | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseMapSigintPulseOptions,
) {
  const interceptsRef = useRef(options.sigintIntercepts);
  interceptsRef.current = options.sigintIntercepts;

  const showRef = useRef(options.showSigintPulse);
  showRef.current = options.showSigintPulse;

  // intercept_id → { dot, ring } for active rings still in DOM
  const ringsMap = useRef(
    new Map<string, { dot: HTMLDivElement; ring: HTMLDivElement }>(),
  );
  // intercept_ids we've already created a ring for (survives ring removal)
  const knownIds = useRef(new Set<string>());

  // ── Position updater (runs every render frame) ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current) return;

    injectKeyframe();

    function updatePulses() {
      const map = mapRef.current;
      if (!map || !containerRef.current) return;
      if (!map.isStyleLoaded()) return;

      const intercepts = interceptsRef.current;
      const show = showRef.current;
      const cnt = containerRef.current;

      // Build lookup map for O(1) access in the position update loop
      const interceptById = new Map(intercepts.map((i) => [i.intercept_id, i]));

      // Create elements for intercepts we haven't seen yet
      for (const intercept of intercepts) {
        if (knownIds.current.has(intercept.intercept_id)) continue;
        knownIds.current.add(intercept.intercept_id);

        const color = THREAT_COLOR[intercept.threat_level] ?? "#94A3B8";
        const ringSize = Math.round(12 + intercept.confidence * 12);

        const dot = document.createElement("div");
        dot.style.cssText =
          "position:absolute;border-radius:50%;pointer-events:none;" +
          `width:8px;height:8px;background:${color};` +
          "transform:translate(-50%,-50%);will-change:transform;";
        cnt.appendChild(dot);

        const ring = document.createElement("div");
        ring.style.cssText =
          "position:absolute;border-radius:50%;pointer-events:none;" +
          `width:${ringSize}px;height:${ringSize}px;` +
          `border:2px solid ${color};` +
          "transform:translate(-50%,-50%);will-change:transform;" +
          "animation:sigint-pulse 2s ease-out forwards;";
        cnt.appendChild(ring);

        // Position immediately — don't wait for next render event
        if (map.isStyleLoaded()) {
          const initPos = map.project([intercept.lon, intercept.lat]);
          dot.style.left = `${initPos.x}px`;
          dot.style.top = `${initPos.y}px`;
          ring.style.left = `${initPos.x}px`;
          ring.style.top = `${initPos.y}px`;
        }

        ringsMap.current.set(intercept.intercept_id, { dot, ring });

        // Self-remove after animation completes
        const id = intercept.intercept_id;
        window.setTimeout(() => {
          dot.remove();
          ring.remove();
          ringsMap.current.delete(id);
          // knownIds NOT cleared — prevents re-creating ring for same intercept
        }, 2200);
      }

      // Update position + visibility for all active rings
      for (const [id, { dot, ring }] of ringsMap.current) {
        const intercept = interceptById.get(id);
        if (!intercept) continue;

        const pos = map.project([intercept.lon, intercept.lat]);
        const display = show ? "" : "none";

        dot.style.display = display;
        ring.style.display = display;
        dot.style.left = `${pos.x}px`;
        dot.style.top = `${pos.y}px`;
        ring.style.left = `${pos.x}px`;
        ring.style.top = `${pos.y}px`;
      }
    }

    map.on("render", updatePulses);

    return () => {
      map.off("render", updatePulses);
      for (const [, { dot, ring }] of ringsMap.current) {
        dot.remove();
        ring.remove();
      }
      ringsMap.current.clear();
      knownIds.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force repaint when visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.triggerRepaint();
  }, [options.showSigintPulse, mapRef]);
}
