# Drone Camera Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synthetic FLIR drone camera feed page reachable by right-clicking a sensor-equipped asset on the map and selecting "View Camera Feed."

**Architecture:** New route `/camera/[assetId]` renders a 70/30 split — left side is a MapLibre satellite map CSS-filtered to look like FLIR with SVG targeting reticles, right side is a tactical HUD panel. The page uses the existing `useSimulation()` hook for live data and auto-returns to `/map` when the drone is destroyed.

**Tech Stack:** Next.js 15 (app router), MapLibre GL, React, Tailwind CSS, lucide-react

---

## File Map

| Action | Path |
|---|---|
| Create | `apps/web/src/app/(dashboard)/camera/[assetId]/page.tsx` |
| Create | `apps/web/src/components/flir-feed.tsx` |
| Create | `apps/web/src/components/drone-hud.tsx` |
| Modify | `apps/web/src/components/context-menu.tsx` |
| Modify | `apps/web/src/lib/use-map-context-menu.ts` |
| Modify | `apps/web/src/app/(dashboard)/map/page.tsx` |
| Modify | `apps/web/src/app/globals.css` |

---

## Task 1: Create feature branch

- [ ] **Step 1: Create and switch to new branch**

```bash
git checkout -b feature/drone-camera-feed
```

Expected output:
```
Switched to a new branch 'feature/drone-camera-feed'
```

---

## Task 2: Add `sensor_type` to context menu state and wire up navigation

**Files:**
- Modify: `apps/web/src/components/context-menu.tsx`
- Modify: `apps/web/src/lib/use-map-context-menu.ts`
- Modify: `apps/web/src/app/(dashboard)/map/page.tsx`

- [ ] **Step 1: Add `sensor_type` and Camera icon to `context-menu.tsx`**

Open `apps/web/src/components/context-menu.tsx`. Make these two changes:

Change the import line from:
```typescript
import { Crosshair, Move, Zap, Info } from "lucide-react";
```
To:
```typescript
import { Crosshair, Move, Zap, Info, Camera } from "lucide-react";
```

Change the `ContextMenuState` asset type from:
```typescript
export interface ContextMenuState {
  type: "asset" | "map";
  asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string; is_ghost?: boolean };
  lngLat?: { lng: number; lat: number };
  x: number;
  y: number;
}
```
To:
```typescript
export interface ContextMenuState {
  type: "asset" | "map";
  asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string; is_ghost?: boolean; sensor_type?: string | null };
  lngLat?: { lng: number; lat: number };
  x: number;
  y: number;
}
```

Then inside the asset context menu `<div className="py-1">` block, add the Camera menu item after the `Details` MenuItem:
```typescript
          <MenuItem
            icon={Info}
            label="Details"
            onClick={() => onAction("details", { assetId: asset.asset_id })}
          />
          {asset.sensor_type && (
            <MenuItem
              icon={Camera}
              label="View Camera Feed"
              onClick={() => onAction("view_camera_feed", { assetId: asset.asset_id })}
            />
          )}
```

- [ ] **Step 2: Add `onViewCameraFeed` to `use-map-context-menu.ts`**

Open `apps/web/src/lib/use-map-context-menu.ts`. Make these changes:

Add `onViewCameraFeed` to the options interface:
```typescript
interface UseMapContextMenuOptions {
  assets: Record<string, SimAsset>;
  onSelectAsset: (asset: SimAsset | null) => void;
  onStartMove: (assetId: string) => void;
  onStartMoveHere: (assetId: string, lng: number, lat: number) => void;
  onStrikeTarget: (targetId: string) => void;
  onViewCameraFeed: (assetId: string) => void;
}
```

Add `onViewCameraFeed` to the destructured params:
```typescript
export function useMapContextMenu({
  assets,
  onSelectAsset,
  onStartMove,
  onStartMoveHere,
  onStrikeTarget,
  onViewCameraFeed,
}: UseMapContextMenuOptions): UseMapContextMenuReturn {
```

