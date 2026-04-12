"use client";

import { useMemo } from "react";
import type {
  SimAsset,
  SimFaction,
  MissionUpdate,
  StrikeLogEntry,
} from "@/lib/use-simulation";

// ── Output types ──────────────────────────────────────────────────────────────

export interface FactionStats {
  factionId: string;
  name: string;
  side: string;
  totalAssets: number;
  aliveAssets: number;
  destroyedAssets: number;
  /** Mean health of alive assets, 0–100. 0 when no alive assets. */
  avgHealthPct: number;
  /** 0–1 from SimFaction.morale */
  morale: number;
  /** 0–1 from SimFaction.capability */
  capability: number;
  /** (morale + capability) / 2 */
  readiness: number;
}

export interface MissionSummary {
  active: number;
  complete: number;
  aborted: number;
}

export interface OverviewStats {
  /** Always ordered: BLUFOR first, REDFOR second, others after. */
  factions: FactionStats[];
  /** REDFOR destroyed / BLUFOR destroyed. null when BLUFOR destroyed === 0. */
  kdRatio: number | null;
  missionSummary: MissionSummary;
  /** strikeLog.slice(0, 50) — newest first (ordering comes from use-simulation). */
  recentEvents: StrikeLogEntry[];
  tick: number;
}

// ── Input type ────────────────────────────────────────────────────────────────

interface UseOverviewStatsInput {
  assets: Record<string, SimAsset>;
  factions: Record<string, SimFaction>;
  activeMissions: Record<string, MissionUpdate>;
  strikeLog: StrikeLogEntry[];
  tick: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useOverviewStats(input: UseOverviewStatsInput): OverviewStats {
  const { assets, factions, activeMissions, strikeLog, tick } = input;

  return useMemo(() => {
    const assetList = Object.values(assets);
    const factionList = Object.values(factions);

    // ── Per-faction stats ────────────────────────────────────────────────────
    const factionStats: FactionStats[] = factionList.map((faction) => {
      const factionAssets = assetList.filter(
        (a) => a.faction_id === faction.faction_id,
      );
      const alive = factionAssets.filter((a) => a.status !== "destroyed");
      const destroyed = factionAssets.filter((a) => a.status === "destroyed");
      const avgHealthPct =
        alive.length > 0
          ? Math.round(
              (alive.reduce((sum, a) => sum + a.health, 0) / alive.length) *
                100,
            )
          : 0;
      const readiness = (faction.morale + faction.capability) / 2;

      return {
        factionId: faction.faction_id,
        name: faction.name,
        side: faction.side,
        totalAssets: factionAssets.length,
        aliveAssets: alive.length,
        destroyedAssets: destroyed.length,
        avgHealthPct,
        morale: faction.morale,
        capability: faction.capability,
        readiness,
      };
    });

    // BLUFOR first, REDFOR second, others after
    const sideOrder = (s: string): number =>
      s === "BLUFOR" ? 0 : s === "REDFOR" ? 1 : 2;
    factionStats.sort((a, b) => sideOrder(a.side) - sideOrder(b.side));

    // ── K/D ratio ────────────────────────────────────────────────────────────
    const blufor = factionStats.find((f) => f.side === "BLUFOR");
    const redfor = factionStats.find((f) => f.side === "REDFOR");
    const kdRatio =
      !blufor || !redfor || blufor.destroyedAssets === 0
        ? null
        : +(redfor.destroyedAssets / blufor.destroyedAssets).toFixed(1);

    // ── Mission summary ───────────────────────────────────────────────────────
    const missionSummary: MissionSummary = {
      active: Object.keys(activeMissions).length,
      complete: strikeLog.filter((e) => e.status === "complete").length,
      aborted: strikeLog.filter((e) => e.status === "aborted").length,
    };

    return {
      factions: factionStats,
      kdRatio,
      missionSummary,
      recentEvents: strikeLog.slice(0, 50),
      tick,
    };
  }, [assets, factions, activeMissions, strikeLog, tick]);
}
