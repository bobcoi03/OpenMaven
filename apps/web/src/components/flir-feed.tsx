"use client";

/**
 * flir-feed.tsx
 *
 * Synthetic FLIR camera feed view built on a MapLibre satellite map.
 * The map is locked to the drone's live position (no user pan/zoom).
 * CSS filters simulate a FLIR thermal appearance.
 * Two SVG reticles are overlaid: one fixed at center (drone), one tracking the target.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
      attribution: "Esri",
    },
  },
  layers: [
    { id: "esri-satellite", type: "raster", source: "esri", minzoom: 0, maxzoom: 18 },
  ],
};

interface FlirFeedProps {
  lat: number;
  lon: number;
  targetLat?: number | null;
  targetLon?: number | null;
  isStatic?: boolean;
}

/** Corner-bracket reticle SVG */
function ReticleSvg({ color, size }: { color: string; size: number }) {
  const h = size / 2;
  const arm = Math.round(size * 0.22);
  const gap = Math.round(size * 0.08);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {/* TL */}
      <polyline points={`${h - arm},${h - arm} ${h - arm},${h - gap}`} stroke={color} strokeWidth="1.5" />
      <polyline points={`${h - arm},${h - arm} ${h - gap},${h - arm}`} stroke={color} strokeWidth="1.5" />
      {/* TR */}
      <polyline points={`${h + arm},${h - arm} ${h + arm},${h - gap}`} stroke={color} strokeWidth="1.5" />
      <polyline points={`${h + arm},${h - arm} ${h + gap},${h - arm}`} stroke={color} strokeWidth="1.5" />
      {/* BL */}
      <polyline points={`${h - arm},${h + arm} ${h - arm},${h + gap}`} stroke={color} strokeWidth="1.5" />
      <polyline points={`${h - arm},${h + arm} ${h - gap},${h + arm}`} stroke={color} strokeWidth="1.5" />
      {/* BR */}
      <polyline points={`${h + arm},${h + arm} ${h + arm},${h + gap}`} stroke={color} strokeWidth="1.5" />
      <polyline points={`${h + arm},${h + arm} ${h + gap},${h + arm}`} stroke={color} strokeWidth="1.5" />
      {/* Center dot */}
      <circle cx={h} cy={h} r="1.5" fill={color} />
      {/* Crosshair stubs */}
      <line x1={h - arm + 2} y1={h} x2={h - gap - 2} y2={h} stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1={h + gap + 2} y1={h} x2={h + arm - 2} y2={h} stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1={h} y1={h - arm + 2} x2={h} y2={h - gap - 2} stroke={color} strokeWidth="1" opacity="0.6" />
      <line x1={h} y1={h + gap + 2} x2={h} y2={h + arm - 2} stroke={color} strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

export function FlirFeed({ lat, lon, targetLat, targetLon, isStatic = false }: FlirFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [targetPixel, setTargetPixel] = useState<{ x: number; y: number } | null>(null);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [lon, lat],
      zoom: 13,
      interactive: false,
      attributionControl: {},
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-center on drone position every tick
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter([lon, lat]);
  }, [lat, lon]);

  // Project target lat/lon → screen pixel after each center update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || targetLat == null || targetLon == null) {
      setTargetPixel(null);
      return;
    }
    // Wait until style is loaded before projecting
    const project = () => {
      try {
        const point = map.project([targetLon, targetLat]);
        const el = containerRef.current;
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (point.x >= 0 && point.x <= w && point.y >= 0 && point.y <= h) {
          setTargetPixel({ x: point.x, y: point.y });
        } else {
          setTargetPixel(null);
        }
      } catch {
        setTargetPixel(null);
      }
    };

    if (map.isStyleLoaded()) {
      project();
    } else {
      map.once("load", project);
    }
  }, [lat, lon, targetLat, targetLon]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* MapLibre satellite map with FLIR CSS filter */}
      <div
        ref={containerRef}
        className={isStatic ? "flir-static" : ""}
        style={{
          width: "100%",
          height: "100%",
          filter: "grayscale(1) contrast(1.5) brightness(0.65) sepia(0.2)",
        }}
      />

      {/* Scanline overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.07) 2px, rgba(0,0,0,0.07) 4px)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Corner vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />

      {/* Drone center reticle — always at center via CSS */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <ReticleSvg color="rgba(255,255,255,0.85)" size={56} />
      </div>

      {/* Target reticle — projected screen position */}
      {targetPixel && (
        <div
          style={{
            position: "absolute",
            left: targetPixel.x - 20,
            top: targetPixel.y - 20,
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <ReticleSvg color="rgba(248,113,113,0.9)" size={40} />
          <div
            style={{
              textAlign: "center",
              fontSize: 8,
              fontFamily: "monospace",
              color: "rgba(248,113,113,0.9)",
              letterSpacing: "0.1em",
              marginTop: 2,
            }}
          >
            TGT
          </div>
        </div>
      )}

      {/* Bottom-left coordinates */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          left: 12,
          fontSize: 9,
          fontFamily: "monospace",
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.12em",
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        {`${lat.toFixed(4)}N  ${lon.toFixed(4)}E`}
      </div>
    </div>
  );
}