Update `handleContextMenu` to enrich the asset with `sensor_type` from the full SimAsset:
```typescript
  const handleContextMenu = useCallback(
    (event: {
      type: "asset" | "map";
      asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string; is_ghost?: boolean };
      lngLat?: { lng: number; lat: number };
      x: number;
      y: number;
    }) => {
      const simAsset = event.asset ? assets[event.asset.asset_id] : undefined;
      setContextMenu({
        type: event.type,
        asset: event.asset
          ? { ...event.asset, sensor_type: simAsset?.sensor_type ?? null }
          : undefined,
        lngLat: event.lngLat,
        x: event.x,
        y: event.y,
      });
    },
    [assets],
  );
```

Add the `view_camera_feed` handler inside `handleAction`, after the `move_here` block:
```typescript
      if (action === "view_camera_feed" && payload?.assetId) {
        onViewCameraFeed(payload.assetId as string);
      }
```

Update the `useCallback` deps for `handleAction` to include `onViewCameraFeed`:
```typescript
    [assets, onSelectAsset, onStartMove, onStartMoveHere, onStrikeTarget, onViewCameraFeed],
```

- [ ] **Step 3: Wire up router navigation in `map/page.tsx`**

Open `apps/web/src/app/(dashboard)/map/page.tsx`.

Add `useRouter` to the next/navigation import. Find the existing import:
```typescript
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
```
And add the router import below it (or alongside existing next/navigation imports):
```typescript
import { useRouter } from "next/navigation";
```

Inside the `MapPage` component, add router after the existing state declarations:
```typescript
  const router = useRouter();
```

Update the `useMapContextMenu` call to pass `onViewCameraFeed`:
```typescript
  const ctx = useMapContextMenu({
    assets: sim.assets,
    onSelectAsset: setSelectedAsset,
    onStartMove: move.startMove,
    onStartMoveHere: move.startMoveHere,
    onStrikeTarget: handleStrikeTarget,
    onViewCameraFeed: (assetId: string) => router.push(`/camera/${assetId}`),
  });
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Expected: no output (zero errors related to these files).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/context-menu.tsx apps/web/src/lib/use-map-context-menu.ts apps/web/src/app/\(dashboard\)/map/page.tsx
git commit -m "feat: add View Camera Feed to asset context menu"
```

---

## Task 3: Add static noise animation to globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Add `@keyframes static-noise` to globals.css**

Open `apps/web/src/app/globals.css` and append at the end of the file:
```css
/* Drone camera feed — static noise animation for destroyed drone */
@keyframes static-noise {
  0%   { opacity: 1;   background-position: 0 0; }
  20%  { opacity: 0.8; background-position: -5px 3px; }
  40%  { opacity: 1;   background-position: 3px -2px; }
  60%  { opacity: 0.9; background-position: -2px 5px; }
  80%  { opacity: 1;   background-position: 4px -4px; }
  100% { opacity: 1;   background-position: 0 0; }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: add static-noise keyframe animation for camera feed"
```

---

## Task 4: Create `DroneHud` component

**Files:**
- Create: `apps/web/src/components/drone-hud.tsx`

- [ ] **Step 1: Create the file**

Create `apps/web/src/components/drone-hud.tsx` with this content:

