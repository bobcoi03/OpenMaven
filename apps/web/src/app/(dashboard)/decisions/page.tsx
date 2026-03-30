"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Plus, Search, Filter, ArrowUpDown,
  Layers, ChevronLeft, ChevronRight, LayoutGrid, List,
  ChevronDown, Bell, Flag, Check, X, MapPin,
} from "lucide-react";
import { useSimulation, type DetectionTarget } from "@/lib/use-simulation";

// ── Design tokens (from /design route T object) ───────────────────────────────
const T = {
  bgDeep:        "#1E2229",
  bgPrimary:     "#252A31",
  bgElevated:    "#2D323A",
  bgSurface:     "#353B44",
  bgHover:       "#3D434C",
  border:        "rgba(255,255,255,0.08)",
  borderStrong:  "rgba(255,255,255,0.14)",
  textPrimary:   "#E2E8F0",
  textSecondary: "#94A3B8",
  textMuted:     "#64748B",
  textDisabled:  "#475569",
  blue:          "#2D72D2",
  blueLt:        "#4C90F0",
  green:         "#238551",
  greenLt:       "#32A467",
  orange:        "#C87619",
  orangeLt:      "#EC9A3C",
  red:           "#CD4246",
  redLt:         "#E76A6E",
  gold:          "#D1980B",
  turquoise:     "#00A396",
  violet:        "#9D3F9D",
  hostile:       "#FF3031",
} as const;

