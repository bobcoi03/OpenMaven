"use client";

/**
 * map/page.tsx
 *
 * Smart Maven Tactical C2 View — primary operational display.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  (left sidebar — Map Layers — in AppShell)  │
 *   │  ┌─────────────────────────────────────────┐│
 *   │  │           SATELLITE MAP                 ││
 *   │  │                                         ││
 *   │  │  [asset markers per class]              ││
 *   │  └─────────────────────────────────────────┘│
 *   │  ┌─────────────────────────────────────────┐│
 *   │  │  TARGETING BOARD (collapsible kanban)   ││
 *   │  └─────────────────────────────────────────┘│
 *   └─────────────────────────────────────────────┘
 */

import { useState, useMemo } from "react";
import { MapView } from "@/components/map-view";
import { useMapLayers } from "@/lib/map-layer-context";
import {
  MOCK_TACTICAL_ASSETS,
  MOCK_TARGETING_ALERTS,
  type TacticalAsset,
  type TargetingAlert,
  type AlertStage,
} from "@/lib/tactical-mock";
import {
  ChevronDown,
  ChevronUp,
  Target,
  Zap,
  CheckCircle2,
  Timer,
  CircleDot,
  X,
  Crosshair,
  Activity,
} from "lucide-react";

// ── Asset detail panel ────────────────────────────────────────────────────────

function AssetDetailPanel({
  asset,
  onClose,
}: {
  asset: TacticalAsset;
  onClose: () => void;
}) {
  const COLOR: Record<string, string> = {
    Military: "#00d4ff",
    Infrastructure: "#f59e0b",
    Logistics: "#94a3b8",
  };
  const color = COLOR[asset.asset_class] ?? "#94a3b8";

  const metricRows: [string, string][] = [];
  if (asset.speed_kmh   !== undefined) metricRows.push(["Speed",     `${asset.speed_kmh} km/h`]);
  if (asset.heading_deg !== undefined) metricRows.push(["Heading",   `${asset.heading_deg}°`]);
  if (asset.status      !== undefined) metricRows.push(["Status",    asset.status]);
  if (asset.efficiency_pct !== undefined) metricRows.push(["Efficiency", `${asset.efficiency_pct.toFixed(1)}%`]);
  if (asset.output_mw      !== undefined) metricRows.push(["Output",     `${asset.output_mw.toFixed(1)} MW`]);
  if (asset.structural_pct !== undefined) metricRows.push(["Structural", `${asset.structural_pct.toFixed(1)}%`]);

  return (
    <div
      className="absolute bottom-0 right-0 w-[260px] bg-[#141417]/95 border border-zinc-800/80 rounded-tl z-30 flex flex-col"
      style={{ backdropFilter: "blur(8px)" }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: color }}
          />
          <span className="text-[11px] font-semibold text-zinc-200">
            {asset.asset_type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] text-zinc-500 uppercase tracking-[0.1em]">Class</span>
          <span className="text-[10px] font-medium" style={{ color }}>
            {asset.asset_class}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] text-zinc-500 uppercase tracking-[0.1em]">Lat / Lon</span>
          <span className="text-[10px] text-zinc-400 font-mono">
            {asset.latitude.toFixed(4)}, {asset.longitude.toFixed(4)}
          </span>
        </div>
        {metricRows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between">
            <span className="text-[9px] text-zinc-500 uppercase tracking-[0.1em]">{k}</span>
            <span
              className="text-[10px] font-mono"
              style={{
                color:
                  k === "Status" && v === "CRITICAL"
                    ? "#ef4444"
                    : k === "Status" && v === "DEGRADED"
                    ? "#f59e0b"
                    : "#94a3b8",
              }}
            >
              {v}
            </span>
          </div>
        ))}
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] text-zinc-500 uppercase tracking-[0.1em]">Asset ID</span>
          <span className="text-[9px] text-zinc-600 font-mono truncate max-w-[120px]">
            {asset.asset_id.split("-")[0]}…
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Targeting board ───────────────────────────────────────────────────────────

const STAGE_ORDER: AlertStage[] = [
  "DYNAMIC",
  "PENDING PAIRING",
  "PAIRED",
  "IN EXECUTION",
  "COMPLETE",
];

const STAGE_CFG: Record<
  AlertStage,
  { color: string; border: string; icon: React.ElementType }
> = {
  "DYNAMIC":         { color: "text-red-400",    border: "border-l-red-500",    icon: Activity     },
  "PENDING PAIRING": { color: "text-amber-400",  border: "border-l-amber-500",  icon: Timer        },
  "PAIRED":          { color: "text-blue-400",   border: "border-l-blue-500",   icon: CircleDot    },
  "IN EXECUTION":    { color: "text-cyan-400",   border: "border-l-cyan-500",   icon: Zap          },
  "COMPLETE":        { color: "text-emerald-400",border: "border-l-emerald-500",icon: CheckCircle2 },
};