```typescript
"use client";

/**
 * drone-hud.tsx
 *
 * Tactical HUD panel for the drone camera feed page.
 * Displays live asset telemetry and current target info.
 */

import type { SimAsset, DetectionEntry } from "@/lib/use-simulation";

interface DroneHudProps {
  drone: SimAsset;
  target: DetectionEntry | null;
  connected: boolean;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[9px] text-[#64748B] uppercase tracking-wider">{label}</span>
      <span className="text-[10px] text-[#E2E8F0] font-mono">{value}</span>
    </div>
  );
}

export function DroneHud({ drone, target, connected }: DroneHudProps) {
  const healthColor =
    drone.health > 50 ? "#238551" : drone.health > 25 ? "#C87619" : "#CD4246";

  return (
    <div className="h-full bg-[#1E2229] border-l border-[rgba(255,255,255,0.08)] flex flex-col p-4 gap-5 font-mono overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-[#E2E8F0] uppercase tracking-widest">
          {drone.callsign}
        </span>
        <span
          className="text-[9px] font-bold uppercase tracking-wider"
          style={{ color: connected ? "#32A467" : "#CD4246" }}
        >
          {connected ? "● LIVE" : "● OFFLINE"}
        </span>
      </div>

      {/* Asset type */}
      <div className="text-[10px] text-[#94A3B8] -mt-3">{drone.asset_type}</div>

      {/* Divider */}
      <div className="border-t border-[rgba(255,255,255,0.08)]" />

      {/* Health */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[9px]">
          <span className="text-[#64748B] uppercase tracking-wider">Health</span>
          <span className="text-[#E2E8F0]">{drone.health}%</span>
        </div>
        <div className="h-1.5 bg-[#2D323A] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${drone.health}%`, backgroundColor: healthColor }}
          />
        </div>
      </div>

      {/* Position & Telemetry */}
      <div className="space-y-2">
        <div className="text-[9px] text-[#64748B] uppercase tracking-wider mb-1">Platform</div>
        <DataRow label="Lat" value={drone.position.latitude.toFixed(4)} />
        <DataRow label="Lon" value={drone.position.longitude.toFixed(4)} />
        <DataRow label="Alt" value={`${Math.round(drone.position.altitude_m)} m`} />
        <DataRow label="Hdg" value={`${Math.round(drone.position.heading_deg)}°`} />
        <DataRow label="Spd" value={`${Math.round(drone.speed_kmh)} km/h`} />
        <DataRow label="Status" value={drone.status.toUpperCase()} />
      </div>

      {/* Divider */}
      <div className="border-t border-[rgba(255,255,255,0.08)]" />

      {/* Target */}
      <div className="space-y-2">
        <div className="text-[9px] text-[#64748B] uppercase tracking-wider mb-1">Target</div>
        {target ? (
          <>
            <DataRow label="Conf" value={`${Math.round(target.confidence * 100)}%`} />
            <DataRow label="Lat" value={target.lat.toFixed(4)} />
            <DataRow label="Lon" value={target.lon.toFixed(4)} />
          </>
        ) : (
          <div className="text-[10px] text-[#475569]">No target acquired</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/drone-hud.tsx
git commit -m "feat: add DroneHud tactical info panel"
```

---

## Task 5: Create `FlirFeed` component

**Files:**
- Create: `apps/web/src/components/flir-feed.tsx`

- [ ] **Step 1: Create the file**

Create `apps/web/src/components/flir-feed.tsx` with this content:

```typescript
"use client";

/**
 * flir-feed.tsx
 *
 * Synthetic FLIR drone camera feed.
 * Renders a MapLibre satellite map centered on the drone's live position,
 * applies CSS filters to simulate thermal imaging, and overlays SVG reticles.
 */

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { SimAsset } from "@/lib/use-simulation";

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
    },
  },
  layers: [{ id: "esri-satellite", type: "raster", source: "esri" }],
};

interface FlirFeedProps {
  drone: SimAsset;
  targetLatLon: { lat: number; lon: number } | null;
}

/** Center reticle SVG fixed at the viewport center (drone position) */
function CenterReticle() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        {/* Corner brackets */}
        <polyline points="20,10 10,10 10,20" stroke="#00FF41" strokeWidth="2" />
        <polyline points="60,10 70,10 70,20" stroke="#00FF41" strokeWidth="2" />
        <polyline points="20,70 10,70 10,60" stroke="#00FF41" strokeWidth="2" />
        <polyline points="60,70 70,70 70,60" stroke="#00FF41" strokeWidth="2" />
        {/* Center dot */}
        <circle cx="40" cy="40" r="2" fill="#00FF41" />
        {/* Center crosshair */}
        <line x1="40" y1="30" x2="40" y2="36" stroke="#00FF41" strokeWidth="1" />
        <line x1="40" y1="44" x2="40" y2="50" stroke="#00FF41" strokeWidth="1" />
        <line x1="30" y1="40" x2="36" y2="40" stroke="#00FF41" strokeWidth="1" />
        <line x1="44" y1="40" x2="50" y2="40" stroke="#00FF41" strokeWidth="1" />
      </svg>
    </div>
  );
}

