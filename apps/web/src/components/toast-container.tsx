"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const isLocatable = notification.assetLon !== undefined && notification.assetLat !== undefined;

  const handleClick = useCallback(() => {
    setFocusCoords({ lng: notification.assetLon!, lat: notification.assetLat! });
  }, [notification.assetLon, notification.assetLat, setFocusCoords]);

  return (
    <div
      onClick={isLocatable ? handleClick : undefined}
      style={{
        borderLeft: `3px solid ${color}`,
        transform: visible ? "translateX(0)" : "translateX(110%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.2s ease, opacity 0.2s ease",
        cursor: isLocatable ? "pointer" : "default",
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

  const dismiss = useCallback((id: string) => {
    setVisible((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    const newOnes = notifications.filter((n) => !shownIds.current.has(n.id));
    if (newOnes.length === 0) return;
    newOnes.forEach((n) => shownIds.current.add(n.id));
    setVisible((prev) => [...newOnes, ...prev]);
  }, [notifications]);

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
