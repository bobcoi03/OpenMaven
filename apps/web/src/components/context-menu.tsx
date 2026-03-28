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
import { Crosshair, Move, Zap, Info } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ContextMenuState {
  type: "asset" | "map";
  asset?: { asset_id: string; callsign: string; weapons: string[] };
  lngLat?: { lng: number; lat: number };
  x: number;
  y: number;
}

interface ContextMenuProps {
  state: ContextMenuState;
  selectedAssetId: string | null;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onClose: () => void;
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
      ? "text-red-400 hover:bg-red-500/10"
      : "text-zinc-300 hover:bg-zinc-700/50";

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

export function ContextMenu({ state, selectedAssetId, onAction, onClose }: ContextMenuProps) {
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
    return (
      <div
        ref={menuRef}
        style={style}
        className="min-w-[160px] bg-[#1a1a1f] border border-zinc-700/80 rounded-lg shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-3 py-1.5 bg-[#141417] border-b border-zinc-700/60">
          <div className="text-[10px] font-semibold text-cyan-400 tracking-wide">
            {asset.callsign}
          </div>
        </div>

        <div className="py-1">
          <MenuItem
            icon={Move}
            label="Move to..."
            onClick={() => onAction("move", { assetId: asset.asset_id })}
          />
          {asset.weapons.length > 0 && (
            <div className="px-1">
              <div className="px-2 pt-1.5 pb-0.5 text-[9px] text-zinc-600 uppercase tracking-[0.1em]">
                Strike with
              </div>
              {asset.weapons.map((weapon) => (
                <MenuItem
                  key={weapon}
                  icon={Zap}
                  label={weapon}
                  variant="danger"
                  onClick={() =>
                    onAction("strike", {
                      weaponId: weapon,
                      targetId: asset.asset_id,
                    })
                  }
                />
              ))}
            </div>
          )}
          <MenuItem
            icon={Info}
            label="Details"
            onClick={() => onAction("details", { assetId: asset.asset_id })}
          />
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
        className="min-w-[180px] bg-[#1a1a1f] border border-zinc-700/80 rounded-lg shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-3 py-1.5 bg-[#141417] border-b border-zinc-700/60">
          <div className="text-[9px] text-zinc-500 font-mono">
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
            <div className="px-3 py-1.5 text-[10px] text-zinc-600">
              Select an asset first
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
