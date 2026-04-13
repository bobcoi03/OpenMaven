# Alert & Notification Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stacked toast banners and a persistent notification tray to OpenMaven so simulation events (asset destroyed, ROE denial, mission complete, etc.) are visible in real time.

**Architecture:** A dedicated `NotificationContext` (following the `MapLayerContext` pattern) holds all alert state. `ToastContainer` renders stacked toasts via a React portal. `NotificationTray` is a bell-icon + Sheet drawer in the app header. `use-simulation.ts` calls `addNotification` on relevant diff events. Click-to-focus works via a new `focusCoords` field in `MapLayerContext` that `map-view-inner.tsx` watches and responds to with `map.flyTo`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, lucide-react, existing `components/ui/sheet.tsx`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/lib/notification-context.tsx` | Create | Notification state, `addNotification`, `clearAll` |
| `apps/web/src/components/toast-container.tsx` | Create | Stacked auto-dismissing toast banners |
| `apps/web/src/components/notification-tray.tsx` | Create | Bell icon + slide-out drawer |
| `apps/web/src/lib/map-layer-context.tsx` | Modify | Add `focusCoords` + `setFocusCoords` |
| `apps/web/src/components/map-view-inner.tsx` | Modify | Watch `focusCoords`, call `map.flyTo` |
| `apps/web/src/lib/use-simulation.ts` | Modify | Call `addNotification` on sim events |
| `apps/web/src/components/app-shell.tsx` | Modify | Wrap with `NotificationProvider`, mount `<ToastContainer />`, add bell icon |

---

## Task 1: Create `notification-context.tsx`

**Files:**
- Create: `apps/web/src/lib/notification-context.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface Notification {
  id: string;
  severity: "red" | "amber" | "green" | "blue";
  title: string;
  body: string;
  assetId?: string;
  assetLon?: number;
  assetLat?: number;
  timestamp: number;
  read: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  clearAll: () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "timestamp" | "read">) => {
      setNotifications((prev) => [
        {
          ...n,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          read: false,
        },
        ...prev,
      ]);
    },
    [],
  );

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount: notifications.length,
        addNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  return useContext(NotificationContext);
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors related to `notification-context.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/notification-context.tsx
git commit -m "feat(notifications): add NotificationContext with addNotification and clearAll"
```

---

## Task 2: Create `toast-container.tsx`

**Files:**
- Create: `apps/web/src/components/toast-container.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useNotifications, type Notification } from "@/lib/notification-context";
import { useMapLayers } from "@/lib/map-layer-context";

const SEVERITY_COLORS: Record<Notification["severity"], string> = {
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#22c55e",
  blue: "#3b82f6",
};

const SEVERITY_LABELS: Record<Notification["severity"], string> = {
  red: "CRITICAL",
  amber: "WARNING",
  green: "SUCCESS",
  blue: "INFO",
};

function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) {
  const { setFocusCoords } = useMapLayers();
  const color = SEVERITY_COLORS[notification.severity];
  const [visible, setVisible] = useState(false);

  // Slide in on mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss after 4s
  useEffect(() => {
    const t = setTimeout(() => onDismiss(notification.id), 4000);
    return () => clearTimeout(t);
  }, [notification.id, onDismiss]);

  function handleClick() {
    if (notification.assetLon !== undefined && notification.assetLat !== undefined) {
      setFocusCoords({ lng: notification.assetLon, lat: notification.assetLat });
    }
  }

  return (
    <div
      onClick={notification.assetLon !== undefined ? handleClick : undefined}
      style={{
        borderLeft: `3px solid ${color}`,
        transform: visible ? "translateX(0)" : "translateX(110%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.2s ease, opacity 0.2s ease",
        cursor: notification.assetLon !== undefined ? "pointer" : "default",
        background: "var(--om-bg-elevated)",
        border: `1px solid var(--om-border)`,
        borderLeftColor: color,
        borderLeftWidth: "3px",
        borderRadius: "4px",
        padding: "8px 10px",
        minWidth: "260px",
        maxWidth: "320px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <span style={{ fontSize: "9px", fontWeight: 700, color, letterSpacing: "0.1em", paddingTop: "1px", flexShrink: 0 }}>
          {SEVERITY_LABELS[notification.severity]}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--om-text-primary)", lineHeight: 1.3 }}>
            {notification.title}
          </div>
          <div style={{ fontSize: "11px", color: "var(--om-text-secondary)", marginTop: "2px", lineHeight: 1.4 }}>
            {notification.body}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(notification.id); }}
          style={{ color: "var(--om-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0", flexShrink: 0 }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const { notifications } = useNotifications();
  const [visible, setVisible] = useState<Notification[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Sync visible toasts — add new ones, keep dismissed ones until they animate out
  const shownIds = useRef(new Set<string>());

  useEffect(() => {
    const newOnes = notifications.filter((n) => !shownIds.current.has(n.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((n) => shownIds.current.add(n.id));
    setVisible((prev) => [...newOnes, ...prev]);
  }, [notifications]);

  function dismiss(id: string) {
    setVisible((prev) => prev.filter((n) => n.id !== id));
  }

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: "48px",
        right: "12px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      {visible.map((n) => (
        <div key={n.id} style={{ pointerEvents: "all" }}>
          <Toast notification={n} onDismiss={dismiss} />
        </div>
      ))}
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/toast-container.tsx
git commit -m "feat(notifications): add ToastContainer with stacked auto-dismiss toasts"
```

