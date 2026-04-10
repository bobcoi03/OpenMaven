# UI Tactical Overlays — Design Spec

**Date:** 2026-04-10
**Branch:** `feat/ui-tactical-overlays`
**Approach:** Hook-per-feature, following existing `lib/map/` patterns

---

## Scope

Five features across two areas:

| ID | Feature | Area |
|----|---------|------|
| A1 | Threat Heatmap | Map Overlays |
| A2 | Zone Control Indicators | Map Overlays |
| A3 | Mini-Map | Map Overlays |
| A4 | Event Timeline Drawer | Map Overlays |
| D2 | Mission Queue Panel | Mission Planning |
| D3 | Waypoint Route Editor | Mission Planning |

---

## Architecture

All new map features follow the existing hook-per-feature pattern in `lib/map/`. `map-view-inner.tsx` remains a thin orchestrator. Panel/UI components live in `components/`.

No new abstractions. No shared overlay manager. Each feature is independently understandable and testable.

---

## A1 — Threat Heatmap

**What it does:** Renders a MapLibre heatmap layer using red-force asset positions. Gives instant read of enemy density across the theater.

**Hook:** `lib/map/use-map-heatmap.ts`

**Data source:** Filters `assets` prop for `faction_id !== "blue"`, maps to GeoJSON point features weighted by `health_pct` (0–1). No new server data needed.

**Layer config:**
- Type: `heatmap`
- Weight: asset `health_pct`
- Radius: 40px
- Color ramp: green → yellow → red (low → high density)
- Z-index: below markers, above base tiles

**Toggle:** Added to the existing layer controls sidebar in `MapLayerContext` as a new boolean toggle (`showHeatmap`). Consistent with how `showSensorRanges` works today.

**Style safety:** Follows same guard pattern as `use-map-sensor-circles.ts` — checks `map.isStyleLoaded()` before adding sources/layers, re-adds on `styledata` event after style switches.

---

## A2 — Zone Control Indicators

**What it does:** Renders filled Voronoi regions showing which faction controls each area of the map. Blue zones, red zones, and contested zones (both factions within 30km) in amber.

**Hook:** `lib/map/use-map-zone-control.ts`

**Data source:** All alive asset positions (blue + red) from `assets` prop. Voronoi computed client-side using `d3-delaunay` (lightweight, already common in JS ecosystems). Clipped to map bounds.

**Rendering:**
- Blue controlled: `rgba(74, 144, 226, 0.12)` fill, `rgba(74, 144, 226, 0.3)` stroke
- Red controlled: `rgba(224, 92, 92, 0.12)` fill, `rgba(224, 92, 92, 0.3)` stroke
- Contested: `rgba(245, 166, 35, 0.15)` fill, `rgba(245, 166, 35, 0.35)` stroke

**Toggle:** New boolean `showZoneControl` in `MapLayerContext`. Togglable via layer controls sidebar.

**Performance:** Recomputed on every tick. Voronoi on ~100 points is negligible. GeoJSON source updated via `map.getSource('zone-control').setData(...)`.

---

## A3 — Mini-Map

**What it does:** A pop-out panel showing a reduced-scale overview of the full theater. Non-interactive. Shares the same asset and layer data as the main map.

**Implementation:** React component `components/mini-map-panel.tsx`. Not a hook — it renders a second `MapView` instance at 260×180px. Uses `mapStyle="dark"` always (independent of main map style).

**Toggle:** "MINIMAP" button added to the top-right HUD toolbar in `map/page.tsx`. Opens as a floating panel positioned `absolute top-14 right-2 z-30`.

**Props passed:** `assets`, `visibleLayers` — same as main map. No `onAssetClick`, no `onContextMenu` (read-only).

**Cleanup:** Second map instance is destroyed when panel closes via `map.remove()` in the component's `useEffect` cleanup.

---

## A4 — Event Timeline Drawer

**What it does:** Collapsible drawer at the bottom of the map viewport showing a chronological feed of sim events. Always-visible handle bar shows event count badge.

**Implementation:** React component `components/event-timeline-drawer.tsx`. Positioned `absolute bottom-0 left-0 right-0 z-30` inside the map container.

