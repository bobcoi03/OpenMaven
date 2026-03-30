"use client";

/**
 * useMapMove — encapsulates the entire move-to-destination flow.
 *
 * State machine:
 *   idle → selecting (click "Move to...") → preview (click map) → confirm/cancel
 *
 * After confirm, tracks the move in `commandedMoves` until the backend
 * reports the asset has arrived.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type { SimAsset } from "./use-simulation";

interface CommandedMove {
  lng: number;
  lat: number;
  seenMoving: boolean;
}

interface UseMapMoveOptions {
  assets: Record<string, SimAsset>;
  selectedId: string | null;
  moveAsset: (assetId: string, lat: number, lon: number) => void;
  onSelectAsset: (asset: SimAsset | null) => void;
}

interface UseMapMoveReturn {
  /** Asset ID being moved, or null when idle. */
  moveMode: string | null;
  /** Locked-in destination (after first map click). */
  moveDest: { lng: number; lat: number } | null;
  /** Dashed path line for the map (preview or in-flight). */
  movePath: { from: [number, number]; to: [number, number] } | null;
  /** Enter move mode for a given asset. */
  startMove: (assetId: string) => void;
  /** Enter move mode with a pre-set destination (right-click map → "Move here"). */
  startMoveHere: (assetId: string, lng: number, lat: number) => void;
  /** Lock in the destination (first map click). */
  setDestination: (lngLat: { lng: number; lat: number }) => void;
  /** Confirm and execute the move. */
  confirm: () => void;
  /** Cancel and exit move mode. */
  cancel: () => void;
  /** Handle a map click during move mode. */
  handleMapClick: (lngLat: { lng: number; lat: number }) => void;
  /** Handle destination marker drag. */
  handleDrag: (lngLat: { lng: number; lat: number }) => void;
}

export function useMapMove({
  assets,
  selectedId,
  moveAsset,
  onSelectAsset,
}: UseMapMoveOptions): UseMapMoveReturn {
  const [moveMode, setMoveMode] = useState<string | null>(null);
  const [moveDest, setMoveDest] = useState<{ lng: number; lat: number } | null>(null);
  const [commandedMoves, setCommandedMoves] = useState<Map<string, CommandedMove>>(new Map());

  // ── Escape key cancels ──────────────────────────────────────────────────
  useEffect(() => {
    if (!moveMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoveMode(null);
        setMoveDest(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [moveMode]);

  // ── Clean up commanded moves on arrival / destruction ──────────────────
  useEffect(() => {
    setCommandedMoves((prev) => {
      let changed = false;
      const next = new Map(prev);
      next.forEach((entry, assetId) => {
        const asset = assets[assetId];
        if (!asset || asset.status === "destroyed") {
          next.delete(assetId);
          changed = true;
        } else if (asset.status === "moving" && !entry.seenMoving) {
          next.set(assetId, { ...entry, seenMoving: true });
          changed = true;
        } else if (asset.status !== "moving" && entry.seenMoving) {
          next.delete(assetId);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [assets]);

  // ── Move path for rendering ───────────────────────────────────────────
  const movePath = useMemo(() => {
    if (moveMode && moveDest) {
      const asset = assets[moveMode];
      if (!asset) return null;
      return {
        from: [asset.position.longitude, asset.position.latitude] as [number, number],
        to: [moveDest.lng, moveDest.lat] as [number, number],
      };
    }
    // Show path for selected asset's commanded move, or fall back to any active move
    const targetId = selectedId && commandedMoves.has(selectedId)
      ? selectedId
      : commandedMoves.size > 0
        ? commandedMoves.keys().next().value!
        : null;

    if (targetId) {
      const asset = assets[targetId];
      const dest = commandedMoves.get(targetId)!;
      if (asset) {
        return {
          from: [asset.position.longitude, asset.position.latitude] as [number, number],
          to: [dest.lng, dest.lat] as [number, number],
        };
      }
    }
    return null;
  }, [moveMode, moveDest, selectedId, commandedMoves, assets]);

  // ── Actions ───────────────────────────────────────────────────────────
  const confirm = useCallback(() => {
    if (moveMode && moveDest) {
      moveAsset(moveMode, moveDest.lat, moveDest.lng);
      setCommandedMoves((prev) => new Map(prev).set(moveMode, { ...moveDest, seenMoving: false }));
      onSelectAsset(assets[moveMode] ?? null);
      setMoveMode(null);
      setMoveDest(null);
    }
  }, [moveMode, moveDest, moveAsset, onSelectAsset, assets]);

  const cancel = useCallback(() => {
    setMoveMode(null);
    setMoveDest(null);
  }, []);

  const startMove = useCallback((assetId: string) => {
    setMoveMode(assetId);
    setMoveDest(null);
  }, []);

  const startMoveHere = useCallback((assetId: string, lng: number, lat: number) => {
    setMoveMode(assetId);
    setMoveDest({ lng, lat });
  }, []);

  const setDestination = useCallback((lngLat: { lng: number; lat: number }) => {
    setMoveDest(lngLat);
  }, []);

  const handleMapClick = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (!moveMode) return;
      if (!moveDest) {
        setMoveDest(lngLat);
      } else {
        confirm();
      }
    },
    [moveMode, moveDest, confirm],
  );

  const handleDrag = useCallback(
    (lngLat: { lng: number; lat: number }) => {
      if (!moveMode) return;
      setMoveDest(lngLat);
    },
    [moveMode],
  );

  return {
    moveMode,
    moveDest,
    movePath,
    startMove,
    startMoveHere,
    setDestination,
    confirm,
    cancel,
    handleMapClick,
    handleDrag,
  };
}
