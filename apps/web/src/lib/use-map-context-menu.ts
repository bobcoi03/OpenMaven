"use client";

/**
 * useMapContextMenu — manages right-click context menu state and actions.
 *
 * Handles asset context menus (move, strike, details) and map context
 * menus (move selected asset here). Dispatches to the appropriate
 * move/strike/select callbacks.
 */

import { useState, useCallback } from "react";
import type { ContextMenuState } from "@/components/context-menu";
import type { SimAsset } from "./use-simulation";

interface UseMapContextMenuOptions {
  assets: Record<string, SimAsset>;
  onSelectAsset: (asset: SimAsset | null) => void;
  onStartMove: (assetId: string) => void;
  onStartMoveHere: (assetId: string, lng: number, lat: number) => void;
  onStrikeTarget: (targetId: string) => void;
  onViewCameraFeed: (assetId: string) => void;
}

interface UseMapContextMenuReturn {
  contextMenu: ContextMenuState | null;
  handleContextMenu: (event: {
    type: "asset" | "map";
    asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string };
    lngLat?: { lng: number; lat: number };
    x: number;
    y: number;
  }) => void;
  handleAction: (action: string, payload?: Record<string, unknown>) => void;
  close: () => void;
}

export function useMapContextMenu({
  assets,
  onSelectAsset,
  onStartMove,
  onStartMoveHere,
  onStrikeTarget,
  onViewCameraFeed,
}: UseMapContextMenuOptions): UseMapContextMenuReturn {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (event: {
      type: "asset" | "map";
      asset?: { asset_id: string; callsign: string; weapons: string[]; faction_id: string };
      lngLat?: { lng: number; lat: number };
      x: number;
      y: number;
    }) => {
      const simAsset = event.asset ? assets[event.asset.asset_id] : undefined;
      setContextMenu({
        type: event.type,
        asset: event.asset ? { ...event.asset, sensor_type: simAsset?.sensor_type ?? null } : undefined,
        lngLat: event.lngLat,
        x: event.x,
        y: event.y,
      });
    },
    [assets],
  );

  const handleAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      setContextMenu(null);

      if (action === "details" && payload?.assetId) {
        const simAsset = assets[payload.assetId as string];
        if (simAsset) onSelectAsset(simAsset);
      }

      if (action === "move" && payload?.assetId) {
        onStartMove(payload.assetId as string);
      }

      if (action === "strike_target" && payload?.targetId) {
        onStrikeTarget(payload.targetId as string);
      }

      if (action === "move_here" && payload?.assetId && payload?.lat != null && payload?.lon != null) {
        onStartMoveHere(payload.assetId as string, payload.lon as number, payload.lat as number);
      }

      if (action === "view_camera_feed" && payload?.assetId) {
        onViewCameraFeed(payload.assetId as string);
      }
    },
    [assets, onSelectAsset, onStartMove, onStartMoveHere, onStrikeTarget, onViewCameraFeed],
  );

  const close = useCallback(() => setContextMenu(null), []);

  return { contextMenu, handleContextMenu, handleAction, close };
}
