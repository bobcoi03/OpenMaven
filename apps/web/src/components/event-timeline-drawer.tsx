"use client";

/**
 * event-timeline-drawer.tsx
 *
 * Collapsible bottom drawer showing chronological sim events.
 * Always-visible handle bar; expands to 200px on click.
 */

import { useState, useMemo } from "react";
import type { StrikeLogEntry } from "@/lib/use-simulation";

type EventKind = "destroyed" | "hit" | "miss" | "launched" | "aborted" | "counterattack";

interface TimelineEvent {
  id: string;
  tick: number;
  kind: EventKind;
  label: string;
  assetId?: string;
}

function kindColor(kind: EventKind): string {
  if (kind === "destroyed") return "var(--om-red-light)";
  if (kind === "hit") return "var(--om-orange-light)";
  if (kind === "launched") return "var(--om-blue-light)";
  if (kind === "counterattack") return "var(--om-orange-light)";
  return "var(--om-text-muted)";
}

function kindIcon(kind: EventKind): string {
  if (kind === "destroyed") return "💥";
  if (kind === "hit") return "⚠";
  if (kind === "launched") return "→";
  if (kind === "counterattack") return "⚡";
  if (kind === "aborted") return "✕";
  return "·";
}

interface EventTimelineDrawerProps {
  strikeLog: StrikeLogEntry[];
  currentTick: number;
  onFocusAsset?: (assetId: string) => void;
}

export function EventTimelineDrawer({ strikeLog, currentTick: _currentTick, onFocusAsset }: EventTimelineDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  const events = useMemo((): TimelineEvent[] => {
    return [...strikeLog]
      .sort((a, b) => b.tick - a.tick)
      .slice(0, 50)
      .map((entry) => {
        const outcome = entry.result?.outcome ?? entry.status;
        let kind: EventKind = "launched";
        let label = `${entry.shooter_callsign} → ${entry.target_callsign}`;

        if (entry.status === "counterattack") {
          kind = "counterattack";
          const outcomeTag = outcome === "destroyed" ? "DESTROYED" : outcome === "damaged" ? "HIT" : outcome === "missed" ? "MISSED" : "ENGAGED";
          label = `COUNTER-FIRE ${entry.shooter_callsign} → ${entry.target_callsign} [${outcomeTag}]`;
        } else if (outcome === "destroyed") { kind = "destroyed"; label = `${entry.target_callsign} DESTROYED by ${entry.shooter_callsign}`; }
        else if (outcome === "damaged") { kind = "hit"; label = `${entry.target_callsign} HIT by ${entry.shooter_callsign}`; }
        else if (outcome === "missed") { kind = "miss"; label = `${entry.shooter_callsign} MISSED ${entry.target_callsign}`; }
        else if (entry.status === "aborted") { kind = "aborted"; label = `Mission aborted — ${entry.target_callsign}`; }

        return {
          id: entry.mission_id,
          tick: entry.tick,
          kind,
          label,
          assetId: entry.target_id,
        };
      });
  }, [strikeLog]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30"
      style={{ pointerEvents: "none" }}
    >
      {/* Handle bar */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between px-3 cursor-pointer"
        style={{
          pointerEvents: "all",
          height: 24,
          background: "rgba(13,17,23,0.88)",
          borderTop: "1px solid var(--om-border)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[var(--om-text-muted)]">
          Event Timeline
        </span>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[var(--om-blue)]/15 border border-[var(--om-blue)]/25 text-[var(--om-blue-light)]">
              {events.length}
            </span>
          )}
          <span className="text-[8px] text-[var(--om-text-muted)]">{expanded ? "▼" : "▲"}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          style={{
            pointerEvents: "all",
            maxHeight: 200,
            overflowY: "auto",
            background: "rgba(13,17,23,0.95)",
            borderTop: "1px solid var(--om-border)",
          }}
        >
          {events.length === 0 ? (
            <div className="px-3 py-4 text-[9px] text-[var(--om-text-muted)] text-center">No events yet</div>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                onClick={() => ev.assetId && onFocusAsset?.(ev.assetId)}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--om-border)] last:border-b-0 hover:bg-[var(--om-bg-hover)]/30 transition-colors"
                style={{ cursor: ev.assetId ? "pointer" : "default" }}
              >
                <span style={{ fontSize: 10, color: kindColor(ev.kind), minWidth: 14 }}>
                  {kindIcon(ev.kind)}
                </span>
                <span className="text-[10px] text-[var(--om-text-secondary)] flex-1 truncate">{ev.label}</span>
                <span className="text-[8px] text-[var(--om-text-muted)] shrink-0 tabular-nums">t·{ev.tick.toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
