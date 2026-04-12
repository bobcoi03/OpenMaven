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
  const isLocatable = notification.assetLon !== undefined && notification.assetLat !== undefined;

  function handleClick() {
    setFocusCoords({ lng: notification.assetLon!, lat: notification.assetLat! });
  }

  return (
    <div
      onClick={isLocatable ? handleClick : undefined}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 0",
        borderBottom: "1px solid var(--om-border)",
        cursor: isLocatable ? "pointer" : "default",
      }}
      className={isLocatable ? "hover:bg-[var(--om-bg-hover)]/20" : ""}
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
                  onClick={() => { clearAll(); setOpen(false); }}
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
