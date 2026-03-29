"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock as ClockIcon } from "lucide-react";
import { useSimulation, type DetectionTarget } from "@/lib/use-simulation";

const stageOrder = [
  "DYNAMIC",
  "PENDING_PAIRING",
  "PAIRED",
  "IN_EXECUTION",
  "COMPLETE",
] as const;

type TargetStage = (typeof stageOrder)[number];

const stageConfig: Record<TargetStage, { label: string; statusColor: string; dotColor: string }> = {
  DYNAMIC: { label: "DYNAMIC", statusColor: "border-slate-400", dotColor: "bg-slate-400" },
  PENDING_PAIRING: { label: "PENDING PAIRING", statusColor: "border-amber-500", dotColor: "bg-amber-500" },
  PAIRED: { label: "PAIRED", statusColor: "border-blue-500", dotColor: "bg-blue-500" },
  IN_EXECUTION: { label: "IN EXECUTION", statusColor: "border-violet-500", dotColor: "bg-violet-500" },
  COMPLETE: { label: "COMPLETE", statusColor: "border-emerald-500", dotColor: "bg-emerald-500" },
};

const sourceTagConfig: Record<string, { label: string; bg: string; text: string }> = {
  SIGINT: { label: "SIGNAL INTEL", bg: "bg-blue-500/20", text: "text-blue-300" },
  IMINT: { label: "IMAGE INTEL", bg: "bg-green-500/20", text: "text-green-300" },
  HUMINT: { label: "HUMAN INTEL", bg: "bg-purple-500/20", text: "text-purple-300" },
  ELINT: { label: "ELEC INTEL", bg: "bg-pink-500/20", text: "text-pink-300" },
  OSINT: { label: "OPEN SOURCE", bg: "bg-orange-500/20", text: "text-orange-300" },
};

function getSourceTag(source: string) {
  return sourceTagConfig[source] || { label: source, bg: "bg-slate-700/50", text: "text-slate-300" };
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(assetType: string) {
  const words = assetType.split(" ");
  return words.map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function DecisionsPage() {
  const router = useRouter();
  const sim = useSimulation();
  const boardState = sim.boardState ?? [];

  const targetsByStage = useMemo(
    () =>
      stageOrder.reduce((acc, stage) => {
        acc[stage] = boardState.filter((target) => target.stage === stage);
        return acc;
      }, {} as Record<TargetStage, DetectionTarget[]>),
    [boardState],
  );

  const handleClick = useCallback(
    (target: DetectionTarget) => {
      router.push(`/map?lat=${encodeURIComponent(target.detection.lat)}&lng=${encodeURIComponent(target.detection.lon)}`);
    },
    [router],
  );

  return (
    <div className="h-full flex flex-col bg-[#1c2333]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#1c2333]">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Targeting Board</h1>
          <p className="text-sm text-zinc-400 mt-1">Live detection targets from the simulation feed.</p>
        </div>
        <div className="text-sm font-mono text-zinc-500 uppercase tracking-wider">
          {boardState.length} active target{boardState.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex min-w-max gap-6">
          {stageOrder.map((stage) => {
            const targets = targetsByStage[stage];
            const config = stageConfig[stage];

            return (
              <div key={stage} className="flex flex-col w-[300px] overflow-hidden">
                {/* Column Header */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/30 bg-transparent">
                  <div className={`w-3 h-3 rounded-full border-2 ${config.statusColor}`} />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-100 uppercase tracking-widest">{config.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{targets.length} item{targets.length === 1 ? "" : "s"}</div>
                  </div>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {targets.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-sm text-slate-500">
                      No targets
                    </div>
                  ) : (
                    targets.map((target) => {
                      const sourceTag = getSourceTag(target.detection.source_label);
                      const initials = getInitials(target.detection.asset_type);

                      return (
                        <button
                          key={target.target_id}
                          type="button"
                          onClick={() => handleClick(target)}
                          className="w-full rounded-lg border border-slate-800 bg-[#262c35] p-3.5 text-left transition-all hover:border-blue-600 hover:bg-[#2a3142] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        >
                          {/* Category Label with Dot */}
                          <div className="mb-2.5 flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${sourceTag.bg}`} />
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${sourceTag.text}`}>
                              {sourceTag.label}
                            </span>
                          </div>

                          {/* Asset Type Title */}
                          <div className="mb-3 text-sm font-bold text-white">{target.detection.asset_type}</div>

                          {/* Metadata Tags */}
                          <div className="mb-3 flex flex-wrap gap-2">
                            <span className="inline-block px-2 py-1 rounded-full bg-slate-800/50 text-[10px] text-slate-300 uppercase tracking-wider">
                              {target.detection.source_label}
                            </span>
                            <span className="inline-block px-2 py-1 rounded-full bg-slate-800/50 text-[10px] text-slate-300 font-mono">
                              {target.detection.grid_ref}
                            </span>
                          </div>

                          {/* Confidence */}
                          <div className="mb-3 text-[10px] text-slate-400">
                            <span className="text-slate-300 font-semibold">{Math.round(target.detection.confidence)}%</span> confidence
                          </div>

                          {/* Footer: Avatar + Timestamp */}
                          <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/50">
                            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 text-[9px] font-bold text-white">
                              {initials}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] text-slate-500">
                              <ClockIcon size={11} />
                              <span>{formatTimestamp(target.detection.timestamp)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