---

## Task 3: Create `notification-tray.tsx`

**Files:**
- Create: `apps/web/src/components/notification-tray.tsx`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNotifications, type Notification } from "@/lib/notification-context";
import { useMapLayers } from "@/lib/map-layer-context";

const SEVERITY_COLORS: Record<Notification["severity"], string> = {
  red: "#ef4444",
  amber: "#f59e0b",
  green: "#22c55e",
  blue: "#3b82f6",
};

function formatRelativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function TrayRow({ notification }: { notification: Notification }) {
  const { setFocusCoords } = useMapLayers();
  const color = SEVERITY_COLORS[notification.severity];
  const clickable = notification.assetLon !== undefined;

  function handleClick() {
    if (notification.assetLon !== undefined && notification.assetLat !== undefined) {
      setFocusCoords({ lng: notification.assetLon, lat: notification.assetLat });
    }
  }

  return (
    <div
      onClick={clickable ? handleClick : undefined}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid var(--om-border)",
        cursor: clickable ? "pointer" : "default",
      }}
      className={clickable ? "hover:bg-[var(--om-bg-hover)]/20" : ""}
    >
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: color,
          marginTop: "3px",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--om-text-primary)" }}>
          {notification.title}
        </div>
        <div style={{ fontSize: "11px", color: "var(--om-text-secondary)", marginTop: "2px" }}>
          {notification.body}
        </div>
        <div style={{ fontSize: "10px", color: "var(--om-text-muted)", marginTop: "4px" }}>
          {formatRelativeTime(notification.timestamp)}
        </div>
      </div>
    </div>
  );
}

