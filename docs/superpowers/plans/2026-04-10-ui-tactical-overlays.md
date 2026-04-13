# UI Tactical Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add threat heatmap, zone control indicators, mini-map, event timeline drawer, mission queue panel, and waypoint route editor to the tactical map.

**Architecture:** Hook-per-feature following the existing `lib/map/` pattern. Each map feature is a focused hook wired into `map-view-inner.tsx`. Panel/UI features are standalone React components mounted in `map/page.tsx`. No new abstractions — every feature mirrors existing patterns.

**Tech Stack:** Next.js 16, React 19, TypeScript, MapLibre GL JS, d3-delaunay (new), Tailwind 4, existing `use-simulation` hook for data.

---

## File Map

### New files
| File | Responsibility |
|------|----------------|
| `apps/web/src/lib/map/use-map-heatmap.ts` | A1: MapLibre heatmap layer for red-force density |
| `apps/web/src/lib/map/use-map-zone-control.ts` | A2: Voronoi zone control GeoJSON layer |
| `apps/web/src/lib/map/use-map-waypoints.ts` | D3: Renders waypoint dots + lines on map |
| `apps/web/src/lib/use-map-waypoint-mode.ts` | D3: State machine for waypoint editing |
| `apps/web/src/components/mini-map-panel.tsx` | A3: Pop-out mini-map panel |
| `apps/web/src/components/event-timeline-drawer.tsx` | A4: Collapsible event feed drawer |
| `apps/web/src/components/mission-queue-panel.tsx` | D2: In-flight + queued missions panel |

### Modified files
| File | Change |
|------|--------|
| `apps/web/src/lib/map-layer-context.tsx` | Add `showHeatmap`, `showZoneControl` booleans |
| `apps/web/src/lib/map/index.ts` | Export 3 new hooks |
| `apps/web/src/components/map-view-inner.tsx` | Accept + wire new hook props |
| `apps/web/src/components/map-view.tsx` | Pass new props through |
| `apps/web/src/components/context-menu.tsx` | Add "Set Patrol Route" item |
| `apps/web/src/app/(dashboard)/map/page.tsx` | Mount panels, wire toggles + waypoint mode |

---

## Task 1: Install d3-delaunay

**Files:**
- Modify: `apps/web/package.json` (via pnpm)

- [ ] **Step 1: Install the package**

```bash
cd apps/web
pnpm add d3-delaunay
```

Expected output: `+ d3-delaunay X.X.X` added to `dependencies`.

- [ ] **Step 2: Verify TypeScript types are available**

```bash
pnpm exec tsc --noEmit 2>&1 | head -5
```

Expected: no errors about `d3-delaunay`.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "chore(web): add d3-delaunay for zone control Voronoi"
```

---

## Task 2: Extend MapLayerContext

**Files:**
- Modify: `apps/web/src/lib/map-layer-context.tsx`

- [ ] **Step 1: Add `showHeatmap` and `showZoneControl` to the context interface and provider**

Replace the entire file content:

```typescript
"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { AssetClass } from "@/lib/tactical-mock";
import type { SimAsset } from "@/lib/use-simulation";

interface MapLayerContextValue {
  visibleLayers: Set<AssetClass>;
  toggleLayer: (layer: AssetClass) => void;
  isVisible: (layer: AssetClass) => boolean;
  selectedAsset: SimAsset | null;
  setSelectedAsset: (asset: SimAsset | null) => void;
  showHeatmap: boolean;
  toggleHeatmap: () => void;
  showZoneControl: boolean;
  toggleZoneControl: () => void;
}

const MapLayerContext = createContext<MapLayerContextValue>({
  visibleLayers: new Set(["Military", "Infrastructure", "Logistics"]),
  toggleLayer: () => {},
  isVisible: () => true,
  selectedAsset: null,
  setSelectedAsset: () => {},
  showHeatmap: false,
  toggleHeatmap: () => {},
  showZoneControl: false,
  toggleZoneControl: () => {},
});

export function MapLayerProvider({ children }: { children: React.ReactNode }) {
  const [visibleLayers, setVisibleLayers] = useState<Set<AssetClass>>(
    new Set(["Military", "Infrastructure", "Logistics"] as AssetClass[]),
  );
  const [selectedAsset, setSelectedAssetRaw] = useState<SimAsset | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showZoneControl, setShowZoneControl] = useState(false);

  function toggleLayer(layer: AssetClass) {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  const setSelectedAsset = useCallback((asset: SimAsset | null) => {
    setSelectedAssetRaw(asset);
  }, []);

  return (
    <MapLayerContext.Provider
      value={{
        visibleLayers,
        toggleLayer,
        isVisible: (layer) => visibleLayers.has(layer),
        selectedAsset,
        setSelectedAsset,
        showHeatmap,
        toggleHeatmap: () => setShowHeatmap((v) => !v),
        showZoneControl,
        toggleZoneControl: () => setShowZoneControl((v) => !v),
      }}
    >
      {children}
    </MapLayerContext.Provider>
  );
}