/** Target reticle SVG positioned at the projected pixel coords of the target */
function TargetReticle({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x - 20, top: y - 20 }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="12" stroke="#FF3031" strokeWidth="1.5" strokeDasharray="4 2" />
        <line x1="20" y1="4" x2="20" y2="10" stroke="#FF3031" strokeWidth="1.5" />
        <line x1="20" y1="30" x2="20" y2="36" stroke="#FF3031" strokeWidth="1.5" />
        <line x1="4" y1="20" x2="10" y2="20" stroke="#FF3031" strokeWidth="1.5" />
        <line x1="30" y1="20" x2="36" y2="20" stroke="#FF3031" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function FlirFeed({ drone, targetLatLon }: FlirFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [targetPixel, setTargetPixel] = useState<{ x: number; y: number } | null>(null);

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [drone.position.longitude, drone.position.latitude],
      zoom: 13,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep map centered on drone's live position
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter([drone.position.longitude, drone.position.latitude]);
  }, [drone.position.latitude, drone.position.longitude]);

  // Project target lat/lon to pixel coords for the target reticle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !targetLatLon) {
      setTargetPixel(null);
      return;
    }
    // Wait for map to be ready
    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        const pixel = map.project([targetLatLon.lon, targetLatLon.lat]);
        setTargetPixel({ x: pixel.x, y: pixel.y });
      });
    } else {
      const pixel = map.project([targetLatLon.lon, targetLatLon.lat]);
      setTargetPixel({ x: pixel.x, y: pixel.y });
    }
  }, [targetLatLon, drone.position.latitude, drone.position.longitude]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Map with FLIR CSS filter */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ filter: "grayscale(1) contrast(1.5) brightness(0.65) sepia(0.2)" }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* HUD timestamp */}
      <div className="absolute top-3 right-3 pointer-events-none font-mono text-[10px] text-[#00FF41]/70">
        {new Date().toISOString().replace("T", " ").slice(0, 19)}Z
      </div>

      {/* Drone callsign label */}
      <div className="absolute bottom-3 left-3 pointer-events-none font-mono text-[10px] text-[#00FF41]/70 uppercase tracking-widest">
        {drone.callsign} · ALT {Math.round(drone.position.altitude_m)}m
      </div>

      {/* Center reticle */}
      <CenterReticle />

      {/* Target reticle */}
      {targetPixel && <TargetReticle x={targetPixel.x} y={targetPixel.y} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/flir-feed.tsx
git commit -m "feat: add FlirFeed FLIR camera view component"
```

---

## Task 6: Create camera page

**Files:**
- Create: `apps/web/src/app/(dashboard)/camera/[assetId]/page.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p apps/web/src/app/\(dashboard\)/camera/\[assetId\]
```

Create `apps/web/src/app/(dashboard)/camera/[assetId]/page.tsx`:

```typescript
"use client";

/**
 * camera/[assetId]/page.tsx
 *
 * Synthetic FLIR drone camera feed page.
 * Navigated to by right-clicking a sensor-equipped asset on the map.
 *
 * Layout: 70% FLIR feed | 30% tactical HUD
 *
 * Error states:
 * - Invalid assetId → "Feed unavailable" screen
 * - Drone destroyed → static noise for 2s then auto-navigate to /map
 * - WebSocket offline → OFFLINE badge, stay on page
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSimulation } from "@/lib/use-simulation";
import { FlirFeed } from "@/components/flir-feed";
import { DroneHud } from "@/components/drone-hud";

/** Full-screen static noise overlay shown when drone is destroyed */
function StaticOverlay() {
  return (
    <div
      className="absolute inset-0 z-20 pointer-events-none"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E\")",
        backgroundSize: "150px 150px",
        animation: "static-noise 0.08s infinite",
        backgroundColor: "rgba(0,0,0,0.6)",
        mixBlendMode: "overlay",
      }}
    />
  );
}