**States:**
- Collapsed: 28px handle bar visible, shows `N events` badge
- Expanded: slides up to 200px, shows scrollable event list

**Data source:** `sim.strikeLog` (already exists) + `sim.activeMissions` state changes. No new server data. Events derived in the component from existing sim state.

**Event types shown:**
- Strike mission launched (blue)
- Asset destroyed (red)
- Strike mission complete — hit/miss/destroyed (green/amber/red)
- Counterattack detected (amber)

**Click to focus:** Clicking an event calls `setSelectedAsset()` and fires a custom `openmaven:fly-to` event that the map page listens for, triggering `flyTo` on the relevant asset.

---

## D2 — Mission Queue Panel

**What it does:** Shows all in-flight and queued missions with live progress bars. Cancel button aborts a mission. Positioned above the existing strike log panel.

**Implementation:** React component `components/mission-queue-panel.tsx`. Positioned `absolute bottom-4 right-4 z-40`. Width 280px. Collapsible with same pattern as strike log.

**Data source:** `sim.activeMissions` (already exists in `use-simulation.ts`). Progress bar derived from `missionInitialDistKm` vs current shooter→target distance, same calculation as the existing `StrikePairingPanel`.

**Sections:**
- IN FLIGHT missions: progress bar, weapon, ETA in ticks
- QUEUED missions: cancel button (calls `sim.abortMission()`)

**Empty state:** Panel hidden entirely when `activeMissions` is empty (no missions = no noise).

---

## D3 — Waypoint Route Editor

**What it does:** Multi-waypoint movement mode. Activated via "Set Patrol Route" in the right-click context menu on a friendly asset. User clicks the map to place up to 5 waypoints. Confirm dispatches sequential move orders.

**Hooks:**
- `lib/use-map-waypoint-mode.ts` — state machine for waypoint editing (mirrors `use-map-move.ts`)
- `lib/map/use-map-waypoints.ts` — renders waypoint dots and dashed connecting lines on the map (MapLibre GeoJSON layers)

**State machine:**
```
idle → selecting (asset chosen) → placing (clicking map adds waypoints, max 5)
     → confirmed (dispatches move orders sequentially) → idle
```

**Backend:** Reuses existing `POST /simulation/move` endpoint sequentially — no new API endpoint needed. Orders dispatched in waypoint index order, all fired immediately on confirm (the backend queues movement natively).

**Map rendering:**
- Asset start: blue filled circle (S label)
- Waypoints: numbered dots (1–5), blue outline, dark fill
- Connecting lines: dashed blue `rgba(74, 144, 226, 0.5)`

**Mode indicator:** Same top-center HUD bar pattern as move mode. Shows `WAYPOINT MODE · [callsign] · N / 5 points` with Confirm and Cancel buttons.

**Entry point:** "Set Patrol Route" option added to `context-menu.tsx` for friendly (blue) assets only.

---

## File Checklist

### New files
| File | Purpose |
|------|---------|
| `lib/map/use-map-heatmap.ts` | A1 heatmap hook |
| `lib/map/use-map-zone-control.ts` | A2 zone control hook |
| `lib/map/use-map-waypoints.ts` | D3 map rendering hook |
| `lib/use-map-waypoint-mode.ts` | D3 state machine hook |
| `components/mini-map-panel.tsx` | A3 mini-map panel |
| `components/event-timeline-drawer.tsx` | A4 event timeline |
| `components/mission-queue-panel.tsx` | D2 mission queue |

### Modified files
| File | Change |
|------|--------|
| `lib/map/index.ts` | Export new map hooks |
| `lib/map-layer-context.tsx` | Add `showHeatmap`, `showZoneControl` toggles |
| `components/map-view-inner.tsx` | Wire new hooks |
| `components/map-view.tsx` | Pass new props |
| `components/context-menu.tsx` | Add "Set Patrol Route" option |
| `app/(dashboard)/map/page.tsx` | Mount new panels, wire waypoint mode |

### New dependency
| Package | Reason |
|---------|--------|
| `d3-delaunay` | Voronoi computation for zone control (A2) |

---

## Out of Scope

- Drag-to-assign strike UI (dropped during design)
- Manual zone drawing
- B-series HUD features (force balance bar, threat level, toasts)
- Backend changes (all features use existing endpoints)
