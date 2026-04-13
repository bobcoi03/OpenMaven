"use client";

import type { SimAsset } from "@/lib/use-simulation";
import { X } from "lucide-react";

// ── Embed URL mapping (asset type → Sketchfab embed) ────────────────────────

const ASSET_EMBED_MAP: Record<string, string> = {
  "MQ-9 Reaper": "https://sketchfab.com/models/61a6ea6a08f9459c87bd4b0c06ab7b25/embed",
  "RQ-4 Global Hawk": "https://sketchfab.com/models/dd87adcff26b46e58639e9256f5301c4/embed",
  "F-16C Fighting Falcon": "https://sketchfab.com/models/f0b00989e5634764848ef2c235c64db5/embed",
  "F-35B Lightning II": "https://sketchfab.com/models/b1ab1c0090e34b0fbfe667e706023e6d/embed",
  "AC-130 Hercules": "https://sketchfab.com/models/361991c9874d4680931b3e0d23500e43/embed",
  "E-3A AWACS": "https://sketchfab.com/models/80164b1137494e468212730872738e12/embed",
  "AH-64 Apache": "https://sketchfab.com/models/c3b58008c46b45048fdd7dd283a3c8c8/embed",
  "CH-47 Chinook": "https://sketchfab.com/models/cdac73e931f6482e86960a326fef73bf/embed",
  "Hovering Recon Drone": "https://sketchfab.com/models/eac2b4bc20f54b3ba8c3ddbcdf03c8d6/embed",
  "M1 Abrams": "https://sketchfab.com/models/2577a4eccbc74b2da6dba5bfd09b7511/embed",
  "T-72A MBT": "https://sketchfab.com/models/f55f5b31539f4586b6b75e162af65b77/embed",
  "M2 Bradley IFV": "https://sketchfab.com/models/ab022158ab5f4fbfa55d4142db7595ab/embed",
  "BMP-2 IFV": "https://sketchfab.com/models/2ad92d48e2054b179bd2a5474efc86ac/embed",
  "HMMWV Transport": "https://sketchfab.com/models/bdf3dea0dd254d6280e4ac0d29719115/embed",
  "Technical (Armed Pickup)": "https://sketchfab.com/models/bc5604e0a7b341909de1077d0b3bc176/embed",
  "M142 HIMARS": "https://sketchfab.com/models/53c53a112c674d29a2afdbddbe3cecb5/embed",
  "M777 Howitzer": "https://sketchfab.com/models/a17c26dbc0394579b7072ae1faf7be34/embed",
  "M224 Mortar": "https://sketchfab.com/models/c86a73e40d994431bcdb57dc741cf8be/embed",
  "DDG-51 Arleigh Burke": "https://sketchfab.com/models/17be09c31c6047e4a5969b68c29eba03/embed",
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

  // ── Russia ───────────────────────────────────────────────────────────────
  // T-90A (best free proxy for T-90M) — Lasha-Georgy Bajadze, highly detailed
  "T-90M Proryv MBT": "https://sketchfab.com/models/c9a5bbaf23ad47ad90586395629a2d1c/embed",
  // T-14 Armata — Austrian 3D Art, accurate geometry
  "T-14 Armata MBT": "https://sketchfab.com/models/b2aadbb1fadb430eb9dacef864cea36d/embed",
  // BMP-3 — 42manako, fully detailed crew compartment
  "BMP-3 IFV": "https://sketchfab.com/models/7bcaacdbdc4a409f9fa69e6a8c0e76c3/embed",
  // BTR-82A — 42manako, 30mm cannon variant
  "BTR-82A APC": "https://sketchfab.com/models/5c10df6da4154042a481fe89fd688fdb/embed",
  // Su-35S Flanker-E — andertan, free accurate model
  "Su-35S Flanker-E": "https://sketchfab.com/models/c98cf9b3b3e04017a04732798a31888a/embed",
  // Su-34 Fullback — 42manako, "24 Red" livery
  "Su-34 Fullback": "https://sketchfab.com/models/66e6f5299cf947bd9509316397c79ee2/embed",
  // Su-57 Felon — andertan, free
  "Su-57 Felon": "https://sketchfab.com/models/09d546b4355c4fa6882ca46e05069bee/embed",
  // Ka-52 Alligator — 42manako, free
  "Ka-52 Alligator": "https://sketchfab.com/models/9b31733ceed24be49b2f621487b35ea9/embed",
  // Mi-28NM Night Hunter — vodiva83, Blender/Substance PBR
  "Mi-28NM Night Hunter": "https://sketchfab.com/models/9d99af0b263b43fd90588de3e3714094/embed",
  // Pantsir-S1 — 42manako retexture, low-poly game-ready
  "Pantsir-S1": "https://sketchfab.com/models/6a32352b302848508774583a58659211/embed",
  // Iskander-M — 42manako 9K720 TELAR (transporter/erector/launcher)
  "Iskander-M": "https://sketchfab.com/models/1fff10b191114e638a1a261e70480fb1/embed",

  // ── Iran ─────────────────────────────────────────────────────────────────
  // Shahed-136 — Chenzoss, 120k tri accurate recreation
  "Shahed-136 Loitering Munition": "https://sketchfab.com/models/af8ac3d45ade494fb280c99922513ae2/embed",

  // ── ISIS / Non-State ──────────────────────────────────────────────────────
  // Toyota Hilux Technical — reuses existing armed-pickup model (best proxy)
  "Toyota Hilux Technical (HMG)": "https://sketchfab.com/models/bc5604e0a7b341909de1077d0b3bc176/embed",
  // Captured T-55 — SGAstudio T54/55, game-ready medium-poly
  "Captured T-55": "https://sketchfab.com/models/6bde9f748c3e472e878d333998b506f9/embed",
  // ZU-23-2 — Rolando Garro Mena, free 6k-tri model
  "ZU-23-2 AA Gun": "https://sketchfab.com/models/6e9aeca2844e4ceeb7cf1301337d1b94/embed",
  // RPG-7 — ArtEast, high-res textures 4096px
  "RPG-7 Team": "https://sketchfab.com/models/23d13d69b7ab4ea1a438c57ca3a234b4/embed",
};