export function NotificationTray() {
  const { notifications, unreadCount, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "relative",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--om-text-muted)",
          display: "flex",
          alignItems: "center",
          padding: "4px",
          borderRadius: "4px",
        }}
        className="hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)]/30"
        title="Notifications"
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-2px",
              right: "-2px",
              background: "#ef4444",
              color: "#fff",
              borderRadius: "999px",
              fontSize: "9px",
              fontWeight: 700,
              minWidth: "14px",
              height: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" style={{ width: "320px", background: "var(--om-bg-elevated)", borderLeft: "1px solid var(--om-border)" }}>
          <SheetHeader style={{ paddingBottom: "8px", borderBottom: "1px solid var(--om-border)", marginBottom: "0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <SheetTitle style={{ fontSize: "13px", color: "var(--om-text-primary)" }}>
                Notifications
              </SheetTitle>
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  style={{
                    fontSize: "11px",
                    color: "var(--om-text-muted)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                  className="hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)]/30"
                >
                  Clear all
                </button>
              )}
            </div>
          </SheetHeader>

          <div style={{ overflowY: "auto", height: "calc(100% - 60px)", paddingTop: "4px" }}>
            {notifications.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "120px" }}>
                <span style={{ fontSize: "12px", color: "var(--om-text-muted)" }}>No alerts yet</span>
              </div>
            ) : (
              notifications.map((n) => <TrayRow key={n.id} notification={n} />)
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/notification-tray.tsx
git commit -m "feat(notifications): add NotificationTray bell icon with Sheet drawer and clear-all"
```

---

## Task 4: Add `focusCoords` to `MapLayerContext`

The map already supports a one-shot `flyTo` prop on `MapViewInner`. For repeated notification clicks we need a reactive `focusCoords` in the shared context that `map-view-inner.tsx` can watch.

**Files:**
- Modify: `apps/web/src/lib/map-layer-context.tsx`

- [ ] **Step 1: Add `focusCoords` and `setFocusCoords` to the interface and provider**

In `apps/web/src/lib/map-layer-context.tsx`, update the interface, default context, state, and provider value:

```typescript
// Add to MapLayerContextValue interface:
focusCoords: { lng: number; lat: number } | null;
setFocusCoords: (coords: { lng: number; lat: number } | null) => void;
```

```typescript
// Add to the createContext default:
focusCoords: null,
setFocusCoords: () => {},
```

```typescript
// Add inside MapLayerProvider component body:
const [focusCoords, setFocusCoords] = useState<{ lng: number; lat: number } | null>(null);
```

```typescript
// Add to the Provider value:
focusCoords,
setFocusCoords,
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/map-layer-context.tsx
git commit -m "feat(map): add focusCoords to MapLayerContext for notification click-to-focus"
```

---

## Task 5: Wire `focusCoords` → `map.flyTo` in `map-view-inner.tsx`

**Files:**
- Modify: `apps/web/src/components/map-view-inner.tsx`

- [ ] **Step 1: Import `useMapLayers` and add a `useEffect` that watches `focusCoords`**

At the top of `MapViewInner`, import `useMapLayers`:

```typescript
import { useMapLayers } from "@/lib/map-layer-context";
```

Inside `MapViewInner` (after `const mapRef = useMapInit(...)`), add:

```typescript
const { focusCoords, setFocusCoords } = useMapLayers();

useEffect(() => {
  if (!focusCoords) return;
  const map = mapRef.current;
  if (!map) return;
  map.flyTo({ center: [focusCoords.lng, focusCoords.lat], zoom: 12, duration: 1000 });
  // Clear so the same coords can be re-used next click
  setFocusCoords(null);
}, [focusCoords, setFocusCoords]);
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/map-view-inner.tsx
git commit -m "feat(map): fly to focusCoords when set via notification click"
```

---

## Task 6: Wire into `app-shell.tsx`

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 1: Add imports**

At the top of `app-shell.tsx`, add:

```typescript
import { NotificationProvider } from "@/lib/notification-context";
import { ToastContainer } from "@/components/toast-container";
import { NotificationTray } from "@/components/notification-tray";
```

- [ ] **Step 2: Wrap the return value with `NotificationProvider` and mount `ToastContainer`**

The outermost `<div>` in the `return` of `AppShell` should become:

```tsx
return (
  <NotificationProvider>
    <div className="h-full flex flex-col bg-[var(--om-bg-deep)] text-[var(--om-text-primary)]">
      <ToastContainer />
      {/* rest of existing JSX unchanged */}
    </div>
  </NotificationProvider>
);
```

- [ ] **Step 3: Add `<NotificationTray />` to the header right section**

Find the header right-side `<div className="flex items-center gap-2" ...>` and add `<NotificationTray />` just before the search input:

```tsx
<div className="flex items-center gap-2" ref={searchRef}>
  <NotificationTray />
  {/* existing search input follows */}
  <div className="relative">
    ...
  </div>
```

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/app-shell.tsx
git commit -m "feat(notifications): wire NotificationProvider, ToastContainer, and NotificationTray into app shell"
```

---

## Task 7: Wire `addNotification` into `use-simulation.ts`

**Files:**
- Modify: `apps/web/src/lib/use-simulation.ts`

- [ ] **Step 1: Import `useNotifications`**

At the top of `use-simulation.ts`, add:

```typescript
import { useNotifications } from "@/lib/notification-context";
```

- [ ] **Step 2: Call `useNotifications` inside the hook**

At the top of the `useSimulation` function body (after the existing `useState` declarations), add:

```typescript
const { addNotification } = useNotifications();
```

- [ ] **Step 3: Fire notifications for retaliation events**

In the `diff.asset_updates` loop, inside the block that handles `event === "retaliation" || event === "damaged_by_red"` (around line 318), add after the `setAssets` call:

```typescript
if (retaliations.length > 0) {
  const currentAssets = assetsRef.current;
  for (const u of retaliations) {
    const asset = currentAssets[u.asset_id as string];
    if (!asset) continue;
    const healthPct = Math.round((u.health as number ?? asset.health) * 100);
    addNotification({
      severity: "red",
      title: `${asset.callsign} hit`,
      body: `${asset.asset_type} — ${healthPct}% health remaining`,
      assetId: asset.asset_id,
      assetLon: asset.position.longitude,
      assetLat: asset.position.latitude,
    });
  }
}
```

Note: place this after the existing `setStrikeLog` call for retaliations (around line 339), not inside the `setAssets` updater.

- [ ] **Step 4: Fire notifications for mission complete and aborted**

In the mission updates block, after the existing `setStrikeLog` call for completed missions (around line 391), add:

```typescript
for (const mu of completed) {
  const target = currentAssets[mu.target_id];
  if (mu.status === "complete") {
    addNotification({
      severity: "green",
      title: "Target neutralized",
      body: target ? `${target.callsign} — ${target.asset_type}` : mu.target_id,
      assetId: mu.target_id,
      assetLon: target?.position.longitude,
      assetLat: target?.position.latitude,
    });
  } else if (mu.status === "aborted") {
    addNotification({
      severity: "amber",
      title: "Mission aborted",
      body: `Mission ${mu.mission_id.slice(0, 8)}`,
    });
  }
}
```

- [ ] **Step 5: Fire notifications for new detections**

In the `diff.detections` block (around line 356), after `setDetections(dMap)`, add:

```typescript
for (const d of diff.detections) {
  addNotification({
    severity: "blue",
    title: "New contact",
    body: `${d.lat.toFixed(2)}°N, ${d.lon.toFixed(2)}°E — confidence ${Math.round(d.confidence * 100)}%`,
    assetLon: d.lon,
    assetLat: d.lat,
  });
}
```

- [ ] **Step 6: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/use-simulation.ts
git commit -m "feat(notifications): emit alerts from use-simulation for retaliation, mission complete/aborted, and new contacts"
```

---

## Task 8: Smoke Test

- [ ] **Step 1: Start the stack**

```bash
# From project root
docker compose up -d

# In apps/api
source /path/to/openmaven_env/bin/activate
uvicorn main:app --reload --port 8000

# In apps/web
npm run dev
```

- [ ] **Step 2: Open http://localhost:3000/map**

- [ ] **Step 3: Verify bell icon appears in header (right side, next to search)**

- [ ] **Step 4: Start simulation at 2× speed and confirm toasts appear when events fire (retaliation, mission complete, new contact)**

- [ ] **Step 5: Click a toast — confirm map flies to the relevant asset**

- [ ] **Step 6: Open bell tray — confirm all alerts are listed, newest first**

- [ ] **Step 7: Click "Clear all" — confirm list empties and badge disappears**

- [ ] **Step 8: Final commit if any tweaks were made**

```bash
git add -p
git commit -m "fix(notifications): smoke test adjustments"
```
