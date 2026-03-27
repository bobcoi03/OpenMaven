"use client";

import { useState, useEffect } from "react";
import { fetchObject, fetchObjectLinks } from "@/lib/api-client";
import type { ObjectInstance, LinkedObject } from "@/lib/api-types";
import {
  X,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
  Network,
  Loader2,
} from "lucide-react";

interface EntityDetailPanelProps {
  rid: string;
  onClose: () => void;
  onNavigate?: (rid: string) => void;
  onExpandInGraph?: (rid: string) => void;
}

export function EntityDetailPanel({
  rid,
  onClose,
  onNavigate,
  onExpandInGraph,
}: EntityDetailPanelProps) {
  const [object, setObject] = useState<ObjectInstance | null>(null);
  const [links, setLinks] = useState<LinkedObject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([fetchObject(rid), fetchObjectLinks(rid)])
      .then(([obj, linkedObjects]) => {
        if (cancelled) return;
        setObject(obj);
        setLinks(linkedObjects);
      })
      .catch(() => {
        if (cancelled) return;
        setObject(null);
        setLinks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [rid]);

  if (loading) {
    return (
      <div className="w-[340px] bg-[#141417] border-l border-zinc-800/80 flex items-center justify-center shrink-0">
        <Loader2 size={16} className="animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!object) {
    return (
      <div className="w-[340px] bg-[#141417] border-l border-zinc-800/80 flex items-center justify-center shrink-0">
        <p className="text-[11px] text-zinc-500">Entity not found</p>
      </div>
    );
  }

  const linksByType = groupLinksByType(links);
  const title = getTitle(object);

  return (
    <div className="w-[340px] bg-[#141417] border-l border-zinc-800/80 flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/60 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TypeBadge type={object.type} />
          </div>
          <h3 className="text-[13px] font-semibold text-zinc-100 truncate">
            {title}
          </h3>
          <p className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate">
            {object.rid}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Properties */}
        <div className="px-4 py-3 border-b border-zinc-800/40">
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.1em] mb-2">
            Properties
          </h4>
          <div className="space-y-1.5">
            {Object.entries(object.properties).map(([key, value]) => (
              <PropertyRow key={key} label={key} value={value} />
            ))}
          </div>
        </div>

        {/* Relationships */}
        {linksByType.length > 0 && (
          <div className="px-4 py-3">
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.1em] mb-2">
              Relationships
            </h4>
            <div className="space-y-3">
              {linksByType.map(({ linkType, items }) => (
                <div key={linkType}>
                  <p className="text-[10px] text-zinc-400 font-medium mb-1">
                    {linkType.replace(/_/g, " ")}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <button
                        key={item.object.rid}
                        onClick={() => onNavigate?.(item.object.rid)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-800/40 transition-colors text-left cursor-pointer group"
                      >
                        {item.direction === "outgoing" ? (
                          <ArrowRight size={10} className="text-zinc-600 shrink-0" />
                        ) : (
                          <ArrowLeft size={10} className="text-zinc-600 shrink-0" />
                        )}
                        <TypeBadge type={item.object.type} small />
                        <span className="text-[11px] text-zinc-300 truncate group-hover:text-zinc-100">
                          {getTitle(item.object)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {onExpandInGraph && (
        <div className="px-4 py-2.5 border-t border-zinc-800/60 flex gap-2">
          <button
            onClick={() => onExpandInGraph(rid)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <Network size={11} />
            Expand in graph
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  company: "#06b6d4",
  founder: "#a78bfa",
  industry: "#f59e0b",
  batch: "#10b981",
  location: "#f87171",
};

function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const color = TYPE_COLORS[type.toLowerCase()] ?? "#a1a1aa";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-medium ${
        small
          ? "px-1 py-0.5 text-[9px]"
          : "px-1.5 py-0.5 text-[10px]"
      }`}
      style={{ background: `${color}20`, color }}
    >
      {type}
    </span>
  );
}

function PropertyRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-zinc-500 w-[90px] shrink-0 truncate">
        {label.replace(/_/g, " ")}
      </span>
      <span className="text-[11px] text-zinc-300 truncate flex-1 min-w-0">
        <PropertyValue value={value} />
      </span>
    </div>
  );
}

function PropertyValue({ value }: { value: unknown }) {
  if (value == null) return <span className="text-zinc-600">-</span>;

  if (typeof value === "boolean") {
    return (
      <span
        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
          value
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-zinc-800/60 text-zinc-400"
        }`}
      >
        {value ? "true" : "false"}
      </span>
    );
  }

  if (typeof value === "number") {
    return (
      <span className="font-mono">{value.toLocaleString()}</span>
    );
  }

  const str = String(value);

  // URL detection
  if (/^https?:\/\//.test(str)) {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
      >
        <span className="truncate">{str.replace(/^https?:\/\//, "")}</span>
        <ExternalLink size={9} className="shrink-0" />
      </a>
    );
  }

  return <span title={str.length > 30 ? str : undefined}>{str}</span>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getTitle(obj: ObjectInstance): string {
  const p = obj.properties;
  return (p.name ?? p.title ?? p.label ?? obj.rid) as string;
}

function groupLinksByType(
  links: LinkedObject[],
): Array<{ linkType: string; items: LinkedObject[] }> {
  const map = new Map<string, LinkedObject[]>();
  for (const link of links) {
    const existing = map.get(link.link_type) ?? [];
    existing.push(link);
    map.set(link.link_type, existing);
  }
  return Array.from(map.entries()).map(([linkType, items]) => ({
    linkType,
    items,
  }));
}