export default function CameraPage() {
  const params = useParams();
  const assetId = params.assetId as string;
  const router = useRouter();
  const sim = useSimulation();
  const [showStatic, setShowStatic] = useState(false);
  const destroyedRef = useRef(false);

  const drone = sim.assets[assetId];

  // Find the first detection whose sensor is this drone
  const target =
    Object.values(sim.detections).find((d) => d.sensor_asset_id === assetId) ?? null;

  // Detect drone destroyed → show static → navigate back
  useEffect(() => {
    if (destroyedRef.current) return;
    if (drone?.status === "destroyed") {
      destroyedRef.current = true;
      setShowStatic(true);
      const timer = setTimeout(() => router.push("/map"), 2000);
      return () => clearTimeout(timer);
    }
  }, [drone?.status, router]);

  // Invalid asset (and not showing static from a just-destroyed drone)
  if (!drone && !showStatic) {
    return (
      <div className="h-full flex items-center justify-center bg-[#1E2229]">
        <div className="text-center space-y-3">
          <div className="text-[13px] font-semibold text-[#E2E8F0]">Feed unavailable</div>
          <div className="text-[11px] text-[#64748B]">Asset &quot;{assetId}&quot; not found</div>
          <button
            onClick={() => router.push("/map")}
            className="text-[11px] text-[#4C90F0] hover:underline"
          >
            ← Back to map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* ── FLIR Feed (70%) ── */}
      <div className="flex-1 relative bg-black min-w-0">
        {/* Back button */}
        <button
          onClick={() => router.push("/map")}
          className="absolute top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded bg-black/60 hover:bg-black/80 text-[11px] text-white transition-colors"
        >
          <ArrowLeft size={12} />
          Back to Map
        </button>

        {/* Offline badge */}
        {!sim.connected && (
          <div className="absolute top-4 right-4 z-30 px-2 py-1 bg-[#CD4246]/90 rounded text-[9px] text-white font-mono uppercase tracking-widest">
            ● Offline
          </div>
        )}

        {/* Static overlay (drone destroyed) */}
        {showStatic && <StaticOverlay />}

        {/* FLIR map feed */}
        {drone && (
          <FlirFeed
            drone={drone}
            targetLatLon={target ? { lat: target.lat, lon: target.lon } : null}
          />
        )}
      </div>

      {/* ── Tactical HUD (30%) ── */}
      <div className="w-[280px] shrink-0">
        {drone && (
          <DroneHud drone={drone} target={target} connected={sim.connected} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(dashboard)/camera"
git commit -m "feat: add drone camera feed page /camera/[assetId]"
```

---

## Task 7: Manual verification

- [ ] **Step 1: Start servers**

Terminal 1 (API):
```bash
cd apps/api && uvicorn main:app --reload --port 8000
```

Terminal 2 (Web):
```bash
cd apps/web && npm run dev
```

- [ ] **Step 2: Verify Camera Feed menu item appears**

1. Open `http://localhost:3000/map`
2. Wait for simulation to connect (top bar shows LIVE)
3. Right-click a drone asset (MQ-9 Reaper, REAPER-01, etc.) — assets with sensor_type
4. Confirm "View Camera Feed" option appears in the context menu
5. Right-click a non-sensor asset (M1 Abrams tank) — confirm "View Camera Feed" does NOT appear

- [ ] **Step 3: Verify FLIR feed loads**

1. Right-click a drone → "View Camera Feed"
2. Confirm the page navigates to `/camera/[assetId]`
3. Confirm satellite map loads with grayscale/FLIR filter applied
4. Confirm the green center reticle is visible at center
5. Confirm the HUD on the right shows callsign, health bar, lat/lon, speed
6. Confirm "Back to Map" button in top-left returns to `/map`

- [ ] **Step 4: Verify live tracking**

1. Unpause the simulation (click LIVE or 1x speed)
2. Confirm the FLIR feed map center moves in real-time as the drone moves
3. If the drone has a detected target, confirm the red target reticle appears

- [ ] **Step 5: Verify offline badge**

1. Stop the API server (Ctrl+C in Terminal 1)
2. Confirm the red "● Offline" badge appears on the camera feed page
3. Restart the API — badge disappears

- [ ] **Step 6: Verify invalid asset handling**

1. Navigate directly to `http://localhost:3000/camera/FAKE-ASSET-99`
2. Confirm "Feed unavailable" error screen appears with back button

---

## Task 8: Push branch

- [ ] **Step 1: Push to origin**

```bash
git push origin feature/drone-camera-feed
```

Expected:
```
* [new branch]      feature/drone-camera-feed -> feature/drone-camera-feed
```
