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
import { SimulationControls } from "@/components/simulation-controls";
import { useMapLayers } from "@/lib/map-layer-context";
import { useSimulation, type SimAsset } from "@/lib/use-simulation";
import { simAssetsToTactical } from "@/lib/sim-to-tactical";
import {
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

// ── Embed URL mapping (asset type → Sketchfab embed) ────────────────────────

const ASSET_EMBED_MAP: Record<string, string> = {
  "MQ-9 Reaper": "https://sketchfab.com/models/eac2b4bc20f54b3ba8c3ddbcdf03c8d6/embed",
  "RQ-4 Global Hawk": "https://sketchfab.com/models/dd87adcff26b46e58639e9256f5301c4/embed",
  "F-16C Fighting Falcon": "https://sketchfab.com/models/f0b00989e5634764848ef2c235c64db5/embed",
  "F-35B Lightning II": "https://sketchfab.com/models/b1ab1c0090e34b0fbfe667e706023e6d/embed",
  "AC-130 Hercules": "https://sketchfab.com/models/361991c9874d4680931b3e0d23500e43/embed",
  "E-3A AWACS": "https://sketchfab.com/models/80164b1137494e468212730872738e12/embed",
  "AH-64 Apache": "https://sketchfab.com/models/a4d64d7465c64258b50e3764fa92f020/embed",
  "CH-47 Chinook": "https://sketchfab.com/models/fc3143eef51346f2bb8d39be3a633042/embed",
  "Hovering Recon Drone": "https://sketchfab.com/models/eac2b4bc20f54b3ba8c3ddbcdf03c8d6/embed",
  "M1 Abrams": "https://sketchfab.com/models/2577a4eccbc74b2da6dba5bfd09b7511/embed",
  "T-72A MBT": "https://sketchfab.com/models/f55f5b31539f4586b6b75e162af65b77/embed",
  "M2 Bradley IFV": "https://sketchfab.com/models/ab022158ab5f4fbfa55d4142db7595ab/embed",
  "BMP-2 IFV": "https://sketchfab.com/models/2ad92d48e2054b179bd2a5474efc86ac/embed",
  "HMMWV Transport": "https://sketchfab.com/models/232c11dc315d467db6b1a4102c42792a/embed",
  "Technical (Armed Pickup)": "https://sketchfab.com/models/bc5604e0a7b341909de1077d0b3bc176/embed",
  "M142 HIMARS": "https://sketchfab.com/models/53c53a112c674d29a2afdbddbe3cecb5/embed",
  "M777 Howitzer": "https://sketchfab.com/models/a17c26dbc0394579b7072ae1faf7be34/embed",
  "M224 Mortar": "https://sketchfab.com/models/c86a73e40d994431bcdb57dc741cf8be/embed",
  "DDG-51 Arleigh Burke": "https://sketchfab.com/models/232c11dc315d467db6b1a4102c42792a/embed",
  "USS Seawolf SSN-21": "https://sketchfab.com/models/90ebfc165a6148e38cb2d7245dc2cd48/embed",
  "USS Wasp LHD-1": "https://sketchfab.com/models/8e68ca4a3b854b2f8f19b942ae944466/embed",
  "S-400 Triumf SAM": "https://sketchfab.com/models/1a109bdd906149249dce0a18cdfbe708/embed",
  "MIM-104 Patriot": "https://sketchfab.com/models/2e1160a3f61b44f29859269b5312c834/embed",
  "Iron Dome Defense System": "https://sketchfab.com/models/4c9aab0f3c014274b921e0a8c3638eee/embed",
  "EW Radar Vehicle": "https://sketchfab.com/models/f954fdaf89054d2e824b032680d3ca74/embed",
  "C-17 Globemaster III": "https://sketchfab.com/models/2d9e934e129a4e048fd19b98328acd78/embed",
  "M977 HEMTT Supply Truck": "https://sketchfab.com/models/a124427dfe894948a1ffa985f26ea5cc/embed",
  "Field Hospital": "https://sketchfab.com/models/7820c7442e644a2eab396ec312fa3700/embed",
  "Civilian Bus": "https://sketchfab.com/models/02c9f34db5714ac09a20445656f13d6a/embed",
  "Civilian Sedan": "https://sketchfab.com/models/bab77902c638427bb85e68b6762a481f/embed",
  "Infantry Squad": "https://sketchfab.com/models/22ddacc2fa6b4f67b975169c548dbd70/embed",
};

const SIDE_COLORS: Record<string, string> = {
  blue: "#00d4ff",
  red: "#ef4444",
  civilian: "#f59e0b",
};

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  moving: "#00d4ff",
  damaged: "#f59e0b",
  destroyed: "#ef4444",
  holding: "#a78bfa",
  rtb: "#ef4444",
};

// ── Asset detail panel ────────────────────────────────────────────────────────

