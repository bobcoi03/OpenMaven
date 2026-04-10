/**
 * useMapSensorCircles — DOM-based sensor range circles.
 *
 * Uses map.project() to convert geo coords to screen pixels on every render
 * frame, so circles move in perfect sync with DOM markers (no GeoJSON lag).
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

interface SensorRange {
  lng: number;
  lat: number;
  range_km: number;
}

interface UseMapSensorCirclesOptions {
  sensorRanges: SensorRange[] | undefined;
  showSensorRanges: boolean;
}

export function useMapSensorCircles(
  mapRef: React.RefObject<maplibregl.Map | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseMapSensorCirclesOptions,
) {
  const rangesRef = useRef(options.sensorRanges);
  rangesRef.current = options.sensorRanges;
  const visibleRef = useRef(options.showSensorRanges);
  visibleRef.current = options.showSensorRanges;
  const circleEls = useRef<HTMLDivElement[]>([]);

  // Set up render callback
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current) return;

    function updateCircles() {
      const map = mapRef.current;
      if (!map || !containerRef.current) return;
      if (!map.isStyleLoaded()) return;
      const cnt = containerRef.current;
      const ranges = rangesRef.current ?? [];
      const visible = visibleRef.current;

      // Ensure enough circle elements
      while (circleEls.current.length < ranges.length) {
        const el = document.createElement("div");
        el.style.cssText =
          "position:absolute;border-radius:50%;pointer-events:none;" +
          "border:1px solid rgba(45,114,210,0.15);" +
          "background:rgba(45,114,210,0.04);" +
          "transform:translate(-50%,-50%);will-change:transform;";
        cnt.appendChild(el);
        circleEls.current.push(el);
      }

      // Hide extras
      for (let i = ranges.length; i < circleEls.current.length; i++) {
        circleEls.current[i].style.display = "none";
      }

      for (let i = 0; i < ranges.length; i++) {
        const s = ranges[i];
        const el = circleEls.current[i];

        if (!visible) {
          el.style.display = "none";
          continue;
        }

        const center = map.project([s.lng, s.lat]);
        const dLng = s.range_km / (111.32 * Math.cos((s.lat * Math.PI) / 180));
        const edge = map.project([s.lng + dLng, s.lat]);
        const radiusPx = Math.hypot(edge.x - center.x, edge.y - center.y);

        el.style.display = "";
        el.style.left = `${center.x}px`;
        el.style.top = `${center.y}px`;
        el.style.width = `${radiusPx * 2}px`;
        el.style.height = `${radiusPx * 2}px`;
      }
    }

    map.on("render", updateCircles);
    updateCircles();

    return () => {
      map.off("render", updateCircles);
      for (const el of circleEls.current) el.remove();
      circleEls.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force repaint when sensor visibility toggles so circles update immediately
  useEffect(() => {
    const map = mapRef.current;
    if (map) map.triggerRepaint();
  }, [options.showSensorRanges, mapRef]);
}