const SKETCHFAB_PARAMS = "autostart=1&transparent=1&ui_theme=dark&ui_controls=0&ui_infos=0&ui_watermark_link=0&ui_watermark=0&ui_help=0&ui_settings=0&ui_inspector=0&ui_annotations=0&ui_stop=0&ui_vr=0&ui_fullscreen=0&ui_hint=0";

const SIDE_COLORS: Record<string, string> = {
  blue: "#00A8DC",     // friendly
  red: "#FF3031",      // hostile
  civilian: "#C87619", // orange
};

const STATUS_COLORS: Record<string, string> = {
  active: "#32A467",        // greenLt
  moving: "#00A8DC",        // friendly
  damaged: "#EC9A3C",       // orangeLt
  destroyed: "#E76A6E",     // redLt
  holding: "#4C90F0",       // blueLt
  rtb: "#E76A6E",           // redLt
  on_mission: "#C87619",    // orange
  suppressed_moving: "#FFA500",
};

function TelRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[9px] text-[var(--om-text-muted)] uppercase tracking-[0.1em]">{label}</span>
      <span
        className={`text-[10px] truncate max-w-[140px] ${mono ? "text-[var(--om-text-secondary)]" : "text-[var(--om-text-primary)]"}`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function AssetDetailPanel({
  asset,
  onClose,
}: {
  asset: SimAsset;
  onClose: () => void;
}) {
  const side = asset.faction_id;
  const color = SIDE_COLORS[side] ?? "#94A3B8";
  const embedUrl = ASSET_EMBED_MAP[asset.asset_type];
  const embedSrc = embedUrl
    ? embedUrl + (embedUrl.includes("?") ? "&" : "?") + SKETCHFAB_PARAMS
    : null;

  return (
    <div className="flex flex-col border-b border-[var(--om-border)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--om-border)]">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="w-2 h-2 shrink-0" style={{ background: color }} />
          <span className="text-[11px] font-bold text-[var(--om-text-primary)] truncate">{asset.callsign}</span>
          <span
            className="text-[8px] font-bold px-1.5 py-px shrink-0"
            style={{ background: (STATUS_COLORS[asset.status] ?? "#64748B") + "20", color: STATUS_COLORS[asset.status] ?? "#64748B" }}
          >
            {asset.status.toUpperCase()}
          </span>
          {asset.is_suppressed && (
            <span
              className="text-[8px] font-bold px-1.5 py-px shrink-0 animate-pulse"
              style={{ background: "#FFA50030", color: "#FFA500" }}
            >
              SUPPRESSED
            </span>
          )}
          {asset.status === "rtb" && (
            <span
              className="text-[8px] font-bold px-1.5 py-px shrink-0"
              style={{ background: "#E76A6E30", color: "#E76A6E" }}
            >
              RETREATING
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-[var(--om-text-muted)] hover:text-[var(--om-text-secondary)] transition-colors cursor-pointer shrink-0">
          <X size={13} />
        </button>
      </div>

      {/* 3D Model — Sketchfab embed */}
      {embedSrc && (
        <div className="w-full h-[150px] border-b border-[var(--om-border)] overflow-hidden relative">
          <iframe
            title={asset.asset_type}
            src={embedSrc}
            allow="autoplay; fullscreen; xr-spatial-tracking"
            style={{
              border: "none",
              background: "#1E2229",
              position: "absolute",
              top: 0,
              left: 0,
              width: "calc(100% + 40px)",
              height: "calc(100% + 40px)",
            }}
          />
        </div>
      )}

      {/* Asset type label */}
      <div className="px-3 py-1.5 border-b border-[var(--om-border)]">
        <span className="text-[10px] text-[var(--om-text-secondary)]">{asset.asset_type}</span>
        <span className="text-[9px] text-[var(--om-text-disabled)] ml-2">({asset.faction_id.toUpperCase()})</span>
      </div>

      {/* Telemetry */}
      <div className="px-3 py-2 space-y-1">
        <TelRow label="Lat / Lon" value={`${asset.position.latitude.toFixed(4)}, ${asset.position.longitude.toFixed(4)}`} />
        <TelRow label="Altitude" value={`${asset.position.altitude_m.toFixed(0)} m`} />
        <TelRow label="Heading" value={`${asset.position.heading_deg.toFixed(1)}°`} />
        <TelRow label="Speed" value={`${asset.speed_kmh} km/h`} />
        <TelRow label="Health" value={`${(asset.health * 100).toFixed(0)}%`} color={asset.health > 0.5 ? "#32A467" : asset.health > 0.2 ? "#EC9A3C" : "#E76A6E"} />
        {asset.is_suppressed && (
          <TelRow label="Suppressed until" value={`tick ${asset.suppressed_until_tick}`} color="#FFA500" />
        )}
        {asset.sensor_type && <TelRow label="Sensor" value={asset.sensor_type} />}
        {asset.weapons.length > 0 && <TelRow label="Weapons" value={asset.weapons.join(", ")} />}
        <TelRow label="Asset ID" value={asset.asset_id} mono />
      </div>
    </div>
  );
}
