"use client";

import { useMemo } from "react";
import type { SigintIntercept } from "@/lib/use-simulation";
import type { SimAsset } from "@/lib/use-simulation";

interface UseSigintStatsOptions {
  sigintIntercepts: SigintIntercept[];
  /**
   * Full asset map — reserved for future use (e.g. EW asset enrichment).
   * Not used in current derived stats.
   */
  assets: Record<string, SimAsset>;
  tick: number;
}

export interface SigintStats {
  /** Total intercepts in buffer (max 50). */
  totalIntercepts: number;
  /** Number of HIGH threat-level intercepts in buffer. */
  highConfCount: number;
  /** Number of distinct EW assets that intercepted in the last 10 ticks. */
  activeEwAssets: number;
  /** Last 20 intercepts, newest first. */
  recentIntercepts: SigintIntercept[];
}

export function useSigintStats({
  sigintIntercepts,
  tick,
}: UseSigintStatsOptions): SigintStats {
  return useMemo(() => {
    const totalIntercepts = sigintIntercepts.length;

    const highConfCount = sigintIntercepts.filter(
      (i) => i.threat_level === "HIGH",
    ).length;

    const recentWindow = sigintIntercepts.filter(
      (i) => i.tick >= tick - 10,
    );
    const activeEwAssets = new Set(recentWindow.map((i) => i.intercepted_by_id))
      .size;

    // sigintIntercepts is maintained newest-first (prepended in use-simulation diff handler)
    const recentIntercepts = sigintIntercepts.slice(0, 20);

    return { totalIntercepts, highConfCount, activeEwAssets, recentIntercepts };
  }, [sigintIntercepts, tick]);
}
