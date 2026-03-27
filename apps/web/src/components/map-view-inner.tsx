"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Company } from "@/lib/mock-data";

interface MapViewProps {
  onMarkerClick?: (company: Company) => void;
  selectedId?: string | null;
  className?: string;
  style?: "dark" | "satellite" | "positron";
  companies?: Company[];
}

// Esri World Imagery — free raster tiles, no API key needed
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

export function MapViewInner({ onMarkerClick, selectedId, className = "", style = "satellite", companies: companiesProp }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const tileStyle =
      style === "satellite"
        ? satelliteStyle
        : style === "dark"
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: tileStyle,
      center: [0, 25],
      zoom: 1.8,
      attributionControl: false,
    });

    mapRef.current = map;

    const companyList = companiesProp ?? [];

    map.on("load", () => {
      companyList.forEach((company) => {
        // Outer container: MapLibre controls its `transform` for positioning.
        // Never set `transform` on this element — it would destroy the translate.
        const el = document.createElement("div");
        el.className = "map-marker";
        el.style.cssText = `
          width: 16px; height: 16px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        `;

        // Inner dot: all visual styling (scale, glow, color) goes here.
        const dot = document.createElement("div");
        dot.className = "map-marker-dot";
        dot.style.cssText = `
          width: 12px; height: 12px; border-radius: 50%;
          background: ${company.status === "Active" ? "#06b6d4" : company.status === "Acquired" ? "#f59e0b" : "#6b7280"};
          border: 2px solid rgba(255,255,255,0.9);
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        `;
        el.appendChild(dot);

        el.addEventListener("mouseenter", () => {
          dot.style.transform = "scale(1.5)";
          dot.style.boxShadow = "0 0 8px rgba(6,182,212,0.6), 0 1px 4px rgba(0,0,0,0.5)";
        });
        el.addEventListener("mouseleave", () => {
          dot.style.transform = "scale(1)";
          dot.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
        });

        const popup = new maplibregl.Popup({
          offset: 12,
          closeButton: false,
          className: "map-popup",
        }).setHTML(`
          <div style="font-family: 'Inter', system-ui, sans-serif; font-size: 11px; padding: 4px 2px; background: #141417; color: #e4e4e7; border-radius: 4px;">
            <strong style="font-size: 12px;">${company.name}</strong><br/>
            <span style="color: #71717a; font-size: 10px;">${company.batch} · ${company.industry}</span><br/>
            <span style="color: #71717a; font-size: 10px;">${company.location}</span>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([company.lng, company.lat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("click", () => {
          onMarkerClick?.(company);
        });

        markersRef.current.push(marker);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight selected marker — apply visual effects to the inner dot,
  // never to the outer element whose `transform` is managed by MapLibre.
  useEffect(() => {
    markersRef.current.forEach((marker, i) => {
      const el = marker.getElement();
      const dot = el.querySelector(".map-marker-dot") as HTMLElement | null;
      if (!dot) return;
      if ((companiesProp ?? [])[i]?.id === selectedId) {
        dot.style.transform = "scale(1.8)";
        dot.style.boxShadow = "0 0 12px rgba(6,182,212,0.8), 0 1px 4px rgba(0,0,0,0.5)";
        el.style.zIndex = "10";
      } else {
        dot.style.transform = "scale(1)";
        dot.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
        el.style.zIndex = "1";
      }
    });
  }, [selectedId]);

  return <div ref={containerRef} className={`w-full h-full ${className}`} />;
}
