"use client";

import { Pause, Play, Zap, SkipForward, Wifi, WifiOff } from "lucide-react";

interface SimulationControlsProps {
  connected: boolean;
  tick: number;
  speed: number;
  onSetSpeed: (speed: number) => void;
  assetCount: number;
  pendingEvents: number;
}

const SPEED_OPTIONS = [
  { value: 0, label: "PAUSE", icon: Pause },
  { value: 1, label: "1×", icon: Play },
  { value: 2, label: "2×", icon: Zap },
  { value: 5, label: "5×", icon: Zap },
  { value: 10, label: "10×", icon: SkipForward },
] as const;

export function SimulationControls({
  connected,
  tick,
  speed,
  onSetSpeed,
  assetCount,
  pendingEvents,
}: SimulationControlsProps) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-1.5"
      style={{
        background: "rgba(30,34,41,0.9)",
        borderBottom: "1px solid var(--om-border)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        {connected ? (
          <Wifi size={10} className="text-[var(--om-green-light)]" />
        ) : (
          <WifiOff size={10} className="text-[var(--om-red-light)]" />
        )}
        <span className={`text-[9px] font-semibold ${connected ? "text-[var(--om-green-light)]" : "text-[var(--om-red-light)]"}`}>
          {connected ? "LIVE" : "OFFLINE"}
        </span>
      </div>

      <div className="w-px h-4 bg-[var(--om-border-strong)]" />

      {/* Speed controls */}
      <div className="flex items-center gap-0.5">
        {SPEED_OPTIONS.map(({ value, label }) => {
          const active = speed === value;
          return (
            <button
              key={value}
              onClick={() => onSetSpeed(value)}
              className={`px-2 py-0.5 text-[9px] font-bold tracking-wider rounded-sm transition-colors cursor-pointer ${
                active
                  ? "bg-[var(--om-blue)]/15 text-[var(--om-text-primary)]"
                  : "text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-[var(--om-border-strong)]" />

      {/* Tick counter */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.1em]">Tick</span>
        <span className="text-[11px] text-[var(--om-text-primary)] font-mono font-bold tabular-nums">
          {tick.toLocaleString().padStart(6, "\u2007")}
        </span>
      </div>

      <div className="w-px h-4 bg-[var(--om-border-strong)]" />

      {/* Asset count */}
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.1em]">Assets</span>
        <span className="text-[10px] text-[var(--om-text-primary)] font-mono">{assetCount}</span>
      </div>

      {/* Pending events */}
      {pendingEvents > 0 && (
        <>
          <div className="w-px h-4 bg-[var(--om-border-strong)]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.1em]">Queued</span>
            <span className="text-[10px] text-[var(--om-orange-light)] font-mono">{pendingEvents}</span>
          </div>
        </>
      )}
    </div>
  );
}
