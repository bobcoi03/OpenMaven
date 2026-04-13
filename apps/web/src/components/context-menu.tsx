"use client";

/**
 * context-menu.tsx
 *
 * Right-click context menu for the tactical map.
 * Two variants:
 *   - Asset context menu: Move to..., Strike, Details
 *   - Map context menu: Move selected asset here
 */

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Crosshair, Move, Zap, Info, Camera, Route } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextMenuState {
  type: "asset" | "map";
  asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string; is_ghost?: boolean; sensor_type?: string | null };
  lngLat?: { lng: number; lat: number };
  x: number;
  y: number;
}

interface ContextMenuProps {
  state: ContextMenuState;
  selectedAssetId: string | null;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onClose: () => void;
  onStartWaypointMode?: (assetId: string) => void;
}

// ── Menu Item ────────────────────────────────────────────────────────────────

function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant = "default",
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  const colors =
    variant === "danger"
      ? "text-[var(--om-red-light)] hover:bg-[var(--om-red)]/10"
      : "text-[var(--om-text-secondary)] hover:bg-[var(--om-bg-hover)]";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${colors}`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// ── Context Menu ─────────────────────────────────────────────────────────────

export function ContextMenu({ state, selectedAssetId, onAction, onClose, onStartWaypointMode }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Clamp position so the menu doesn't overflow the viewport
  const style: React.CSSProperties = {
    position: "absolute",
    left: state.x,
    top: state.y,
    zIndex: 50,
  };

  if (state.type === "asset" && state.asset) {
    const { asset } = state;
    const isFriendly = asset.faction_id === "blue";
    return (
      <div
        ref={menuRef}
        style={style}
        className="min-w-[160px] bg-[var(--om-bg-elevated)] border border-[var(--om-border-strong)] rounded-sm shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-3 py-1.5 bg-[var(--om-bg-primary)] border-b border-[var(--om-border)]">
          <div className={`text-[10px] font-semibold tracking-wide ${isFriendly ? "text-[var(--om-blue-light)]" : "text-[var(--om-red-light)]"}`}>
            {asset.callsign}
          </div>
        </div>

        <div className="py-1">
          {isFriendly && (
            <MenuItem
              icon={Move}
              label="Move to..."
              onClick={() => onAction("move", { assetId: asset.asset_id })}
            />
          )}
          {isFriendly && !asset.is_ghost && onStartWaypointMode && (
            <MenuItem
              icon={Route}
              label="Set Patrol Route"
              onClick={() => {
                onStartWaypointMode(asset.asset_id);
                onClose();
              }}
            />
          )}
          {!isFriendly && !asset.is_ghost && (
            <MenuItem
              icon={Zap}
              label="Strike"
              variant="danger"
              onClick={() =>
                onAction("strike_target", { targetId: asset.asset_id })
              }
            />
          )}
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
        </div>
      </div>
    );
  }

  // Map context menu
  if (state.type === "map" && state.lngLat) {
    const { lngLat } = state;
    return (
      <div
        ref={menuRef}
        style={style}
        className="min-w-[180px] bg-[var(--om-bg-elevated)] border border-[var(--om-border-strong)] rounded-sm shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-3 py-1.5 bg-[var(--om-bg-primary)] border-b border-[var(--om-border)]">
          <div className="text-[9px] text-[var(--om-text-muted)]">
            {lngLat.lat.toFixed(4)}, {lngLat.lng.toFixed(4)}
          </div>
        </div>

        <div className="py-1">
          {selectedAssetId ? (
            <MenuItem
              icon={Crosshair}
              label="Move selected here"
              onClick={() =>
                onAction("move_here", {
                  assetId: selectedAssetId,
                  lat: lngLat.lat,
                  lon: lngLat.lng,
                })
              }
            />
          ) : (
            <div className="px-3 py-1.5 text-[10px] text-[var(--om-text-muted)]">
              Select an asset first
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