function AssetDetailPanel({
  asset,
  onClose,
}: {
  asset: SimAsset;
  onClose: () => void;
}) {
  const side = asset.faction_id;
  const color = SIDE_COLORS[side] ?? "#94a3b8";
  const embedUrl = ASSET_EMBED_MAP[asset.asset_type];
  const embedSrc = embedUrl
    ? embedUrl + (embedUrl.includes("?") ? "&" : "?")
      + "autostart=1&transparent=1&ui_theme=dark&ui_controls=0&ui_infos=0&ui_watermark_link=0&ui_watermark=0"
    : null;

  return (
    <div
      className="absolute bottom-0 right-0 w-[320px] bg-[#0a0a0f]/95 border border-zinc-800/80 z-30 flex flex-col"
      style={{ backdropFilter: "blur(8px)", maxHeight: "80%" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2" style={{ background: color }} />
          <span className="text-[11px] font-bold text-zinc-200">{asset.callsign}</span>
          <span
            className="text-[8px] font-bold px-1.5 py-px"
            style={{ background: (STATUS_COLORS[asset.status] ?? "#71717a") + "20", color: STATUS_COLORS[asset.status] ?? "#71717a" }}
          >
            {asset.status.toUpperCase()}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-pointer">
          <X size={13} />
        </button>
      </div>

      {/* 3D Model */}
      {embedSrc && (
        <div className="w-full h-[180px] border-b border-[#27272a]">
          <iframe
            title={asset.asset_type}
            src={embedSrc}
            className="w-full h-full"
            allow="autoplay; fullscreen; xr-spatial-tracking"
            style={{ border: "none", background: "#0a0a0f" }}
          />
        </div>
      )}

      {/* Asset type label */}
      <div className="px-3 py-1.5 border-b border-[#1a1a1f]">
        <span className="text-[10px] text-zinc-400">{asset.asset_type}</span>
        <span className="text-[9px] text-zinc-700 ml-2">({asset.faction_id.toUpperCase()})</span>
      </div>

      {/* Telemetry */}
      <div className="px-3 py-2 space-y-1 overflow-y-auto">
        <TelRow label="Lat / Lon" value={`${asset.position.latitude.toFixed(4)}, ${asset.position.longitude.toFixed(4)}`} />
        <TelRow label="Altitude" value={`${asset.position.altitude_m.toFixed(0)} m`} />
        <TelRow label="Heading" value={`${asset.position.heading_deg.toFixed(1)}°`} />
        <TelRow label="Speed" value={`${asset.speed_kmh} km/h`} />
        <TelRow label="Health" value={`${(asset.health * 100).toFixed(0)}%`} color={asset.health > 0.5 ? "#22c55e" : asset.health > 0.2 ? "#f59e0b" : "#ef4444"} />
        {asset.sensor_type && <TelRow label="Sensor" value={asset.sensor_type} />}
        {asset.weapons.length > 0 && <TelRow label="Weapons" value={asset.weapons.join(", ")} />}
        <TelRow label="Asset ID" value={asset.asset_id} mono />
      </div>
    </div>
  );
}

function TelRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[9px] text-zinc-600 uppercase tracking-[0.1em]">{label}</span>
      <span className={`text-[10px] ${mono ? "text-zinc-600" : ""} font-mono truncate max-w-[180px]`} style={color ? { color } : undefined}>
        {value}
      </span>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(true);

  const sim = useSimulation();
  const selectedAsset: SimAsset | null = selectedId ? sim.assets[selectedId] ?? null : null;

  // Convert live simulation assets to the TacticalAsset format the map expects
  const tacticalAssets = useMemo(
    () => simAssetsToTactical(sim.assets),
    [sim.assets],
  );

  const visibleAssets = useMemo(
    () => tacticalAssets.filter((a) => visibleLayers.has(a.asset_class)),
    [tacticalAssets, visibleLayers],
  );

  const alertCount = MOCK_TARGETING_ALERTS.filter(
    (a) => a.stage === "DYNAMIC" || a.stage === "PENDING PAIRING",
  ).length;

  return (
    <div className="flex-1 flex flex-col bg-[#09090b] overflow-hidden">
      {/* ── Simulation Controls ─────────────────────────────────────── */}
      <SimulationControls
        connected={sim.connected}
        tick={sim.tick}
        speed={sim.speed}
        onSetSpeed={sim.setSpeed}
        assetCount={Object.keys(sim.assets).length}
        pendingEvents={sim.pendingEvents}
      />

      {/* ── Map ──────────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-h-0">
        <MapView
          assets={visibleAssets}
          visibleLayers={visibleLayers}
          onAssetClick={(asset) =>
            setSelectedId((prev) =>
              prev === asset.asset_id ? null : asset.asset_id,
            )
          }
          selectedId={selectedId}
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
            onClose={() => setSelectedId(null)}
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
