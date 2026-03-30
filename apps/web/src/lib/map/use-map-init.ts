/**
 * useMapInit — initialise a MapLibre map once and manage its lifecycle.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

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

interface UseMapInitOptions {
  mapStyle: MapStyleId;
  onContextMenu?: (event: { lng: number; lat: number; x: number; y: number }) => void;
  onClick?: (lngLat: { lng: number; lat: number }) => void;
  /** Fly to this location after map loads. */
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
}

export function useMapInit(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseMapInitOptions,
) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onContextMenuRef = useRef(options.onContextMenu);
  onContextMenuRef.current = options.onContextMenu;
  const onClickRef = useRef(options.onClick);
  onClickRef.current = options.onClick;

  const resolvedStyle = MAP_STYLES.find((s) => s.id === options.mapStyle)?.style ?? DARK_STYLE;

  // Initialise map once
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

    map.on("contextmenu", (e) => {
      e.preventDefault();
      onContextMenuRef.current?.({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        x: e.point.x,
        y: e.point.y,
      });
    });

    map.on("click", (e) => {
      onClickRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to a target location when specified
  const flyToRef = useRef(options.flyTo);
  flyToRef.current = options.flyTo;
  const hasFiredFlyTo = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    const target = flyToRef.current;
    if (!map || !target || hasFiredFlyTo.current) return;

    const doFly = () => {
      hasFiredFlyTo.current = true;
      map.flyTo({ center: [target.lng, target.lat], zoom: target.zoom ?? 12, duration: 1500 });
    };

    if (map.loaded()) {
      doFly();
    } else {
      map.once("load", doFly);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(resolvedStyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.mapStyle]);

  return mapRef;
}
