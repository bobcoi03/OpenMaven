"use client";

import { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ObjectInstance } from "@/lib/api-types";
import { ChevronUp, ChevronDown } from "lucide-react";

interface TableViewProps {
  objects: ObjectInstance[];
  onRowClick?: (rid: string) => void;
  selectedId?: string | null;
}

type SortDir = "asc" | "desc";

const ROW_HEIGHT = 32;
const COL_WIDTH = 140;
const TYPE_COL_WIDTH = 90;

export function TableView({ objects, onRowClick, selectedId }: TableViewProps) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const scrollRef = useRef<HTMLDivElement>(null);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const obj of objects) {
      counts.set(obj.type, (counts.get(obj.type) || 0) + 1);
    }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
  }, [objects]);

  const filtered = useMemo(
    () => (typeFilter ? objects.filter((o) => o.type === typeFilter) : objects),
    [objects, typeFilter],
  );

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const obj of filtered) {
      for (const key of Object.keys(obj.properties)) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }, [filtered]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = sortCol === "__type" ? a.type : a.properties[sortCol];
      const bv = sortCol === "__type" ? b.type : b.properties[sortCol];
      const result = compareValues(av, bv);
      return sortDir === "asc" ? result : -result;
    });
  }, [filtered, sortCol, sortDir]);

  const rowVirtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const totalWidth = TYPE_COL_WIDTH + columns.length * COL_WIDTH;

  return (
    <div className="h-full flex flex-col bg-[var(--om-bg-deep)] min-w-0 overflow-hidden">
      {/* Type filter bar */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--om-border)] bg-[var(--om-bg-elevated)] overflow-x-auto shrink-0">
        <button
          onClick={() => setTypeFilter(null)}
          className={`shrink-0 px-2.5 py-1 rounded-sm text-[10px] font-medium transition-colors cursor-pointer ${
            typeFilter === null
              ? "bg-white/10 text-[var(--om-text-primary)]"
              : "text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)]"
          }`}
        >
          All ({objects.length})
        </button>
        {typeCounts.map(([type, count]) => (
          <button
            key={type}
            onClick={() => setTypeFilter(typeFilter === type ? null : type)}
            className={`shrink-0 px-2.5 py-1 rounded-sm text-[10px] font-medium transition-colors cursor-pointer ${
              typeFilter === type
                ? "bg-white/10 text-[var(--om-text-primary)]"
                : "text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-bg-hover)]"
            }`}
          >
            {type} ({count})
          </button>
        ))}
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-[var(--om-border)] bg-[var(--om-bg-primary)] shrink-0">
        <span className="text-[10px] text-[var(--om-text-muted)] font-[family-name:var(--font-mono)]">
          {filtered.length} of {objects.length} objects
        </span>
      </div>

      {/* Virtualized scrollable area — both axes */}
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-[var(--om-text-muted)]">
            No objects to display
          </div>
        ) : (
          <div style={{ minWidth: totalWidth }}>
            {/* Sticky header */}
            <div
              className="sticky top-0 z-10 flex bg-[var(--om-bg-primary)] border-b border-[var(--om-border)]"
              style={{ minWidth: totalWidth }}
            >
              <HeaderCell
                label="Type"
                colKey="__type"
                width={TYPE_COL_WIDTH}
                sortCol={sortCol}
                sortDir={sortDir}
                onClick={handleSort}
              />
              {columns.map((col) => (
                <HeaderCell
                  key={col}
                  label={col.replace(/_/g, " ")}
                  colKey={col}
                  width={COL_WIDTH}
                  sortCol={sortCol}
                  sortDir={sortDir}
                  onClick={handleSort}
                />
              ))}
            </div>

            {/* Virtual rows */}
            <div
              style={{
                height: rowVirtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const obj = sorted[virtualRow.index];
                const isSelected = selectedId === obj.rid;
                return (
                  <div
                    key={obj.rid}
                    onClick={() => onRowClick?.(obj.rid)}
                    className={`absolute left-0 right-0 flex items-center border-b border-[var(--om-border)] cursor-pointer ${
                      isSelected
                        ? "bg-[var(--om-blue)]/10"
                        : "hover:bg-[var(--om-bg-hover)]"
                    }`}
                    style={{
                      height: ROW_HEIGHT,
                      top: virtualRow.start,
                      minWidth: totalWidth,
                    }}
                  >
                    {/* Type cell */}
                    <div
                      className="shrink-0 px-3 flex items-center"
                      style={{ width: TYPE_COL_WIDTH }}
                    >
                      <span className="inline-block px-1.5 py-0.5 rounded-sm bg-[var(--om-bg-elevated)] text-[10px] text-[var(--om-text-secondary)] font-medium truncate">
                        {obj.type}
                      </span>
                    </div>
                    {/* Property cells */}
                    {columns.map((col) => (
                      <div
                        key={col}
                        className="shrink-0 px-3 flex items-center overflow-hidden"
                        style={{ width: COL_WIDTH }}
                      >
                        <CellValue value={obj.properties[col]} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function HeaderCell({
  label,
  colKey,
  width,
  sortCol,
  sortDir,
  onClick,
}: {
  label: string;
  colKey: string;
  width: number;
  sortCol: string | null;
  sortDir: SortDir;
  onClick: (col: string) => void;
}) {
  const active = sortCol === colKey;
  return (
    <div
      onClick={() => onClick(colKey)}
      className="shrink-0 flex items-center gap-1 px-3 py-2 text-[10px] text-[var(--om-text-muted)] font-semibold uppercase tracking-[0.08em] cursor-pointer hover:text-[var(--om-text-secondary)] select-none"
      style={{ width }}
    >
      <span className="truncate">{label}</span>
      {active && (sortDir === "asc" ? <ChevronUp size={10} className="shrink-0" /> : <ChevronDown size={10} className="shrink-0" />)}
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value == null) {
    return <span className="text-[var(--om-text-muted)] text-[11px]">-</span>;
  }
  if (typeof value === "boolean") {
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-medium ${
        value ? "bg-emerald-500/10 text-emerald-400" : "bg-[var(--om-bg-elevated)] text-[var(--om-text-secondary)]"
      }`}>
        {value ? "true" : "false"}
      </span>
    );
  }
  if (typeof value === "number") {
    return (
      <span className="font-[family-name:var(--font-mono)] text-[var(--om-text-secondary)] text-[11px] truncate">
        {value.toLocaleString()}
      </span>
    );
  }
  const str = String(value);
  return (
    <span className="text-[var(--om-text-secondary)] text-[11px] truncate" title={str.length > 20 ? str : undefined}>
      {str}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