const CLASSIFICATION_CFG: Record<string, string> = {
  MS:  "text-red-400 border-red-800/60 bg-red-950/40",
  CC:  "text-amber-400 border-amber-800/60 bg-amber-950/40",
  ECD: "text-cyan-400 border-cyan-800/60 bg-cyan-950/40",
};

function AlertCard({
  alert,
  isSelected,
  onSelect,
}: {
  alert: TargetingAlert;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const cfg = STAGE_CFG[alert.stage];
  const cls = CLASSIFICATION_CFG[alert.classification] ?? "text-zinc-400 border-zinc-700 bg-zinc-900/40";
  const confColor =
    alert.confidence >= 90 ? "#22c55e" : alert.confidence >= 75 ? "#f59e0b" : "#94a3b8";

  return (
    <div
      onClick={onSelect}
      className={`border-l-2 ${cfg.border} bg-[#141417] border border-zinc-800/80 rounded-r px-2.5 py-2 cursor-pointer transition-all hover:border-zinc-600/60 ${
        isSelected ? "ring-1 ring-cyan-500/40 bg-cyan-950/10" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Crosshair size={9} className="text-zinc-500" />
        <span className="text-[9px] text-zinc-400 truncate flex-1">{alert.label}</span>
        <span
          className={`text-[8px] px-1 py-px rounded border font-semibold shrink-0 ${cls}`}
        >
          {alert.classification}
        </span>
      </div>
      <div className="text-[10px] text-zinc-200 font-medium mb-1">{alert.asset_type}</div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-zinc-600">{alert.grid_ref.slice(-10)}</span>
        <span className="text-[9px] font-mono" style={{ color: confColor }}>
          {alert.confidence}%
        </span>
      </div>
      <div className="text-[8px] text-zinc-700 mt-0.5 text-right">{alert.created_ago}</div>
    </div>
  );
}

function TargetingBoard({
  alerts,
}: {
  alerts: TargetingAlert[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map: Record<AlertStage, TargetingAlert[]> = {
      "DYNAMIC": [], "PENDING PAIRING": [], "PAIRED": [], "IN EXECUTION": [], "COMPLETE": [],
    };
    for (const a of alerts) map[a.stage].push(a);
    return map;
  }, [alerts]);

  const selected = alerts.find((a) => a.id === selectedId);

  return (
    <div className="h-full flex overflow-hidden bg-[#09090b]">
      {/* Kanban columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-max">
          {STAGE_ORDER.map((stage) => {
            const stageCfg = STAGE_CFG[stage];
            const StageIcon = stageCfg.icon;
            const cards = byStage[stage];

            return (
              <div
                key={stage}
                className="flex flex-col w-[175px] border-r border-[#27272a] last:border-r-0"
              >
                {/* Column header */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#141417] border-b border-[#27272a] shrink-0">
                  <StageIcon size={10} className={stageCfg.color} />
                  <span className={`text-[9px] font-semibold tracking-[0.12em] ${stageCfg.color}`}>
                    {stage}
                  </span>
                  <span className="ml-auto text-[9px] text-zinc-700 font-mono">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {cards.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      isSelected={selectedId === alert.id}
                      onSelect={() =>
                        setSelectedId(alert.id === selectedId ? null : alert.id)
                      }
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="flex items-center justify-center h-12 text-[9px] text-zinc-800">
                      No targets
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected alert detail */}
      {selected && (
        <div className="w-[220px] bg-[#141417] border-l border-[#27272a] flex flex-col shrink-0">
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#27272a]">
            <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-[0.1em]">
              Target Detail
            </span>
            <button
              onClick={() => setSelectedId(null)}
              className="text-zinc-700 hover:text-zinc-400 transition-colors"
            >
              <X size={11} />
            </button>
          </div>
          <div className="px-2.5 py-2 space-y-2 overflow-y-auto">
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">Label</div>
              <div className="text-[10px] text-zinc-300 mt-0.5">{selected.label}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">Asset Type</div>
              <div className="text-[11px] text-zinc-100 font-semibold mt-0.5">{selected.asset_type}</div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">Grid Ref</div>
              <div className="text-[10px] text-cyan-400 font-mono mt-0.5">{selected.grid_ref}</div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">Confidence</div>
                <div
                  className="text-[11px] font-semibold font-mono mt-0.5"
                  style={{
                    color:
                      selected.confidence >= 90 ? "#22c55e" :
                      selected.confidence >= 75 ? "#f59e0b" : "#94a3b8",
                  }}
                >
                  {selected.confidence}%
                </div>
              </div>
              <div className="flex-1">
                <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">Class</div>
                <div
                  className={`text-[10px] font-semibold mt-0.5 ${CLASSIFICATION_CFG[selected.classification]?.split(" ")[0] ?? "text-zinc-400"}`}
                >
                  {selected.classification}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">Stage</div>
              <div className={`text-[10px] font-semibold mt-0.5 ${STAGE_CFG[selected.stage].color}`}>
                {selected.stage}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-1 space-y-1">
              {selected.stage === "DYNAMIC" && (
                <button className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded hover:bg-amber-500/20 transition-colors cursor-pointer">
                  <Timer size={10} /> Pair Asset
                </button>
              )}
              {selected.stage === "PAIRED" && (
                <button className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded hover:bg-cyan-500/20 transition-colors cursor-pointer">
                  <Zap size={10} /> Execute
                </button>
              )}
              {selected.stage === "IN EXECUTION" && (
                <button className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded hover:bg-emerald-500/20 transition-colors cursor-pointer">
                  <CheckCircle2 size={10} /> Mark Complete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const { visibleLayers } = useMapLayers();
  const [selectedAsset, setSelectedAsset] = useState<TacticalAsset | null>(null);
  const [boardOpen, setBoardOpen] = useState(true);

  // Filter assets by visible layers — also cap for performance; real data
  // would come from the Kafka-backed /api/assets/tactical endpoint.
  const visibleAssets = useMemo(
    () => MOCK_TACTICAL_ASSETS.filter((a) => visibleLayers.has(a.asset_class)),
    [visibleLayers],
  );

  const alertCount = MOCK_TARGETING_ALERTS.filter(
    (a) => a.stage === "DYNAMIC" || a.stage === "PENDING PAIRING",
  ).length;

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden">
      {/* ── Map ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <MapView
          assets={visibleAssets}
          visibleLayers={visibleLayers}
          onAssetClick={(asset) =>
            setSelectedAsset((prev) =>
              prev?.asset_id === asset.asset_id ? null : asset,
            )
          }
          selectedId={selectedAsset?.asset_id ?? null}
        />

        {/* Asset count HUD */}
        <div className="absolute top-2 left-2 z-20 flex gap-1.5">
          {(["Military", "Infrastructure", "Logistics"] as const).map((cls) => {
            const count = visibleAssets.filter((a) => a.asset_class === cls).length;
            const color =
              cls === "Military" ? "#00d4ff" :
              cls === "Infrastructure" ? "#f59e0b" : "#94a3b8";
            if (!visibleLayers.has(cls)) return null;
            return (
              <div
                key={cls}
                className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-semibold font-mono"
                style={{
                  background: "rgba(8,13,24,0.85)",
                  border: `1px solid ${color}40`,
                  color,
                  backdropFilter: "blur(4px)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: color }}
                />
                {count.toLocaleString()}
              </div>
            );
          })}
        </div>

        {/* Alert count badge */}
        {alertCount > 0 && (
          <div
            className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold"
            style={{
              background: "rgba(239,68,68,0.15)",
              border: "1px solid rgba(239,68,68,0.4)",
              color: "#f87171",
              backdropFilter: "blur(4px)",
            }}
          >
            <Activity size={10} />
            {alertCount} ACTIVE ALERTS
          </div>
        )}

        {/* Asset detail panel */}
        {selectedAsset && (
          <AssetDetailPanel
            asset={selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
        )}
      </div>

      {/* ── Targeting Board ───────────────────────────────────────────── */}
      <div
        className="shrink-0 border-t border-[#27272a] flex flex-col"
        style={{ height: boardOpen ? "200px" : "30px" }}
      >
        {/* Board toolbar */}
        <div className="flex items-center gap-2 px-3 h-[30px] shrink-0 bg-[#141417] border-b border-[#27272a] cursor-pointer" onClick={() => setBoardOpen((o) => !o)}>
          <Target size={10} className="text-red-400" />
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.12em]">
            Targeting Board
          </span>
          <span className="text-[9px] text-red-400 font-mono bg-red-950/40 border border-red-900/40 px-1.5 py-px rounded">
            {MOCK_TARGETING_ALERTS.filter((a) => a.stage !== "COMPLETE").length} ACTIVE
          </span>
          <div className="ml-auto text-zinc-600">
            {boardOpen ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </div>
        </div>

        {boardOpen && (
          <div className="flex-1 min-h-0">
            <TargetingBoard alerts={MOCK_TARGETING_ALERTS} />
          </div>
        )}
      </div>
    </div>
  );
}