// ── Stage pipeline ────────────────────────────────────────────────────────────
const STAGE_ORDER = [
  "DELIBERATE", "DYNAMIC", "PENDING_PAIRING", "PAIRED",
  "IN_EXECUTION", "PENDING_BDA", "COMPLETE",
] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STAGE_CFG: Record<Stage, { label: string; color: string; cardBg: string }> = {
  DELIBERATE:      { label: "DELIBERATE",      color: T.orangeLt,  cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#271d10 100%)` },
  DYNAMIC:         { label: "DYNAMIC",         color: T.orangeLt,  cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#1f1535 100%)` },
  PENDING_PAIRING: { label: "PENDING PAIRING", color: T.turquoise, cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#0e2420 100%)` },
  PAIRED:          { label: "PAIRED",          color: T.violet,    cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#211035 100%)` },
  IN_EXECUTION:    { label: "IN EXECUTION",    color: T.orangeLt,  cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#121f3a 100%)` },
  PENDING_BDA:     { label: "PENDING BDA",     color: T.redLt,     cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#2a1015 100%)` },
  COMPLETE:        { label: "COMPLETE",        color: T.blueLt,    cardBg: `linear-gradient(170deg,${T.bgPrimary} 0%,#101c38 100%)` },
};

// ── Intel source config ───────────────────────────────────────────────────────
const SOURCES = ["SIGINT", "IMINT", "HUMINT", "ELINT", "OSINT"] as const;
const SOURCE_COLOR: Record<string, string> = {
  SIGINT: T.violet, IMINT: T.blueLt, HUMINT: T.orangeLt, ELINT: T.redLt, OSINT: T.turquoise,
};
const SOURCE_BG: Record<string, string> = {
  SIGINT: `linear-gradient(170deg,${T.bgPrimary} 0%,#211035 100%)`,
  IMINT:  `linear-gradient(170deg,${T.bgPrimary} 0%,#121f3a 100%)`,
  HUMINT: `linear-gradient(170deg,${T.bgPrimary} 0%,#271d10 100%)`,
  ELINT:  `linear-gradient(170deg,${T.bgPrimary} 0%,#2a1015 100%)`,
  OSINT:  `linear-gradient(170deg,${T.bgPrimary} 0%,#0e2420 100%)`,
};

// ── Toolbar option types ──────────────────────────────────────────────────────
type FilterConf  = "all" | "high" | "medium" | "low";
type SortBy      = "time" | "confidence" | "name";
type GroupByMode = "stage" | "source" | "classification";
type ViewDensity = "comfortable" | "compact";
type ViewMode    = "board" | "list";

type DropdownName = "filter" | "sort" | "group" | "hierarchy" | "notif" | "view";

const FILTER_OPTIONS: { value: FilterConf; label: string; desc: string }[] = [
  { value: "all",    label: "All",    desc: "Show every target"    },
  { value: "high",   label: "High",   desc: "Confidence ≥ 85%"    },
  { value: "medium", label: "Medium", desc: "Confidence 60 – 84%" },
  { value: "low",    label: "Low",    desc: "Confidence < 60%"     },
];
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "time",       label: "Last edited"  },
  { value: "confidence", label: "Confidence ↓" },
  { value: "name",       label: "Name A – Z"   },
];
const GROUP_OPTIONS: { value: GroupByMode; label: string; desc: string }[] = [
  { value: "stage",          label: "Stage",          desc: "Default pipeline view" },
  { value: "source",         label: "Intel Source",   desc: "SIGINT, IMINT, HUMINT…" },
  { value: "classification", label: "Classification", desc: "UNCLASSIFIED, SECRET…"  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function deriveTrackId(targetId: string): string {
  const clean   = targetId.replace(/-/g, "").toUpperCase();
  const letters = clean.replace(/[^A-Z]/g, "").slice(0, 2).padEnd(2, "X");
  const digits  = clean.replace(/[^0-9]/g, "").slice(0, 4).padStart(4, "0");
  return letters + digits;
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24)    return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function isExpired(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 10 * 60_000;
}
function shortGrid(grid: string): string {
  // MGRS like "37SEV0023271933" → "37S EV 002 193"
  const m = grid.match(/^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/);
  if (!m) return grid.slice(0, 12);
  const digits = m[3];
  const half = Math.floor(digits.length / 2);
  return `${m[1]} ${m[2]} ${digits.slice(0, Math.min(half, 3))} ${digits.slice(half, half + Math.min(half, 3))}`;
}
function applyConfFilter(t: DetectionTarget, f: FilterConf): boolean {
  const c = t.detection.confidence;
  if (f === "high")   return c >= 85;
  if (f === "medium") return c >= 60 && c < 85;
  if (f === "low")    return c < 60;
  return true;
}
function applySort(targets: DetectionTarget[], s: SortBy): DetectionTarget[] {
  return [...targets].sort((a, b) => {
    if (s === "confidence") return b.detection.confidence - a.detection.confidence;
    if (s === "name")       return a.detection.asset_type.localeCompare(b.detection.asset_type);
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}
function createMockTarget(form: {
  asset_type: string; classification: string; stage: Stage; source: string;
}): DetectionTarget {
  const now = new Date().toISOString();
  const id  = crypto.randomUUID();
  const n   = Math.floor(Math.random() * 9_999_999).toString().padStart(7, "0");
  return {
    target_id:  id,
    stage:      form.stage,
    created_at: now,
    updated_at: now,
    detection: {
      detection_id:   crypto.randomUUID(),
      timestamp:      now,
      asset_id:       crypto.randomUUID(),
      asset_type:     form.asset_type.trim() || "Unknown Target",
      confidence:     70 + Math.floor(Math.random() * 30),
      grid_ref:       `37SEV${n}`,
      lat:            33 + Math.random() * 4,
      lon:            40 + Math.random() * 8,
      source_label:   form.source,
      classification: form.classification,
    },
  };
}

// ── Shared dropdown panel ─────────────────────────────────────────────────────
function DropPanel({ open, children, right = false }: { open: boolean; children: React.ReactNode; right?: boolean }) {
  if (!open) return null;
  return (
    <div style={{
      position: "absolute",
      top: "calc(100% + 4px)",
      ...(right ? { right: 0 } : { left: 0 }),
      zIndex: 60,
      background: T.bgElevated,
      border: `1px solid ${T.borderStrong}`,
      borderRadius: 3,
      minWidth: 210,
      boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
      padding: "4px 0",
    }}>
      {children}
    </div>
  );
}
function DropLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, color: T.textMuted, padding: "5px 10px 2px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
      {children}
    </div>
  );
}
function DropRow({ selected, onClick, children }: { selected?: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      style={{ fontSize: 11, color: selected ? T.textPrimary : T.textSecondary, background: selected || hov ? T.bgHover : "transparent" }}
    >
      <Check size={11} style={{ color: selected ? T.blueLt : "transparent", flexShrink: 0 }} />
      {children}
    </button>
  );
}
function DropCheckRow({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      style={{ fontSize: 11, color: T.textSecondary, background: hov ? T.bgHover : "transparent" }}
    >
      <div style={{
        width: 12, height: 12, borderRadius: 2, flexShrink: 0,
        border: `1.5px solid ${checked ? T.blue : T.textDisabled}`,
        background: checked ? T.blue : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {checked && <Check size={8} color="#fff" />}
      </div>
      {children}
    </button>
  );
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function TBtn({
  active = false, onClick, children, title,
}: { active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center gap-1 px-2 py-1 rounded-sm"
      style={{
        fontSize: 11,
        color:      active ? T.blueLt : T.textSecondary,
        border:     `1px solid ${active ? T.blue + "80" : hov ? T.borderStrong : T.border}`,
        background: active ? `${T.blue}18` : hov ? T.bgHover : "transparent",
        transition: "background 0.1s, border-color 0.1s",
      }}
    >
      {children}
    </button>
  );
}

// ── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: T.bgElevated,
      border: `1px solid ${T.border}`,
      borderRadius: 3,
      padding: "8px 10px 6px",
    }}>
      {/* Row 1: name + badge */}
      <div className="flex items-center gap-2 mb-2">
        <div className="skeleton-pulse" style={{ width: 7, height: 7, borderRadius: 1, background: T.bgHover }} />
        <div className="skeleton-pulse" style={{ flex: 1, height: 12, borderRadius: 2, background: T.bgHover }} />
        <div className="skeleton-pulse" style={{ width: 32, height: 16, borderRadius: 2, background: T.bgHover }} />
      </div>
      {/* Row 2: track + grid */}
      <div className="flex items-center gap-2 mb-2" style={{ paddingLeft: 15 }}>
        <div className="skeleton-pulse" style={{ width: 42, height: 9, borderRadius: 2, background: T.bgHover }} />
        <div className="skeleton-pulse" style={{ width: 72, height: 9, borderRadius: 2, background: T.bgHover }} />
      </div>
      {/* Row 3: tags */}
      <div className="flex items-center gap-1.5 mb-2" style={{ paddingLeft: 15 }}>
        <div className="skeleton-pulse" style={{ width: 38, height: 15, borderRadius: 2, background: T.bgHover }} />
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between" style={{ paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
        <div className="skeleton-pulse" style={{ width: 48, height: 9, borderRadius: 2, background: T.bgHover }} />
        <div className="skeleton-pulse" style={{ width: 9, height: 9, borderRadius: 2, background: T.bgHover }} />
      </div>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.15; }
        }
        .skeleton-pulse {
          animation: skeleton-pulse 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DecisionsPage() {
  const router = useRouter();
  const sim    = useSimulation();
  const board  = sim.boardState ?? [];
  const [loading, setLoading] = useState(true);

  // Clear loading once we actually receive targets on the board
  useEffect(() => {
    if (board.length > 0) setLoading(false);
  }, [board]);

  // Local targets added via + Add form
  const [localTargets, setLocalTargets] = useState<DetectionTarget[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    asset_type: "", classification: "UNCLASSIFIED",
    stage: "DYNAMIC" as Stage, source: "SIGINT",
  });

  // Toolbar state
  const [searchQuery,     setSearchQuery]     = useState("");
  const [filterConf,      setFilterConf]      = useState<FilterConf>("all");
  const [sortBy,          setSortBy]          = useState<SortBy>("time");
  const [groupBy,         setGroupBy]         = useState<GroupByMode>("stage");
  const [viewMode,        setViewMode]        = useState<ViewMode>("board");
  const [viewDensity,     setViewDensity]     = useState<ViewDensity>("comfortable");
  const [visibleStages,   setVisibleStages]   = useState<Set<Stage>>(new Set(STAGE_ORDER));
  const [flaggedIds,      setFlaggedIds]      = useState<Set<string>>(new Set());
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [dragOverColumn,  setDragOverColumn]  = useState<string | null>(null);

  // Which dropdown is open (only one at a time)
  const [openDrop, setOpenDrop] = useState<DropdownName | null>(null);
  function toggleDrop(name: DropdownName) {
    setOpenDrop(o => o === name ? null : name);
  }

  // Refs for outside-click
  const dropRefs = {
    filter:    useRef<HTMLDivElement>(null),
    sort:      useRef<HTMLDivElement>(null),
    group:     useRef<HTMLDivElement>(null),
    hierarchy: useRef<HTMLDivElement>(null),
    notif:     useRef<HTMLDivElement>(null),
    view:      useRef<HTMLDivElement>(null),
  };
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      const inside = Object.values(dropRefs).some(r => r.current?.contains(t));
      if (!inside) setOpenDrop(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flash tracking
  const prevUpdated = useRef<Map<string, string>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  useEffect(() => {
    const all     = [...board, ...localTargets];
    const nextMap = new Map<string, string>();
    const toFlash = new Set<string>();
    for (const t of all) {
      const prev = prevUpdated.current.get(t.target_id);
      if (prev && prev !== t.updated_at) toFlash.add(t.target_id);
      nextMap.set(t.target_id, t.updated_at);
    }
    prevUpdated.current = nextMap;
    if (toFlash.size > 0) {
      setFlashing(s => new Set([...s, ...toFlash]));
      const tid = setTimeout(() => {
        setFlashing(s => { const n = new Set(s); toFlash.forEach(id => n.delete(id)); return n; });
      }, 850);
      return () => clearTimeout(tid);
    }
  }, [board, localTargets]);

  // All targets = WS + locally added
  const allTargets = useMemo(() => [...board, ...localTargets], [board, localTargets]);

  // Apply search + filter + sort
  const filteredTargets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let filtered = allTargets.filter(t => {
      if (showFlaggedOnly && !flaggedIds.has(t.target_id)) return false;
      if (q) {
        const match =
          deriveTrackId(t.target_id).toLowerCase().includes(q) ||
          t.detection.asset_type.toLowerCase().includes(q)      ||
          t.detection.classification.toLowerCase().includes(q)   ||
          t.detection.source_label.toLowerCase().includes(q);
        if (!match) return false;
      }
      return applyConfFilter(t, filterConf);
    });
    return applySort(filtered, sortBy);
  }, [allTargets, searchQuery, filterConf, sortBy, flaggedIds, showFlaggedOnly]);

  // Build dynamic columns based on groupBy
  const columns = useMemo(() => {
    if (groupBy === "stage") {
      return Array.from(visibleStages)
        .sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))
        .map(stage => ({
          key:     stage,
          label:   STAGE_CFG[stage].label,
          color:   STAGE_CFG[stage].color,
          cardBg:  STAGE_CFG[stage].cardBg,
          targets: filteredTargets.filter(t => t.stage === stage),
        }));
    }
    if (groupBy === "source") {
      return SOURCES.map(src => ({
        key:     src,
        label:   src,
        color:   SOURCE_COLOR[src] ?? T.textSecondary,
        cardBg:  SOURCE_BG[src]   ?? `linear-gradient(170deg,${T.bgPrimary} 0%,${T.bgDeep} 100%)`,
        targets: filteredTargets.filter(t => t.detection.source_label === src),
      }));
    }
    // classification
    const classes = Array.from(new Set(
      filteredTargets.length > 0
        ? filteredTargets.map(t => t.detection.classification)
        : allTargets.map(t => t.detection.classification)
    )).sort();
    const palette = [T.blueLt, T.orangeLt, T.turquoise, T.violet, T.redLt, T.greenLt];
    return classes.map((cls, i) => ({
      key:     cls,
      label:   cls,
      color:   palette[i % palette.length],
      cardBg:  Object.values(STAGE_CFG)[i % STAGE_ORDER.length].cardBg,
      targets: filteredTargets.filter(t => t.detection.classification === cls),
    }));
  }, [groupBy, filteredTargets, visibleStages, allTargets]);

  const handleCardClick = useCallback(
    (t: DetectionTarget) =>
      router.push(`/map?lat=${encodeURIComponent(t.detection.lat)}&lng=${encodeURIComponent(t.detection.lon)}`),
    [router],
  );

  function toggleFlag(id: string) {
    setFlaggedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleStage(stage: Stage) {
    setVisibleStages(s => {
      const n = new Set(s);
      if (n.has(stage) && n.size > 1) n.delete(stage);
      else n.add(stage);
      return n;
    });
  }

  function submitAdd(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!addForm.asset_type.trim()) return;
    setLocalTargets(prev => [createMockTarget(addForm), ...prev]);
    setAddForm({ asset_type: "", classification: "UNCLASSIFIED", stage: "DYNAMIC", source: "SIGINT" });
    setAddOpen(false);
  }

  const isFiltered       = searchQuery.trim() !== "" || filterConf !== "all" || sortBy !== "time" || showFlaggedOnly;
  const hiddenCount      = STAGE_ORDER.length - visibleStages.size;
  const cardPad          = viewDensity === "compact" ? "5px 8px 4px" : "7px 8px 6px";
  const cardFontSize     = viewDensity === "compact" ? 10 : 11;

  // Shared input/select style for the add form
  const formInputStyle: React.CSSProperties = {
    fontSize: 11, color: T.textPrimary, background: T.bgSurface,
    border: `1px solid ${T.borderStrong}`, borderRadius: 2,
    padding: "4px 8px", outline: "none",
  };

  return (
    <div className="h-full flex flex-col" style={{ background: T.bgDeep }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between shrink-0 px-2.5 gap-2"
        style={{ height: 37, background: T.bgPrimary, borderBottom: `1px solid ${T.border}` }}
      >
        {/* ── Left controls ── */}
        <div className="flex items-center gap-1">

          {/* + Add */}
          <button
            onClick={() => { setAddOpen(o => !o); setOpenDrop(null); }}
            className="flex items-center gap-1 px-2 py-1 rounded-sm"
            style={{
              fontSize: 11, color: T.greenLt,
              border: `1px solid ${addOpen ? T.greenLt + "90" : T.green + "55"}`,
              background: addOpen ? `${T.green}28` : `${T.green}18`,
            }}
          >
            <Plus size={10} />
            Add
          </button>

          {/* Search */}
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-sm"
            style={{
              border: `1px solid ${searchQuery ? T.blue : T.border}`,
              background: T.bgSurface,
              transition: "border-color 0.15s",
            }}
          >
            <Search size={10} style={{ color: T.textMuted, flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none"
              style={{ fontSize: 11, color: T.textSecondary, width: 96 }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ color: T.textDisabled, lineHeight: 1 }}>
                <X size={10} />
              </button>
            )}
          </div>

          {/* Filter */}
          <div ref={dropRefs.filter} style={{ position: "relative" }}>
            <TBtn active={filterConf !== "all"} onClick={() => toggleDrop("filter")}>
              <Filter size={10} />
              Filter
              {filterConf !== "all" && (
                <span style={{ fontSize: 9, background: T.blue, color: "#fff", borderRadius: 8, padding: "0 4px", lineHeight: "14px" }}>
                  1
                </span>
              )}
              <ChevronDown size={9} style={{ opacity: 0.5 }} />
            </TBtn>
            <DropPanel open={openDrop === "filter"}>
              <DropLabel>Confidence</DropLabel>
              {FILTER_OPTIONS.map(opt => (
                <DropRow
                  key={opt.value}
                  selected={filterConf === opt.value}
                  onClick={() => { setFilterConf(opt.value); setOpenDrop(null); }}
                >
                  <span style={{ fontWeight: 500 }}>{opt.label}</span>
                  <span style={{ color: T.textMuted, fontSize: 10, marginLeft: 4 }}>{opt.desc}</span>
                </DropRow>
              ))}
            </DropPanel>
          </div>

          {/* Sort by */}
          <div ref={dropRefs.sort} style={{ position: "relative" }}>
            <TBtn active={sortBy !== "time"} onClick={() => toggleDrop("sort")}>
              <ArrowUpDown size={10} />
              Sort by
              <ChevronDown size={9} style={{ opacity: 0.5 }} />
            </TBtn>
            <DropPanel open={openDrop === "sort"}>
              <DropLabel>Sort cards by</DropLabel>
              {SORT_OPTIONS.map(opt => (
                <DropRow
                  key={opt.value}
                  selected={sortBy === opt.value}
                  onClick={() => { setSortBy(opt.value); setOpenDrop(null); }}
                >
                  {opt.label}
                </DropRow>
              ))}
            </DropPanel>
          </div>

          {/* Group by */}
          <div ref={dropRefs.group} style={{ position: "relative" }}>
            <TBtn active={groupBy !== "stage"} onClick={() => toggleDrop("group")}>
              <Layers size={10} />
              Group by
              <ChevronDown size={9} style={{ opacity: 0.5 }} />
            </TBtn>
            <DropPanel open={openDrop === "group"}>
              <DropLabel>Group columns by</DropLabel>
              {GROUP_OPTIONS.map(opt => (
                <DropRow
                  key={opt.value}
                  selected={groupBy === opt.value}
                  onClick={() => { setGroupBy(opt.value); setOpenDrop(null); }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{opt.desc}</div>
                  </div>
                </DropRow>
              ))}
            </DropPanel>
          </div>

          <div style={{ width: 1, height: 15, background: T.borderStrong, margin: "0 3px" }} />

          {/* Board / List toggle */}
          <TBtn active={viewMode === "list"} onClick={() => setViewMode(m => m === "board" ? "list" : "board")} title={viewMode === "board" ? "Switch to list view" : "Switch to board view"}>
            {viewMode === "board" ? <LayoutGrid size={11} /> : <List size={11} />}
          </TBtn>

          {/* Filtered count pill */}
          {isFiltered && (
            <span style={{ fontSize: 10, color: T.textMuted, marginLeft: 4 }}>
              {filteredTargets.length} of {allTargets.length}
            </span>
          )}
        </div>

        {/* ── Right controls ── */}
        <div className="flex items-center gap-1">

          {/* WS dot */}
          <div
            className={sim.connected ? "dot-glow" : ""}
            style={{
              width: 6, height: 6, borderRadius: "50%",
              background: sim.connected ? T.greenLt : T.redLt,
              boxShadow: sim.connected ? `0 0 4px ${T.greenLt}` : "none",
              marginRight: 4,
            }}
          />

          {/* Bell — simulation stats */}
          <div ref={dropRefs.notif} style={{ position: "relative" }}>
            <TBtn onClick={() => toggleDrop("notif")}>
              <Bell size={10} />{sim.pendingEvents}
            </TBtn>
            <DropPanel open={openDrop === "notif"} right>
              <DropLabel>Simulation status</DropLabel>
              <div style={{ padding: "6px 12px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                {[
                  ["Status",         sim.connected ? "CONNECTED" : "OFFLINE", sim.connected ? T.greenLt : T.redLt],
                  ["Tick",           String(sim.tick),                         T.textSecondary],
                  ["Speed",          `${sim.speed}×`,                          T.textSecondary],
                  ["Pending events", String(sim.pendingEvents),                sim.pendingEvents > 0 ? T.orangeLt : T.textMuted],
                  ["Active targets", String(allTargets.length),                T.textSecondary],
                ].map(([label, val, color]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span style={{ fontSize: 11, color: T.textMuted }}>{label}</span>
                    <span className="font-mono" style={{ fontSize: 11, color }}>{val}</span>
                  </div>
                ))}
              </div>
            </DropPanel>
          </div>

          {/* Flag — filter to flagged targets */}
          <TBtn
            active={showFlaggedOnly}
            onClick={() => setShowFlaggedOnly(o => !o)}
            title={showFlaggedOnly ? "Show all targets" : "Show flagged only"}
          >
            <Flag size={10} style={{ color: showFlaggedOnly ? T.gold : "inherit" }} />
            {flaggedIds.size}
          </TBtn>

          {/* Map — navigate */}
          <TBtn onClick={() => router.push("/map")}>
            Map
          </TBtn>

          {/* Board Hierarchy — show/hide stage columns */}
          <div ref={dropRefs.hierarchy} style={{ position: "relative" }}>
            <TBtn active={hiddenCount > 0} onClick={() => toggleDrop("hierarchy")}>
              Board Hierarchy
              {hiddenCount > 0 && (
                <span style={{ fontSize: 9, background: T.blue, color: "#fff", borderRadius: 8, padding: "0 4px", lineHeight: "14px" }}>
                  -{hiddenCount}
                </span>
              )}
              <ChevronDown size={10} />
            </TBtn>
            <DropPanel open={openDrop === "hierarchy"} right>
              <DropLabel>Visible columns</DropLabel>
              {STAGE_ORDER.map(stage => {
                const count = filteredTargets.filter(t => t.stage === stage).length;
                return (
                  <DropCheckRow
                    key={stage}
                    checked={visibleStages.has(stage)}
                    onClick={() => toggleStage(stage)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div style={{ width: 6, height: 6, borderRadius: 1, background: STAGE_CFG[stage].color, flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{STAGE_CFG[stage].label}</span>
                      <span className="font-mono" style={{ fontSize: 10, color: T.textDisabled }}>{count}</span>
                    </div>
                  </DropCheckRow>
                );
              })}
            </DropPanel>
          </div>

          {/* View — density + mode */}
          <div ref={dropRefs.view} style={{ position: "relative" }}>
            <TBtn onClick={() => toggleDrop("view")}>
              View <ChevronDown size={10} />
            </TBtn>
            <DropPanel open={openDrop === "view"} right>
              <DropLabel>Layout</DropLabel>
              <DropRow selected={viewMode === "board"} onClick={() => { setViewMode("board"); setOpenDrop(null); }}>
                <LayoutGrid size={11} style={{ flexShrink: 0 }} />Board
              </DropRow>
              <DropRow selected={viewMode === "list"} onClick={() => { setViewMode("list"); setOpenDrop(null); }}>
                <List size={11} style={{ flexShrink: 0 }} />List
              </DropRow>
              <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
              <DropLabel>Card density</DropLabel>
              <DropRow selected={viewDensity === "comfortable"} onClick={() => { setViewDensity("comfortable"); setOpenDrop(null); }}>
                Comfortable
              </DropRow>
              <DropRow selected={viewDensity === "compact"} onClick={() => { setViewDensity("compact"); setOpenDrop(null); }}>
                Compact
              </DropRow>
            </DropPanel>
          </div>

        </div>
      </div>

      {/* ── + Add form (slide-in below toolbar) ──────────────────────────────── */}
      {addOpen && (
        <form
          onSubmit={submitAdd}
          className="flex items-center gap-2 shrink-0 px-3 py-2"
          style={{ background: T.bgElevated, borderBottom: `1px solid ${T.border}` }}
        >
          <span style={{ fontSize: 10, color: T.textMuted, whiteSpace: "nowrap" }}>New target:</span>
          <input
            autoFocus
            type="text"
            placeholder="Asset type (e.g. T-72 MBT)"
            value={addForm.asset_type}
            onChange={e => setAddForm(f => ({ ...f, asset_type: e.target.value }))}
            style={{ ...formInputStyle, flex: 1, minWidth: 0 }}
          />
          <select
            value={addForm.stage}
            onChange={e => setAddForm(f => ({ ...f, stage: e.target.value as Stage }))}
            style={{ ...formInputStyle, cursor: "pointer" }}
          >
            {STAGE_ORDER.map(s => <option key={s} value={s}>{STAGE_CFG[s].label}</option>)}
          </select>
          <select
            value={addForm.source}
            onChange={e => setAddForm(f => ({ ...f, source: e.target.value }))}
            style={{ ...formInputStyle, cursor: "pointer" }}
          >
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={addForm.classification}
            onChange={e => setAddForm(f => ({ ...f, classification: e.target.value }))}
            style={{ ...formInputStyle, cursor: "pointer" }}
          >
            {["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP SECRET"].map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
          <button
            type="submit"
            className="px-3 py-1 rounded-sm font-medium"
            style={{ fontSize: 11, background: T.green, color: "#fff", border: "none" }}
          >
            Add Target
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(false)}
            style={{ color: T.textDisabled, lineHeight: 1 }}
          >
            <X size={13} />
          </button>
        </form>
      )}

      {/* ── Board view ───────────────────────────────────────────────────────── */}
      {viewMode === "board" && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-2">
          <div className="flex h-full gap-1.5 min-w-max">
            {columns.map(col => {
              const isDragTarget = groupBy === "stage" && dragOverColumn === col.key;
              return (
              <div
                key={col.key}
                className="flex flex-col"
                onDragOver={groupBy === "stage" ? (e) => { e.preventDefault(); setDragOverColumn(col.key); } : undefined}
                onDragLeave={groupBy === "stage" ? () => setDragOverColumn(null) : undefined}
                onDrop={groupBy === "stage" ? (e) => {
                  e.preventDefault();
                  setDragOverColumn(null);
                  const targetId = e.dataTransfer.getData("text/target-id");
                  if (targetId) sim.setTargetStage(targetId, col.key);
                } : undefined}
                style={{
                  width: 210,
                  background: isDragTarget ? T.bgElevated : T.bgPrimary,
                  border: isDragTarget ? `1px solid ${col.color}88` : `1px solid ${T.border}`,
                  borderTop: `2px solid ${isDragTarget ? col.color : col.color + "55"}`,
                  borderRadius: 2,
                  transition: "background 0.15s, border-color 0.15s",
                }}
              >
                {/* Column header */}
                <div
                  className="flex items-center gap-2 px-2.5 shrink-0"
                  style={{ height: 32, background: T.bgElevated, borderBottom: `1px solid ${T.border}` }}
                >
                  <div style={{ width: 7, height: 7, background: col.color, borderRadius: 1, flexShrink: 0 }} />
                  <span className="flex-1 font-bold uppercase" style={{ fontSize: 10, color: T.textPrimary, letterSpacing: "0.1em" }}>
                    {col.label}
                  </span>
                  <span className="font-mono" style={{ fontSize: 10, color: T.textMuted, background: T.bgDeep, padding: "1px 5px", borderRadius: 2, border: `1px solid ${T.border}` }}>
                    {col.targets.length}
                  </span>
                  <button style={{ color: T.textDisabled, padding: 2, lineHeight: 1 }}><ChevronLeft size={10} /></button>
                  <button style={{ color: T.textDisabled, padding: 2, lineHeight: 1 }}><ChevronRight size={10} /></button>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-1.5">
                  {loading ? (
                    <>{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</>
                  ) : col.targets.length === 0 ? (
                    <div className="flex items-center justify-center" style={{ height: 44, fontSize: 10, color: T.textDisabled }}>
                      {isFiltered ? "No matches" : "No items"}
                    </div>
                  ) : col.targets.map(t => {
                    const trackId = deriveTrackId(t.target_id);
                    const expired = isExpired(t.created_at);
                    const isFlagged = flaggedIds.has(t.target_id);
                    const isFlash   = flashing.has(t.target_id);
                    const conf      = Math.round(t.detection.confidence);
                    const confColor = conf >= 85 ? T.greenLt : conf >= 60 ? T.orangeLt : T.redLt;
                    const srcColor  = SOURCE_COLOR[t.detection.source_label] ?? T.textMuted;

                    return (
                      <div
                        key={t.target_id}
                        draggable={groupBy === "stage"}
                        onDragStart={groupBy === "stage" ? (e) => {
                          e.dataTransfer.setData("text/target-id", t.target_id);
                          e.dataTransfer.effectAllowed = "move";
                        } : undefined}
                        onClick={() => handleCardClick(t)}
                        className={`relative hover:brightness-110 transition-[filter] duration-150${isFlash ? " card-flash" : ""}`}
                        style={{
                          background: col.cardBg,
                          border: isFlash ? `1px solid rgba(250,204,21,0.6)` : `1px solid ${T.borderStrong}`,
                          borderRadius: 3,
                          padding: "8px 10px 6px",
                          cursor: "pointer",
                        }}
                      >
                        {/* Flagged indicator strip */}
                        {isFlagged && (
                          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: T.gold, borderRadius: "3px 0 0 3px" }} />
                        )}

                        {/* Row 1: Asset type (hero) + confidence badge */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <div style={{ width: 7, height: 7, background: T.hostile, transform: "rotate(45deg)", flexShrink: 0 }} />
                          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12, color: T.textPrimary, fontWeight: 700 }}>
                            {t.detection.asset_type}
                          </span>
                          <span className="font-mono shrink-0" style={{
                            fontSize: 10, fontWeight: 700, color: confColor,
                            background: `${confColor}18`, border: `1px solid ${confColor}40`,
                            borderRadius: 2, padding: "1px 5px", lineHeight: "16px",
                          }}>
                            {conf}%
                          </span>
                        </div>

                        {/* Row 2: Track ID + grid ref */}
                        <div className="flex items-center gap-2 mb-2" style={{ paddingLeft: 15 }}>
                          <span className="font-mono" style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.06em" }}>
                            {trackId}
                          </span>
                          <span style={{ color: T.border }}>|</span>
                          <MapPin size={8} style={{ color: T.textDisabled, flexShrink: 0 }} />
                          <span className="font-mono" style={{ fontSize: 9, color: T.textDisabled }}>
                            {shortGrid(t.detection.grid_ref)}
                          </span>
                        </div>

                        {/* Row 3: Tags — source + classification */}
                        <div className="flex items-center gap-1.5 mb-2" style={{ paddingLeft: 15 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 600, color: srcColor,
                            background: `${srcColor}15`, border: `1px solid ${srcColor}30`,
                            borderRadius: 2, padding: "0px 4px", lineHeight: "15px",
                          }}>
                            {t.detection.source_label}
                          </span>
                          {t.detection.classification !== "UNCLASSIFIED" && (
                            <span style={{
                              fontSize: 9, color: T.textMuted,
                              background: T.bgSurface, border: `1px solid ${T.border}`,
                              borderRadius: 2, padding: "0px 4px", lineHeight: "15px",
                            }}>
                              {t.detection.classification}
                            </span>
                          )}
                          {expired && (
                            <span style={{
                              fontSize: 9, fontWeight: 600, color: T.orangeLt,
                              background: `${T.orangeLt}15`, border: `1px solid ${T.orangeLt}30`,
                              borderRadius: 2, padding: "0px 4px", lineHeight: "15px",
                            }}>
                              EXPIRED
                            </span>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between" style={{ paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
                          <span style={{ fontSize: 9, color: T.textDisabled }}>{timeAgo(t.updated_at)}</span>
                          <div className="flex items-center gap-1.5">
                            {(conf < 70 || expired) && (
                              <AlertTriangle size={9} style={{ color: T.gold }} />
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFlag(t.target_id); }}
                              title={isFlagged ? "Remove flag" : "Flag target"}
                              style={{ lineHeight: 1, color: isFlagged ? T.gold : T.textDisabled }}
                            >
                              <Flag size={9} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* ── List view ────────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse" style={{ fontSize: 11 }}>
            <thead>
              <tr style={{ background: T.bgElevated, borderBottom: `1px solid ${T.borderStrong}` }}>
                {["Track ID", "Asset Type", "Stage", "Source", "Classification", "Conf %", "Last edited", ""].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase" style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTargets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8" style={{ color: T.textDisabled, fontSize: 11 }}>
                    No targets match the current filters
                  </td>
                </tr>
              ) : filteredTargets.map((t, i) => {
                const trackId   = deriveTrackId(t.target_id);
                const isFlagged = flaggedIds.has(t.target_id);
                const cfg       = STAGE_CFG[t.stage as Stage] ?? STAGE_CFG.DYNAMIC;
                const conf      = Math.round(t.detection.confidence);
                const confColor = conf >= 85 ? T.greenLt : conf >= 60 ? T.orangeLt : T.redLt;

                return (
                  <tr
                    key={t.target_id}
                    onClick={() => handleCardClick(t)}
                    style={{
                      background: i % 2 === 0 ? T.bgPrimary : T.bgDeep,
                      borderBottom: `1px solid ${T.border}`,
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = T.bgHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = i % 2 === 0 ? T.bgPrimary : T.bgDeep; }}
                  >
                    <td className="px-3 py-2 font-mono font-bold" style={{ color: T.textPrimary, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 7, height: 7, background: T.hostile, transform: "rotate(45deg)", flexShrink: 0 }} />
                        {trackId}
                      </div>
                    </td>
                    <td className="px-3 py-2" style={{ color: T.textPrimary, fontWeight: 600, maxWidth: 200 }}>
                      <span className="truncate block">{t.detection.asset_type}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div style={{ width: 6, height: 6, background: cfg.color, borderRadius: 1 }} />
                        <span style={{ fontSize: 10, color: T.textSecondary }}>{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2" style={{ color: SOURCE_COLOR[t.detection.source_label] ?? T.textSecondary, fontSize: 10, fontWeight: 600 }}>
                      {t.detection.source_label}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{ color: T.textMuted, fontSize: 10 }}>
                      {t.detection.classification}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: confColor, whiteSpace: "nowrap" }}>
                      {conf}%
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: T.textMuted }}>
                      {timeAgo(t.updated_at)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={e => { e.stopPropagation(); toggleFlag(t.target_id); }}
                        title={isFlagged ? "Remove flag" : "Flag target"}
                        style={{ color: isFlagged ? T.gold : T.textDisabled, lineHeight: 1 }}
                      >
                        <Flag size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
