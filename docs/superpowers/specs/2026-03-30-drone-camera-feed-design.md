# Drone Camera Feed — Design Spec
**Date:** 2026-03-30
**Branch:** feature/drone-camera-feed

---

## Overview

Add a synthetic FLIR drone camera feed view to OpenMaven. Right-clicking a sensor-equipped drone on the map reveals a "View Camera Feed" option that navigates to a dedicated fullscreen feed page showing a live, FLIR-styled view centered on the drone's position, along with a tactical HUD.

---

## Architecture

New route: `/camera/[assetId]` inside the existing `(dashboard)` layout.

The page has two zones:
- **Left (70%)** — FLIR feed: a MapLibre map centered on the drone's live lat/lon, dark satellite tile style, CSS-filtered to grayscale + contrast, with a targeting reticle SVG and scanline overlay. If the drone has a tracked target, a second reticle locks onto the target's position.
- **Right (30%)** — HUD panel: drone callsign, asset type, speed, altitude, heading, MGRS coordinates, health bar, and current target info (if any).

---

## Components

### New files

**`app/(dashboard)/camera/[assetId]/page.tsx`**
- Reads `assetId` from URL params
- Connects to `useSimulation()` (existing hook — no new WebSocket)
- Handles destroyed → static → redirect logic
- Renders two-zone layout

**`components/flir-feed.tsx`**
- MapLibre map locked to drone's lat/lon at fixed zoom (no user pan/zoom)
- Dark satellite tile style
- CSS filter: `grayscale(1) contrast(1.4) brightness(0.8)`
- Scanline overlay via repeating CSS gradient
- SVG reticle fixed at center (drone position)
- Second SVG reticle tracking target lat/lon if a target is detected

**`components/drone-hud.tsx`**
- Displays: callsign, asset type, speed, altitude, heading, MGRS coords, health bar
- Target section: target callsign + confidence if a tracked target exists

### Modified files

**`components/context-menu.tsx`**
- Add "View Camera Feed" menu item to asset context menu
- Only visible when `asset.sensor_type !== null`
- Calls `router.push('/camera/' + assetId)` on click

---

## Data Flow

1. User right-clicks a drone → context menu shows "View Camera Feed" (only if `sensor_type` is not null)
2. Click navigates to `/camera/[assetId]`
3. Page mounts and calls `useSimulation()` — reuses existing WebSocket connection
4. Every tick: read `assets[assetId]` for live lat/lon, speed, heading, health
5. `flir-feed.tsx` calls `map.setCenter([lon, lat])` each tick to keep drone centered
6. Target detection: scan `detections` from `useSimulation()` — if any detection's `sensor_asset_id` matches the drone's `asset_id`, use that detection's lat/lon for the target reticle
7. Destroyed: `assets[assetId].status === "destroyed"` → static effect for 2s → `router.push('/map')`
8. Back button → `router.push('/map')`

---

## Error Handling

| Case | Behavior |
|---|---|
| Invalid `assetId` (not in `assets`) | Show "Feed unavailable" screen with back button |
| Drone destroyed | Static/noise CSS animation for 2s, then auto-navigate to `/map` |
| WebSocket disconnected | Show "OFFLINE" indicator on feed, stay on page |

---

## Out of Scope

- WebGL FLIR shader (possible future upgrade from CSS filter approach)
- Multiple simultaneous feeds
- Recording/exporting the feed
- Audio