export function useMapLayers(): MapLayerContextValue {
  return useContext(MapLayerContext);
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "map-layer-context"
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/web/src/lib/map-layer-context.tsx
git commit -m "feat(map): add showHeatmap + showZoneControl toggles to MapLayerContext"
```

---

## Task 3: A1 — useMapHeatmap

**Files:**
- Create: `apps/web/src/lib/map/use-map-heatmap.ts`

- [ ] **Step 1: Create the hook**

```typescript
/**
 * useMapHeatmap — renders a MapLibre heatmap layer for red-force asset density.
 *
 * Data source: assets with faction_id !== "blue", weighted by health_pct.
 * Re-renders on every tick. Respects style switches via styledata guard.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TacticalAsset } from "@/lib/tactical-mock";

const SOURCE_ID = "heatmap-source";
const LAYER_ID = "heatmap-layer";

interface UseMapHeatmapOptions {
  assets: TacticalAsset[];
  visible: boolean;
}

export function useMapHeatmap(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapHeatmapOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Add source + layer once on mount; guard against style reloads
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      const map = mapRef.current;
      if (!map) return;
      if (map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: LAYER_ID,
        type: "heatmap",
        source: SOURCE_ID,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-radius": 40,
          "heatmap-intensity": 1,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "rgba(0,128,0,0.4)",
            0.5, "rgba(255,165,0,0.6)",
            1, "rgba(224,92,92,0.85)",
          ],
          "heatmap-opacity": 0.75,
        },
      });
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("load", addLayers);
    }

    map.on("styledata", addLayers);

    return () => {
      map.off("styledata", addLayers);
      const m = mapRef.current;
      if (!m) return;
      if (m.getLayer(LAYER_ID)) m.removeLayer(LAYER_ID);
      if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data + visibility on every render
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const { assets, visible } = optionsRef.current;

    if (!visible) {
      if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, "visibility", "none");
      return;
    }

    if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, "visibility", "visible");

    const features = assets
      .filter((a) => a.faction_id !== "blue" && a.sim_status !== "destroyed")
      .map((a) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [a.longitude, a.latitude] },
        properties: { weight: 1 },
      }));

    source.setData({ type: "FeatureCollection", features });
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "use-map-heatmap"
```

Expected: no output.

> **Note:** `TacticalAsset` has a `position` field as `[lng, lat]` tuple and a `faction_id` string. If `health_pct` is not on `TacticalAsset`, use `1` as default weight — the heatmap will still show density correctly.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/web/src/lib/map/use-map-heatmap.ts
git commit -m "feat(map): add useMapHeatmap hook for red-force density layer"
```

---

## Task 4: A2 — useMapZoneControl

**Files:**
- Create: `apps/web/src/lib/map/use-map-zone-control.ts`

- [ ] **Step 1: Create the hook**

```typescript
/**
 * useMapZoneControl — renders Voronoi zone control polygons.
 *
 * Computes Voronoi regions from alive asset positions each render.
 * Blue zones, red zones, and contested (both within 30km) in amber.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Delaunay } from "d3-delaunay";
import type { TacticalAsset } from "@/lib/tactical-mock";
import type { GeoJSON } from "geojson";

const SOURCE_ID = "zone-control-source";
const FILL_LAYER_ID = "zone-control-fill";
const LINE_LAYER_ID = "zone-control-line";

// Map bounds to clip Voronoi to [west, south, east, north]
const BOUNDS: [number, number, number, number] = [25, 28, 65, 45];

interface UseMapZoneControlOptions {
  assets: TacticalAsset[];
  visible: boolean;
}

function factionColor(faction: string, type: "fill" | "line"): string {
  if (faction === "blue") {
    return type === "fill" ? "rgba(74,144,226,0.12)" : "rgba(74,144,226,0.3)";
  }
  if (faction === "contested") {
    return type === "fill" ? "rgba(245,166,35,0.15)" : "rgba(245,166,35,0.35)";
  }
  return type === "fill" ? "rgba(224,92,92,0.12)" : "rgba(224,92,92,0.3)";
}

function buildGeoJSON(assets: TacticalAsset[]) {
  const alive = assets.filter((a) => a.sim_status !== "destroyed");
  if (alive.length < 3) return { type: "FeatureCollection" as const, features: [] };

  const points = alive.map((a) => [a.longitude, a.latitude] as [number, number]);
  const delaunay = Delaunay.from(points);
  const voronoi = delaunay.voronoi(BOUNDS);

  const features = alive.map((asset, i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return null;

    // Determine if contested: any enemy within 30km
    const [cx, cy] = points[i];
    const isBlue = asset.faction_id === "blue";
    const contested = alive.some((other, j) => {
      if (j === i) return false;
      const otherIsBlue = other.faction_id === "blue";
      if (isBlue === otherIsBlue) return false;
      const dx = (points[j][0] - cx) * 111 * Math.cos((cy * Math.PI) / 180);
      const dy = (points[j][1] - cy) * 111;
      return Math.hypot(dx, dy) < 30;
    });

    const faction = contested ? "contested" : asset.faction_id === "blue" ? "blue" : "red";

    return {
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [cell] },
      properties: {
        fill: factionColor(faction, "fill"),
        line: factionColor(faction, "line"),
      },
    };
  }).filter(Boolean);

  return { type: "FeatureCollection" as const, features: features as GeoJSON.Feature[] };
}

export function useMapZoneControl(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapZoneControlOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      const map = mapRef.current;
      if (!map) return;
      if (map.getSource(SOURCE_ID)) return;

      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer(
        {
          id: FILL_LAYER_ID,
          type: "fill",
          source: SOURCE_ID,
          paint: { "fill-color": ["get", "fill"], "fill-opacity": 1 },
        },
        // Insert below markers (first symbol layer)
        map.getStyle().layers.find((l) => l.type === "symbol")?.id,
      );

      map.addLayer(
        {
          id: LINE_LAYER_ID,
          type: "line",
          source: SOURCE_ID,
          paint: { "line-color": ["get", "line"], "line-width": 1, "line-opacity": 0.8 },
        },
        map.getStyle().layers.find((l) => l.type === "symbol")?.id,
      );
    }

    if (map.isStyleLoaded()) {
      addLayers();
    } else {
      map.once("load", addLayers);
    }

    map.on("styledata", addLayers);

    return () => {
      map.off("styledata", addLayers);
      const m = mapRef.current;
      if (!m) return;
      if (m.getLayer(LINE_LAYER_ID)) m.removeLayer(LINE_LAYER_ID);
      if (m.getLayer(FILL_LAYER_ID)) m.removeLayer(FILL_LAYER_ID);
      if (m.getSource(SOURCE_ID)) m.removeSource(SOURCE_ID);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const { assets, visible } = optionsRef.current;
    const visibility = visible ? "visible" : "none";
    if (map.getLayer(FILL_LAYER_ID)) map.setLayoutProperty(FILL_LAYER_ID, "visibility", visibility);
    if (map.getLayer(LINE_LAYER_ID)) map.setLayoutProperty(LINE_LAYER_ID, "visibility", visibility);

    if (visible) source.setData(buildGeoJSON(assets));
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "use-map-zone-control"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/web/src/lib/map/use-map-zone-control.ts
git commit -m "feat(map): add useMapZoneControl hook for Voronoi zone control layer"
```

---

## Task 5: Wire A1 + A2 into map components

**Files:**
- Modify: `apps/web/src/lib/map/index.ts`
- Modify: `apps/web/src/components/map-view-inner.tsx`
- Modify: `apps/web/src/components/map-view.tsx`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Export new hooks from `lib/map/index.ts`**

Add two lines to the end of `apps/web/src/lib/map/index.ts`:

```typescript
export { useMapHeatmap } from "./use-map-heatmap";
export { useMapZoneControl } from "./use-map-zone-control";
```

- [ ] **Step 2: Add props to `map-view-inner.tsx`**

In `apps/web/src/components/map-view-inner.tsx`, add to the import:

```typescript
import {
  useMapInit,
  useMapMarkers,
  useMapMovePreview,
  useMapLines,
  useMapSensorCircles,
  useMapTargetLock,
  useMapHeatmap,
  useMapZoneControl,
  MAP_STYLES,
  type MapStyleId,
} from "@/lib/map";
```

Add two props to `TacticalMapProps`:

```typescript
  showHeatmap?: boolean;
  showZoneControl?: boolean;
```

Add to destructuring in `MapViewInner`:

```typescript
  showHeatmap = false,
  showZoneControl = false,
```

Add hook calls after `useMapTargetLock`:

```typescript
  useMapHeatmap(mapRef, { assets, visible: showHeatmap });
  useMapZoneControl(mapRef, { assets, visible: showZoneControl });
```

- [ ] **Step 3: Pass props through `map-view.tsx`**

In `apps/web/src/components/map-view.tsx`, add to `MapViewProps`:

```typescript
  showHeatmap?: boolean;
  showZoneControl?: boolean;
```

`MapView` already spreads `{...props}` to `MapViewInner` so no other changes needed.

- [ ] **Step 4: Wire toggles in `map/page.tsx`**

In `apps/web/src/app/(dashboard)/map/page.tsx`, destructure the new context values:

```typescript
const { visibleLayers, selectedAsset, setSelectedAsset, showHeatmap, showZoneControl } = useMapLayers();
```

Pass to `<MapView>`:

```typescript
          showHeatmap={showHeatmap}
          showZoneControl={showZoneControl}
```

- [ ] **Step 5: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Smoke test in browser**

Start dev server and open http://localhost:3000/map. The map loads with no errors. (Toggles will be wired to the sidebar in a later task.)

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/web/src/lib/map/index.ts apps/web/src/components/map-view-inner.tsx apps/web/src/components/map-view.tsx "apps/web/src/app/(dashboard)/map/page.tsx"
git commit -m "feat(map): wire useMapHeatmap + useMapZoneControl into map components"
```

---

## Task 6: Add layer toggle buttons to the sidebar

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 1: Find the layer toggle section in `app-shell.tsx`**

Search for the existing layer toggles (Military, Infrastructure, Logistics). They are rendered as buttons calling `toggleLayer`. The section is inside the left sidebar.

- [ ] **Step 2: Add Heatmap and Zone Control toggle buttons**

After the existing layer toggles, add:

```tsx
{/* Overlay toggles */}
{isOnMapPage && (
  <>
    <div className="w-full h-px bg-[var(--om-border)] my-1" />
    <button
      onClick={toggleHeatmap}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium transition-colors cursor-pointer rounded-sm ${
        showHeatmap
          ? "bg-[var(--om-red)]/10 text-[var(--om-red-light)]"
          : "text-[var(--om-text-secondary)] hover:bg-[var(--om-bg-hover)]"
      }`}
    >
      <span className="w-2 h-2 rounded-full bg-current shrink-0" />
      Threat Heatmap
    </button>
    <button
      onClick={toggleZoneControl}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-medium transition-colors cursor-pointer rounded-sm ${
        showZoneControl
          ? "bg-[var(--om-blue)]/10 text-[var(--om-blue-light)]"
          : "text-[var(--om-text-secondary)] hover:bg-[var(--om-bg-hover)]"
      }`}
    >
      <span className="w-2 h-2 rounded-full bg-current shrink-0" />
      Zone Control
    </button>
  </>
)}
```

> **Note:** Destructure `toggleHeatmap`, `showHeatmap`, `toggleZoneControl`, `showZoneControl` from `useMapLayers()` in the app-shell component. Check whether the shell already has an `isOnMapPage` guard — if not, use `pathname === "/map"` from `usePathname()`.

- [ ] **Step 3: Type-check + browser test**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -10
```

