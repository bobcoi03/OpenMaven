# Alert & Notification Center — Design Spec

**Date:** 2026-04-12
**Branch:** `feat/alert-notification-center` (branch off `feat/ui-tactical-overlays`)
**Approach:** Dedicated `NotificationContext` following existing context patterns

---

## Scope

Add a real-time alert system to OpenMaven. Currently all significant simulation events (asset destroyed, ROE denial, mission complete, etc.) are silent. This feature makes them visible via stacked toast banners and a persistent notification tray.

**In scope:**
- `NotificationContext` — global alert state
- Toast container — stacked, auto-dismissing banners (top-right)
- Notification tray — bell icon + slide-out drawer with full history
- `use-simulation.ts` integration — emit alerts on simulation events
- Click-to-focus — clicking an alert zooms the map to the relevant asset

**Out of scope:**
- Sound/audio alerts
- Per-alert dismiss in the tray
- Notification persistence across page refreshes

---

## Architecture

Four new files, one modified:

### New files

| File | Responsibility |
|------|----------------|
| `apps/web/src/lib/notification-context.tsx` | Context — holds alerts array, exposes `addNotification`, `clearAll` |
| `apps/web/src/components/toast-container.tsx` | Renders stacked toasts in a portal, top-right corner |
| `apps/web/src/components/notification-tray.tsx` | Bell icon + slide-out drawer with full alert history |

### Modified files

| File | Change |
|------|--------|
| `apps/web/src/lib/use-simulation.ts` | Call `addNotification` on relevant simulation events |
| `apps/web/src/components/app-shell.tsx` | Wrap with `NotificationProvider`, mount `<ToastContainer />`, add bell icon to header |

---

## Data Model

```ts
interface Notification {
  id: string           // crypto.randomUUID()
  severity: "red" | "amber" | "green" | "blue"
  title: string
  body: string
  assetId?: string     // if set, clicking zooms map to this asset
  assetLon?: number    // stored at creation time — asset may be destroyed by click time
  assetLat?: number
  timestamp: number    // Date.now()
  read: boolean        // false on creation, never toggled — only clearAll resets
}
```

---

## Event → Alert Mapping

| Simulation Event | Severity | Title | Body |
|-----------------|----------|-------|------|
| `asset_destroyed` | 🔴 red | `"{name} destroyed"` | `"{asset_class} — {faction_id.toUpperCase()}"` |
| `damaged_by_red` / `retaliation` | 🔴 red | `"{name} hit"` | `"{asset_class} — {health_pct}% health remaining"` |
| `roe_denied` | 🟡 amber | `"Strike denied"` | `"{policy_rule} — {target_name}"` |
| `mission_aborted` | 🟡 amber | `"Mission aborted"` | `"Mission #{mission_id}"` |
| `mission_complete` | 🟢 green | `"Target neutralized"` | `"{target_name}"` |
| `contact_detected` | 🔵 blue | `"New contact"` | `"{lat}°N, {lon}°E"` |

---

## NotificationContext

```ts
interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void
  clearAll: () => void
}
```

- `unreadCount` is `notifications.length` (badge only resets on `clearAll`)
- Provider wraps `app-shell.tsx` — available to all children including `use-simulation`

---

## Toast Container

- Fixed portal rendered at the app root (outside normal DOM flow)
- Position: `top-4 right-4`, `z-index: 9999`
- Toasts stack vertically, newest on top
- Each toast:
  - Slide-in from right on mount (CSS transition)
  - Thin colored left border: red `#ef4444` / amber `#f59e0b` / green `#22c55e` / blue `#3b82f6`
  - Bold title, muted body, small timestamp (relative: "just now", "2s ago")
  - × close button (top-right of toast)
  - Auto-dismisses after **4000ms** via `setTimeout` — cleared on manual close
  - Full row is clickable if `assetId` present — calls `map.flyTo({ center: [lon, lat], zoom: 12 })`
  - No cap on concurrent toasts

---

## Notification Tray

- Bell icon (`lucide-react` `Bell`) in app-shell header, right side next to model switcher
- Badge: red dot with `unreadCount` — hidden when 0, only resets on "Clear All"
- Click opens a `Sheet` (right side) from existing `components/ui/sheet.tsx`
- Drawer contents:
  - Header: "Notifications" title + "Clear All" button (right-aligned)
  - Scrollable list of all alerts, newest first
  - Each row: severity color dot, title bold, body muted, relative timestamp
  - Empty state: "No alerts yet" centered
- "Clear All" calls `clearAll()` — empties array and resets badge

---

## Click-to-Focus on Map

- Map ref accessed via existing `MapLayerContext` (already exposes the MapLibre instance)
- When a toast or tray row with `assetId` is clicked, look up the asset in simulation state to get its `longitude`/`latitude`, then call `map.flyTo({ center: [lon, lat], zoom: 12, duration: 800 })`
- If asset not found (already destroyed), do nothing silently

---

## Integration in `use-simulation.ts`

```ts
// At top of hook
const { addNotification } = useNotifications()

// In the WebSocket event handler
case "asset_destroyed":
  addNotification({
    severity: "red",
    title: `${asset.name} destroyed`,
    body: `${asset.asset_class} — ${asset.faction_id.toUpperCase()}`,
    assetId: asset.id,
  })
  break
```

No restructuring of the existing event handler — calls are additive alongside existing state updates.

---

## No Backend Changes

All simulation events already arrive over the existing WebSocket connection. This feature is entirely frontend.