Open http://localhost:3000/map. Clicking "Threat Heatmap" should show the red heatmap on the map. Clicking "Zone Control" should show colored Voronoi cells. Clicking again hides them.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/web/src/components/app-shell.tsx
git commit -m "feat(map): add Threat Heatmap + Zone Control toggles to sidebar"
```

---

## Task 7: A3 — Mini-Map Panel

**Files:**
- Create: `apps/web/src/components/mini-map-panel.tsx`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Create the mini-map panel component**

```typescript
"use client";

/**
 * mini-map-panel.tsx
 *
 * Pop-out panel rendering a second non-interactive MapView instance
 * at reduced scale for theater-level overview.
 */

import { useState } from "react";
import { MapView } from "@/components/map-view";
import type { TacticalAsset, AssetClass } from "@/lib/tactical-mock";

interface MiniMapPanelProps {
  assets: TacticalAsset[];
  visibleLayers: Set<AssetClass>;
}

export function MiniMapPanel({ assets, visibleLayers }: MiniMapPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Toggle button — sits in the top-right HUD toolbar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-2.5 py-1 rounded-sm text-[9px] font-semibold cursor-pointer transition-colors ${
          open
            ? "bg-[var(--om-blue)]/20 text-[var(--om-blue-light)]"
            : "text-[var(--om-text-muted)] hover:text-[var(--om-text-secondary)]"
        }`}
        style={{
          background: open ? undefined : "rgba(30,34,41,0.85)",
          border: `1px solid ${open ? "rgba(45,114,210,0.4)" : "var(--om-border)"}`,
          backdropFilter: "blur(4px)",
        }}
      >
        MINIMAP
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute top-10 right-2 z-30 overflow-hidden rounded-sm shadow-2xl"
          style={{
            width: 260,
            height: 180,
            border: "1px solid var(--om-border)",
            background: "var(--om-bg-deep)",
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 z-10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-widest"
            style={{
              background: "rgba(13,17,23,0.8)",
              borderBottom: "1px solid var(--om-border)",
              color: "var(--om-text-muted)",
              backdropFilter: "blur(4px)",
            }}
          >
            Theater Overview
          </div>
          <div className="w-full h-full pt-4">
            <MapView
              assets={assets}
              visibleLayers={visibleLayers}
              mapStyle="dark"
              className="w-full h-full"
            />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount in `map/page.tsx`**

Add import:

```typescript
import { MiniMapPanel } from "@/components/mini-map-panel";
```

In the top-right HUD toolbar (the `<div className="absolute top-2 right-2 ...">` block), add `<MiniMapPanel>` as the first child before the Sensors button:

```tsx
<MiniMapPanel assets={visibleAssets} visibleLayers={visibleLayers} />
```

- [ ] **Step 3: Type-check + browser test**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -10
```

Open http://localhost:3000/map. Click "MINIMAP" — a 260×180 panel appears top-right showing a small overview map with all assets. Clicking again dismisses it.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/web/src/components/mini-map-panel.tsx "apps/web/src/app/(dashboard)/map/page.tsx"
git commit -m "feat(map): add mini-map pop-out panel"
```

---

## Task 8: A4 — Event Timeline Drawer

**Files:**
- Create: `apps/web/src/components/event-timeline-drawer.tsx`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Create the drawer component**

```typescript
"use client";

/**
 * event-timeline-drawer.tsx
 *
 * Collapsible bottom drawer showing chronological sim events.
 * Always-visible handle bar; expands to 200px on click.
 */

import { useState, useMemo } from "react";
import type { StrikeLogEntry } from "@/lib/use-simulation";
import type { MissionUpdate } from "@/lib/use-simulation";

type EventKind = "destroyed" | "hit" | "miss" | "launched" | "aborted" | "counterattack";

interface TimelineEvent {
  id: string;
  tick: number;
  kind: EventKind;
  label: string;
  assetId?: string;
}

function kindColor(kind: EventKind): string {
  if (kind === "destroyed") return "var(--om-red-light)";
  if (kind === "hit") return "var(--om-orange-light)";
  if (kind === "launched") return "var(--om-blue-light)";
  if (kind === "counterattack") return "var(--om-orange-light)";
  return "var(--om-text-muted)";
}

function kindIcon(kind: EventKind): string {
  if (kind === "destroyed") return "💥";
  if (kind === "hit") return "⚠";
  if (kind === "launched") return "→";
  if (kind === "counterattack") return "⚡";
  if (kind === "aborted") return "✕";
  return "·";
}

interface EventTimelineDrawerProps {
  strikeLog: StrikeLogEntry[];
  currentTick: number;
  onFocusAsset?: (assetId: string) => void;
}

export function EventTimelineDrawer({ strikeLog, currentTick, onFocusAsset }: EventTimelineDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  const events = useMemo((): TimelineEvent[] => {
    return [...strikeLog]
      .sort((a, b) => b.tick - a.tick)
      .slice(0, 50)
      .map((entry) => {
        const outcome = entry.result?.outcome ?? entry.status;
        let kind: EventKind = "launched";
        let label = `${entry.shooter_callsign} → ${entry.target_callsign}`;

        if (outcome === "destroyed") { kind = "destroyed"; label = `${entry.target_callsign} DESTROYED by ${entry.shooter_callsign}`; }
        else if (outcome === "damaged") { kind = "hit"; label = `${entry.target_callsign} HIT by ${entry.shooter_callsign}`; }
        else if (outcome === "missed") { kind = "miss"; label = `${entry.shooter_callsign} MISSED ${entry.target_callsign}`; }
        else if (entry.status === "aborted") { kind = "aborted"; label = `Mission aborted — ${entry.target_callsign}`; }

        return {
          id: entry.mission_id,
          tick: entry.tick,
          kind,
          label,
          assetId: entry.target_id,
        };
      });
  }, [strikeLog]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30"
      style={{ pointerEvents: "none" }}
    >
      {/* Handle bar */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between px-3 cursor-pointer"
        style={{
          pointerEvents: "all",
          height: 24,
          background: "rgba(13,17,23,0.88)",
          borderTop: "1px solid var(--om-border)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--om-text-muted)]">
          Event Timeline
        </span>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[var(--om-blue)]/15 border border-[var(--om-blue)]/25 text-[var(--om-blue-light)]">
              {events.length}
            </span>
          )}
          <span className="text-[8px] text-[var(--om-text-muted)]">{expanded ? "▼" : "▲"}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            pointerEvents: "all",
            maxHeight: 200,
            overflowY: "auto",
            background: "rgba(13,17,23,0.95)",
            borderTop: "1px solid var(--om-border)",
          }}
        >
          {events.length === 0 ? (
            <div className="px-3 py-4 text-[9px] text-[var(--om-text-muted)] text-center">No events yet</div>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => ev.assetId && onFocusAsset?.(ev.assetId)}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--om-border)] last:border-b-0 hover:bg-[var(--om-bg-hover)]/30 transition-colors"
                style={{ cursor: ev.assetId ? "pointer" : "default" }}
              >
                <span style={{ fontSize: 10, color: kindColor(ev.kind), minWidth: 14 }}>
                  {kindIcon(ev.kind)}
                </span>
                <span className="text-[10px] text-[var(--om-text-secondary)] flex-1 truncate">{ev.label}</span>
                <span className="text-[8px] text-[var(--om-text-muted)] shrink-0 tabular-nums">t·{ev.tick.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount in `map/page.tsx`**

Add import:

```typescript
import { EventTimelineDrawer } from "@/components/event-timeline-drawer";
```

Add inside the main map container `<div className="flex-1 relative min-h-0">`, at the very end before its closing `</div>`:

```tsx
<EventTimelineDrawer
  strikeLog={sim.strikeLog}
  currentTick={sim.tick}
  onFocusAsset={(assetId) => {
    const asset = sim.assets[assetId];
    if (asset) setSelectedAsset(asset);
  }}
/>
```

- [ ] **Step 3: Type-check + browser test**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -10
```

Open http://localhost:3000/map. A thin handle bar appears at the bottom of the map. Run the sim — after some missions complete, click the handle to expand and see the event feed.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/web/src/components/event-timeline-drawer.tsx "apps/web/src/app/(dashboard)/map/page.tsx"
git commit -m "feat(map): add event timeline collapsible drawer"
```

---

## Task 9: D2 — Mission Queue Panel

**Files:**
- Create: `apps/web/src/components/mission-queue-panel.tsx`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Create the mission queue panel**

```typescript
"use client";

/**
 * mission-queue-panel.tsx
 *
 * Shows all in-flight and queued missions with live progress bars.
 * Positioned above the strike log panel (bottom-right).
 */

import type { MissionUpdate } from "@/lib/use-simulation";
import type { SimAsset } from "@/lib/use-simulation";

interface MissionQueuePanelProps {
  activeMissions: Record<string, MissionUpdate>;
  assets: Record<string, SimAsset>;
  currentTick: number;
  initialDistances: Record<string, number>;
  onAbort: (missionId: string) => void;
}

function missionProgress(
  mission: MissionUpdate,
  assets: Record<string, SimAsset>,
  initialDist: number,
): number {
  const shooter = assets[mission.shooter_id];
  const target = assets[mission.target_id];
  if (!shooter || !target || initialDist === 0) return 0;
  const dx = (shooter.position.longitude - target.position.longitude) * 111 * Math.cos((target.position.latitude * Math.PI) / 180);
  const dy = (shooter.position.latitude - target.position.latitude) * 111;
  const currentDist = Math.hypot(dx, dy);
  return Math.min(1, Math.max(0, 1 - currentDist / initialDist));
}

export function MissionQueuePanel({
  activeMissions,
  assets,
  currentTick,
  initialDistances,
  onAbort,
}: MissionQueuePanelProps) {
  const missions = Object.values(activeMissions);
  if (missions.length === 0) return null;

  const inFlight = missions.filter((m) => m.status === "in_flight");
  const queued = missions.filter((m) => m.status !== "in_flight");

  return (
    <div
      className="absolute bottom-4 right-4 z-40 rounded-sm overflow-hidden shadow-2xl"
      style={{
        width: 280,
        background: "var(--om-bg-elevated)",
        border: "1px solid var(--om-border)",
        marginBottom: 296, // clear the strike log panel (280px max-height + 16px gap)
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--om-border)] bg-[var(--om-bg-primary)]">
        <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--om-text-secondary)]">
          Mission Queue
        </span>
        <div className="flex gap-1.5">
          {inFlight.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 bg-[var(--om-blue)]/15 border border-[var(--om-blue)]/25 rounded-full text-[var(--om-blue-light)]">
              {inFlight.length} active
            </span>
          )}
          {queued.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 bg-[var(--om-orange)]/15 border border-[var(--om-orange)]/25 rounded-full text-[var(--om-orange-light)]">
              {queued.length} queued
            </span>
          )}
        </div>
      </div>

      {/* Mission rows */}
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {missions.map((mission) => {
          const shooter = assets[mission.shooter_id];
          const target = assets[mission.target_id];
          const progress = missionProgress(mission, assets, initialDistances[mission.mission_id] ?? 0);
          const isInFlight = mission.status === "in_flight";

          return (
            <div key={mission.mission_id} className="px-2.5 py-2 border-b border-[var(--om-border)] last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-[var(--om-text-primary)] truncate flex-1">
                  {shooter?.callsign ?? "?"} → {target?.callsign ?? "?"}
                </span>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span
                    className="text-[8px] px-1.5 py-0.5 rounded-sm border"
                    style={{
                      background: isInFlight ? "rgba(74,144,226,0.15)" : "rgba(245,166,35,0.12)",
                      borderColor: isInFlight ? "rgba(74,144,226,0.35)" : "rgba(245,166,35,0.3)",
                      color: isInFlight ? "var(--om-blue-light)" : "var(--om-orange-light)",
                    }}
                  >
                    {isInFlight ? "IN FLIGHT" : "QUEUED"}
                  </span>
                  <button
                    onClick={() => onAbort(mission.mission_id)}
                    className="text-[8px] text-[var(--om-text-muted)] hover:text-[var(--om-red-light)] transition-colors cursor-pointer"
                    title="Abort mission"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-[var(--om-text-muted)] mb-1.5">
                <span>{mission.weapon_id}</span>
              </div>
              {isInFlight && (
                <div className="h-1 bg-[var(--om-bg-deep)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progress * 100}%`,
                      background: "linear-gradient(90deg, #1a4a8a, #4a90e2)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `initialDistances` tracking in `map/page.tsx`**

The panel needs initial shooter→target distances to compute progress bars. Add a ref that tracks them:

```typescript
import { MissionQueuePanel } from "@/components/mission-queue-panel";
```

Add after existing state declarations:

```typescript
const missionInitialDistsRef = useRef<Record<string, number>>({});

// Track initial distances when missions are first seen
useEffect(() => {
  for (const [id, mission] of Object.entries(sim.activeMissions)) {
    if (missionInitialDistsRef.current[id] !== undefined) continue;
    const shooter = sim.assets[mission.shooter_id];
    const target = sim.assets[mission.target_id];
    if (!shooter || !target) continue;
    const dx = (shooter.position.longitude - target.position.longitude) * 111 * Math.cos((target.position.latitude * Math.PI) / 180);
    const dy = (shooter.position.latitude - target.position.latitude) * 111;
    missionInitialDistsRef.current[id] = Math.hypot(dx, dy);
  }
  // Clean up completed missions
  for (const id of Object.keys(missionInitialDistsRef.current)) {
    if (!sim.activeMissions[id]) delete missionInitialDistsRef.current[id];
  }
}, [sim.activeMissions, sim.assets]);
```

Mount the panel inside the map container:

```tsx
<MissionQueuePanel
  activeMissions={sim.activeMissions}
  assets={sim.assets}
  currentTick={sim.tick}
  initialDistances={missionInitialDistsRef.current}
  onAbort={sim.abortMission}
/>
```

- [ ] **Step 3: Type-check + browser test**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -10
```

Run the sim at 2× speed. When missions are active, the queue panel appears bottom-right showing in-flight missions with progress bars. Clicking ✕ aborts a mission.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/web/src/components/mission-queue-panel.tsx "apps/web/src/app/(dashboard)/map/page.tsx"
git commit -m "feat(map): add mission queue panel with live progress bars"
```

---

## Task 10: D3 — Waypoint Mode State Machine

**Files:**
- Create: `apps/web/src/lib/use-map-waypoint-mode.ts`

- [ ] **Step 1: Create the waypoint mode hook**

```typescript
"use client";

/**
 * useMapWaypointMode — state machine for multi-waypoint route editing.
 *
 * State: idle → selecting (asset chosen) → placing (clicks add waypoints)
 *       → confirmed (dispatches move orders) → idle
 *
 * Mirrors use-map-move.ts patterns.
 */

import { useState, useCallback, useEffect } from "react";
import type { SimAsset } from "./use-simulation";

const MAX_WAYPOINTS = 5;

export interface Waypoint {
  lng: number;
  lat: number;
}

interface UseMapWaypointModeOptions {
  assets: Record<string, SimAsset>;
  moveAsset: (assetId: string, lat: number, lon: number) => void;
}

interface UseMapWaypointModeReturn {
  waypointAssetId: string | null;
  waypoints: Waypoint[];
  startWaypointMode: (assetId: string) => void;
  handleMapClick: (lngLat: { lng: number; lat: number }) => void;
  confirm: () => void;
  cancel: () => void;
}

export function useMapWaypointMode({
  assets,
  moveAsset,
}: UseMapWaypointModeOptions): UseMapWaypointModeReturn {
  const [waypointAssetId, setWaypointAssetId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  // ESC cancels
  useEffect(() => {
    if (!waypointAssetId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setWaypointAssetId(null);
        setWaypoints([]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [waypointAssetId]);

  // Auto-cancel if asset is destroyed while placing
  useEffect(() => {
    if (!waypointAssetId) return;
    const asset = assets[waypointAssetId];
    if (!asset || asset.status === "destroyed") {
      setWaypointAssetId(null);
      setWaypoints([]);
    }
  }, [waypointAssetId, assets]);

  const startWaypointMode = useCallback((assetId: string) => {
    setWaypointAssetId(assetId);
    setWaypoints([]);
  }, []);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (!waypointAssetId) return;
      setWaypoints((prev) => {
        if (prev.length >= MAX_WAYPOINTS) return prev;
        return [...prev, { lng: lngLat.lng, lat: lngLat.lat }];
      });
    },
    [waypointAssetId],
  );

  const confirm = useCallback(() => {
    if (!waypointAssetId || waypoints.length === 0) return;
    // Dispatch all move orders immediately — backend queues them natively
    for (const wp of waypoints) {
      moveAsset(waypointAssetId, wp.lat, wp.lng);
    }
    setWaypointAssetId(null);
    setWaypoints([]);
  }, [waypointAssetId, waypoints, moveAsset]);

  const cancel = useCallback(() => {
    setWaypointAssetId(null);
    setWaypoints([]);
  }, []);

  return { waypointAssetId, waypoints, startWaypointMode, handleMapClick, confirm, cancel };
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "waypoint"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd ../..
git add apps/web/src/lib/use-map-waypoint-mode.ts
git commit -m "feat(map): add useMapWaypointMode state machine"
```

---

## Task 11: D3 — Waypoint Map Rendering Hook

**Files:**
- Create: `apps/web/src/lib/map/use-map-waypoints.ts`

- [ ] **Step 1: Create the hook**

```typescript
/**
 * useMapWaypoints — renders waypoint dots and connecting dashed lines.
 *
 * Uses two GeoJSON sources: one for the line path, one for dot labels.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { TacticalAsset } from "@/lib/tactical-mock";
import type { Waypoint } from "@/lib/use-map-waypoint-mode";

const LINE_SOURCE = "waypoint-line-source";
const DOT_SOURCE = "waypoint-dot-source";
const LINE_LAYER = "waypoint-line-layer";
const DOT_LAYER = "waypoint-dot-layer";

interface UseMapWaypointsOptions {
  waypointAssetId: string | null;
  waypoints: Waypoint[];
  assets: TacticalAsset[];
}

export function useMapWaypoints(
  mapRef: React.RefObject<maplibregl.Map | null>,
  options: UseMapWaypointsOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addLayers() {
      const map = mapRef.current;
      if (!map) return;
      if (map.getSource(LINE_SOURCE)) return;

      map.addSource(LINE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(DOT_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: LINE_SOURCE,
        paint: {
          "line-color": "rgba(74,144,226,0.6)",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      });

      map.addLayer({
        id: DOT_LAYER,
        type: "circle",
        source: DOT_SOURCE,
        paint: {
          "circle-radius": 5,
          "circle-color": "#1a2a3a",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#4a90e2",
        },
      });
    }

    if (map.isStyleLoaded()) addLayers();
    else map.once("load", addLayers);
    map.on("styledata", addLayers);

    return () => {
      map.off("styledata", addLayers);
      const m = mapRef.current;
      if (!m) return;
      if (m.getLayer(DOT_LAYER)) m.removeLayer(DOT_LAYER);
      if (m.getLayer(LINE_LAYER)) m.removeLayer(LINE_LAYER);
      if (m.getSource(DOT_SOURCE)) m.removeSource(DOT_SOURCE);
      if (m.getSource(LINE_SOURCE)) m.removeSource(LINE_SOURCE);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const lineSource = map.getSource(LINE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    const dotSource = map.getSource(DOT_SOURCE) as maplibregl.GeoJSONSource | undefined;
    if (!lineSource || !dotSource) return;

    const { waypointAssetId, waypoints, assets } = optionsRef.current;

    if (!waypointAssetId || waypoints.length === 0) {
      lineSource.setData({ type: "FeatureCollection", features: [] });
      dotSource.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const asset = assets.find((a) => a.asset_id === waypointAssetId);
    const startCoord: [number, number] = asset
      ? [asset.longitude, asset.latitude]
      : [waypoints[0].lng, waypoints[0].lat];

    const coords: [number, number][] = [
      startCoord,
      ...waypoints.map((wp) => [wp.lng, wp.lat] as [number, number]),
    ];

    lineSource.setData({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      }],
    });

    dotSource.setData({
      type: "FeatureCollection",
      features: waypoints.map((wp, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [wp.lng, wp.lat] },
        properties: { index: i + 1 },
      })),
    });
  });
}
```

- [ ] **Step 2: Export from `lib/map/index.ts`**

```typescript
export { useMapWaypoints } from "./use-map-waypoints";
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "waypoint"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd ../..
git add apps/web/src/lib/map/use-map-waypoints.ts apps/web/src/lib/map/index.ts
git commit -m "feat(map): add useMapWaypoints rendering hook"
```

---

## Task 12: D3 — Wire Waypoint Mode into Map + Context Menu

**Files:**
- Modify: `apps/web/src/components/map-view-inner.tsx`
- Modify: `apps/web/src/components/map-view.tsx`
- Modify: `apps/web/src/components/context-menu.tsx`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Add waypoint props to `map-view-inner.tsx`**

Import `useMapWaypoints`:

```typescript
import {
  // ... existing imports ...
  useMapWaypoints,
} from "@/lib/map";
import type { Waypoint } from "@/lib/use-map-waypoint-mode";
```

Add props:

```typescript
  waypointAssetId?: string | null;
  waypoints?: Waypoint[];
```

Add to destructuring:

```typescript
  waypointAssetId = null,
  waypoints = [],
```

Add hook call after `useMapZoneControl`:

```typescript
  useMapWaypoints(mapRef, { waypointAssetId, waypoints, assets });
```

`useMapWaypoints` accepts `TacticalAsset[]` — the same `assets` array already available in `MapViewInner`. No conversion needed.

- [ ] **Step 2: Pass props through `map-view.tsx`**

Add to `MapViewProps`:

```typescript
  waypointAssetId?: string | null;
  waypoints?: Waypoint[];
```

Import `Waypoint`:

```typescript
import type { Waypoint } from "@/lib/use-map-waypoint-mode";
```

- [ ] **Step 3: Add "Set Patrol Route" to `context-menu.tsx`**

Import `Route` icon from lucide-react (already imported in app-shell, add here):

```typescript
import { Crosshair, Move, Zap, Info, Route } from "lucide-react";
```

Add to `ContextMenuProps`:

```typescript
  onStartWaypointMode?: (assetId: string) => void;
```

In the asset context menu section, after the "Move to..." `MenuItem`, add:

```tsx
{state.asset && state.asset.faction_id === "blue" && !state.asset.is_ghost && onStartWaypointMode && (
  <MenuItem
    icon={Route}
    label="Set Patrol Route"
    onClick={() => {
      onStartWaypointMode(state.asset!.asset_id);
      onClose();
    }}
  />
)}
```

- [ ] **Step 4: Wire everything in `map/page.tsx`**

Import and instantiate the waypoint mode hook:

```typescript
import { useMapWaypointMode } from "@/lib/use-map-waypoint-mode";
import type { Waypoint } from "@/lib/use-map-waypoint-mode";
```

Add after the `move` hook:

```typescript
const waypoint = useMapWaypointMode({ assets: sim.assets, moveAsset: sim.moveAsset });
```

Pass to `<MapView>`:

```tsx
          waypointAssetId={waypoint.waypointAssetId}
          waypoints={waypoint.waypoints}
          onMapClick={waypoint.waypointAssetId ? waypoint.handleMapClick : move.moveMode ? move.handleMapClick : undefined}
```

Pass `onStartWaypointMode` to `<ContextMenu>`:

```tsx
          onStartWaypointMode={waypoint.startWaypointMode}
```

Add waypoint mode HUD indicator (after the move-mode indicator block):

```tsx
{waypoint.waypointAssetId && (
  <div
    className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 rounded-sm text-[10px] font-semibold"
    style={{
      background: "rgba(45,114,210,0.15)",
      border: "1px solid rgba(45,114,210,0.4)",
      color: "var(--om-blue-light)",
      backdropFilter: "blur(4px)",
    }}
  >
    <span>WAYPOINT MODE</span>
    <span className="opacity-50">·</span>
    <span>{sim.assets[waypoint.waypointAssetId]?.callsign ?? waypoint.waypointAssetId}</span>
    <span className="opacity-50">·</span>
    <span>{waypoint.waypoints.length} / 5 points</span>
    {waypoint.waypoints.length > 0 && (
      <button
        onClick={waypoint.confirm}
        className="px-2 py-0.5 bg-[var(--om-blue)]/20 border border-[var(--om-blue)]/40 rounded-sm hover:bg-[var(--om-blue)]/30 cursor-pointer transition-colors"
      >
        Confirm
      </button>
    )}
    <button
      onClick={waypoint.cancel}
      className="text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] cursor-pointer"
    >
      Cancel
    </button>
  </div>
)}
```

- [ ] **Step 5: Type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -20
```

Fix any type errors, then re-run until clean.

- [ ] **Step 6: Browser test**

1. Run sim, right-click a blue asset → "Set Patrol Route"
2. HUD shows "WAYPOINT MODE · [callsign] · 0 / 5 points"
3. Click map 3 times — numbered dots appear connected by dashed lines
4. Click "Confirm" — asset begins moving to waypoints in order
5. Press ESC — mode cancels cleanly

- [ ] **Step 7: Commit**

```bash
cd ../..
git add apps/web/src/components/map-view-inner.tsx apps/web/src/components/map-view.tsx apps/web/src/components/context-menu.tsx "apps/web/src/app/(dashboard)/map/page.tsx"
git commit -m "feat(map): wire waypoint mode — patrol route editor end-to-end"
```

---

## Task 13: Final smoke test + push

- [ ] **Step 1: Full type-check**

```bash
cd apps/web && pnpm exec tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Dev build check**

```bash
pnpm build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual end-to-end test checklist**

With the sim running at 2× speed, verify each feature:

- [ ] **A1 Heatmap:** Toggle "Threat Heatmap" in sidebar → red density cloud appears over enemy assets, updates each tick
- [ ] **A2 Zone Control:** Toggle "Zone Control" → blue/red/amber Voronoi cells visible, shift as assets move
- [ ] **A3 Mini-map:** Click "MINIMAP" → 260×180 panel appears top-right, shows all assets at theater scale
- [ ] **A4 Timeline:** Handle visible at map bottom → click to expand → events populate as missions complete
- [ ] **D2 Mission Queue:** Launch a strike → queue panel appears bottom-right with progress bar → ✕ aborts mission
- [ ] **D3 Waypoints:** Right-click blue asset → "Set Patrol Route" → click 3 map points → Confirm → asset follows route

- [ ] **Step 4: Push branch**

```bash
cd ../..
git push origin feat/ui-tactical-overlays
```
