"use client";

/**
 * Design System Showcase — /design
 *
 * Isolated from the main app. All styling is scoped inline.
 * Nothing here bleeds into the rest of the application.
 */

import { useState } from "react";
import {
  Crosshair,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  Plus,
  ChevronDown,
  Search as SearchIcon,
  Settings,
  X,
  MapPin,
  Compass,
  Minus,
  Database,
  RefreshCw,
  Wrench,
  Target,
  Truck,
  Plane,
  Navigation,
  Eye,
  Shield,
  Layers,
  Mountain,
  Radio,
  Sparkles,
  Check,
  Info,
  ArrowRight,
  Bomb,
  LocateFixed,
  type LucideIcon,
} from "lucide-react";

// ── Scoped design tokens (not CSS vars — all inline) ────────────────────────

const T = {
  // Surfaces — neutral charcoal grays, lighter range (matched from Palantir screenshots)
  bgDeep:      "#1E2229",
  bgPrimary:   "#252A31",
  bgElevated:  "#2D323A",
  bgSurface:   "#353B44",
  bgHover:     "#3D434C",
  bgActive:    "#474E58",

  // Borders
  border:       "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  borderFocus:  "rgba(45,114,210,0.6)",

  // Text
  textPrimary:   "#E2E8F0",
  textSecondary: "#94A3B8",
  textMuted:     "#64748B",
  textDisabled:  "#475569",

  // Accents
  blue:    "#2D72D2",
  blueLt:  "#4C90F0",
  green:   "#238551",
  greenLt: "#32A467",
  orange:  "#C87619",
  orangeLt:"#EC9A3C",
  red:     "#CD4246",
  redLt:   "#E76A6E",

  // Force affiliation
  friendly: "#00A8DC",
  hostile:  "#FF3031",
  neutral:  "#00E200",
  unknown:  "#FFFF00",

  // Categorical
  cerulean:  "#147EB3",
  gold:      "#D1980B",
  rose:      "#DB2C6F",
  violet:    "#9D3F9D",
  turquoise: "#00A396",
  vermilion: "#D33D17",

  // Fonts — system font stack (matches Blueprint / Palantir Foundry)
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', Consolas, monospace",

  // Radii
  radius: "2px",
} as const;

// ── Tiny icon helper ─────────────────────────────────────────────────────────

function Icon({ icon: LIcon, size = 12, color = T.textMuted, style }: { icon: LucideIcon; size?: number; color?: string; style?: React.CSSProperties }) {
  return <LIcon size={size} color={color} style={{ flexShrink: 0, ...style }} />;
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 48 }}>
      <h2
        style={{
          fontFamily: T.fontSans,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          color: T.textMuted,
          marginBottom: 16,
          paddingBottom: 8,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ gap = 12, children, wrap = false }: { gap?: number; children: React.ReactNode; wrap?: boolean }) {
  return (
    <div style={{ display: "flex", gap, alignItems: "flex-start", flexWrap: wrap ? "wrap" : "nowrap" }}>
      {children}
    </div>
  );
}

// ── Primitive components ─────────────────────────────────────────────────────

function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        backgroundColor: color,
        boxShadow: pulse ? `0 0 6px ${color}` : undefined,
        animation: pulse ? "ds-pulse 1.8s ease-in-out infinite" : undefined,
        flexShrink: 0,
      }}
    />
  );
}

function Badge({ label, color, variant = "filled" }: { label: string; color: string; variant?: "filled" | "outline" | "subtle" }) {
  const bg = variant === "filled" ? color : variant === "subtle" ? `${color}20` : "transparent";
  const textColor = variant === "filled" ? "#fff" : color;
  const border = variant === "outline" ? `1px solid ${color}50` : variant === "subtle" ? `1px solid ${color}25` : "none";
  return (
    <span
      style={{
        fontFamily: T.fontSans, fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
        padding: "2px 8px", borderRadius: T.radius, backgroundColor: bg,
        color: textColor, border, display: "inline-flex", alignItems: "center", gap: 4, lineHeight: "16px",
      }}
    >
      {label}
    </span>
  );
}

function DataCell({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        flex: 1, padding: "8px 12px", background: T.bgSurface,
        borderRight: `1px solid ${T.border}`, textAlign: "center" as const,
      }}
    >
      <div style={{ fontFamily: T.fontSans, fontSize: 10, color: T.textMuted, marginBottom: 2, letterSpacing: "0.02em" }}>
        {label}
      </div>
      <div style={{ fontFamily: mono ? T.fontMono : T.fontSans, fontSize: 14, fontWeight: 500, color: T.textPrimary }}>
        {value}
      </div>
    </div>
  );
}

// ── Metric gauge (arc dial from Maven AI metrics panel) ──────────────────────

function MetricGauge({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const r = 28;
  const cx = 36;
  const cy = 36;
  const startX = cx - r;
  const startY = cy;
  const endX = cx + r * Math.cos(Math.PI - (angle * Math.PI) / 180);
  const endY = cy - r * Math.sin((angle * Math.PI) / 180);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div
      style={{
        flex: 1, padding: "12px 8px", background: T.bgSurface, border: `1px solid ${T.border}`,
        borderRadius: T.radius, display: "flex", flexDirection: "column" as const,
        alignItems: "center", gap: 4, minWidth: 100,
      }}
    >
      <div style={{ fontFamily: T.fontSans, fontSize: 10, color: T.textMuted, textAlign: "center" as const }}>
        {label}
      </div>
      <svg width="72" height="40" viewBox="0 0 72 40">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={T.bgHover} strokeWidth="4" />
        {pct > 0 && (
          <path
            d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
            fill="none" stroke={T.blueLt} strokeWidth="4" strokeLinecap="round"
          />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 500, fill: T.blueLt }}>
          {value}
        </text>
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: T.fontMono, fontSize: 11, color: T.textMuted }}>
        <Minus size={12} color={T.textMuted} style={{ cursor: "pointer" }} />
        <span>{value}</span>
        <Plus size={12} color={T.textMuted} style={{ cursor: "pointer" }} />
      </div>
    </div>
  );
}

// ── Complex components ───────────────────────────────────────────────────────

function AssetPairingCard() {
  return (
    <div
      style={{
        width: 420, background: T.bgElevated, border: `1px solid ${T.greenLt}50`,
        borderRadius: T.radius, overflow: "hidden", fontFamily: T.fontSans,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Sparkles} size={14} color={T.blueLt} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.blueLt }}>Top Match</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Pencil} size={11} color={T.textMuted} />
          <span style={{ fontSize: 11, color: T.textMuted }}>Edit Asset</span>
          <Icon icon={Check} size={13} color={T.greenLt} />
        </div>
      </div>

      {/* Asset <-> Target */}
      <div style={{ display: "flex", padding: "14px", gap: 0, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ flex: 1, paddingRight: 14, borderRight: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon icon={Truck} size={16} color={T.friendly} />
            <span style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>STRYKER1</span>
          </div>
          <Badge label="M2 .50 cal (750x)" color={T.textMuted} variant="outline" />
        </div>
        <div style={{ flex: 1, paddingLeft: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon icon={Crosshair} size={14} color={T.hostile} />
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Computer Vision Detection</span>
          </div>
          <span style={{ fontSize: 11, color: T.textSecondary }}>2x Aimpoints</span>
        </div>
      </div>

      {/* Telemetry strip */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
        <DataCell label="Elevation" value="599 ft" />
        <DataCell label="Speed" value="0 km/h" />
        <DataCell label="Heading" value="000" />
      </div>

      {/* Munitions section */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.textMuted }}>
            Munitions
          </span>
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: T.textMuted, fontFamily: T.fontMono }}>
            AVAIL · ALLOC · SPENT
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon icon={Bomb} size={14} color={T.textSecondary} />
            <span style={{ fontSize: 12, color: T.textPrimary }}>M2 .50 cal</span>
          </div>
          <span style={{ fontSize: 12, fontFamily: T.fontMono, color: T.textSecondary }}>750 · 0 · 0</span>
        </div>
      </div>

      {/* Time/Distance strip */}
      <div style={{ display: "flex", background: `${T.blue}15`, borderBottom: `1px solid ${T.blue}30` }}>
        <DataCell label="Time to Target" value="4m 23s" />
        <DataCell label="Distance" value="141.8nm" />
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StatusDot color={T.greenLt} pulse />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.greenLt, letterSpacing: "0.04em" }}>LIVE</span>
          <span style={{ fontSize: 10, color: T.textMuted }}>(updated 0 seconds ago)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textMuted }}>
          <Icon icon={Database} size={11} color={T.textMuted} />
          <span>Simulation</span>
        </div>
      </div>
    </div>
  );
}

function BDATable() {
  const rows: { label: string; status: string; statusColor: string; conf: string; statusIcon: LucideIcon }[] = [
    { label: "CA/PDA", status: "Destroyed", statusColor: T.redLt, conf: "Confirmed (>95%)", statusIcon: Flame },
    { label: "FDA", status: "Functionally destroyed", statusColor: T.redLt, conf: "Confirmed (>95%)", statusIcon: Flame },
    { label: "CDA", status: "No collateral damage", statusColor: T.greenLt, conf: "Confirmed (>95%)", statusIcon: CheckCircle2 },
  ];

  const meaRows = [
    { label: "48.71898...", tags: ["Effect achieved", "Hit"], conf: "Confirmed (>95%)" },
    { label: "48.72050...", tags: [] as string[], conf: "No confidence level", muted: true },
    { label: "Compute...", tags: ["Effect achieved", "Hit"], conf: "Confirmed (>95%)" },
  ];

  return (
    <div style={{ width: 520, background: T.bgElevated, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden", fontFamily: T.fontSans }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Crosshair} size={14} color={T.textMuted} />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>Computer Vision Detection</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.blueLt, cursor: "pointer" }}>
          <Icon icon={Plus} size={12} color={T.blueLt} />
          <span>Add new</span>
          <Icon icon={ChevronDown} size={10} color={T.blueLt} />
        </div>
      </div>

      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "grid", gridTemplateColumns: "100px 1fr 160px 30px",
            alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 600, color: T.textPrimary }}>{row.label}</span>
          <span>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px",
                borderRadius: T.radius, background: `${row.statusColor}18`, color: row.statusColor,
                fontSize: 11, fontWeight: 500,
              }}
            >
              <Icon icon={row.statusIcon} size={11} color={row.statusColor} />
              {row.status}
            </span>
          </span>
          <span style={{ color: T.textSecondary, fontWeight: 500 }}>{row.conf}</span>
          <span style={{ textAlign: "center" as const, cursor: "pointer" }}>
            <Icon icon={Pencil} size={11} color={T.textMuted} />
          </span>
        </div>
      ))}

      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>MEA</span>
      </div>

      {meaRows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "grid", gridTemplateColumns: "100px 1fr 160px 30px",
            alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 12,
          }}
        >
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textSecondary }}>{row.label}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {row.tags.length > 0 ? (
              row.tags.map((tag, j) => (
                <span
                  key={j}
                  style={{
                    padding: "2px 8px", borderRadius: T.radius,
                    background: tag === "Hit" ? `${T.greenLt}18` : `${T.redLt}18`,
                    color: tag === "Hit" ? T.greenLt : T.redLt,
                    fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  {tag === "Hit" && <Icon icon={Target} size={10} color={T.greenLt} />}
                  {tag === "Effect achieved" && <Icon icon={Flame} size={10} color={T.redLt} />}
                  {tag}
                </span>
              ))
            ) : (
              <span style={{ color: T.textDisabled, fontSize: 11, fontStyle: "italic" }}>No weapon effectiveness</span>
            )}
          </div>
          <span style={{ color: row.muted ? T.textDisabled : T.textSecondary, fontWeight: 500, fontStyle: row.muted ? "italic" : "normal" }}>
            {row.conf}
          </span>
          <span style={{ textAlign: "center" as const, cursor: "pointer" }}>
            {row.tags.length > 0
              ? <Icon icon={Pencil} size={11} color={T.textMuted} />
              : <Icon icon={Plus} size={11} color={T.textMuted} />
            }
          </span>
        </div>
      ))}
    </div>
  );
}

function TargetCard({
  id, title, subtitle, stage, stageColor, time, expired = false, highlighted = false,
}: {
  id: string; title: string; subtitle?: string; stage: string; stageColor: string;
  time: string; expired?: boolean; highlighted?: boolean;
}) {
  return (
    <div
      style={{
        background: highlighted ? `${T.violet}20` : T.bgSurface,
        border: `1px solid ${highlighted ? `${T.violet}40` : T.border}`,
        borderRadius: T.radius, padding: "10px 12px", fontFamily: T.fontSans,
        width: "100%", position: "relative" as const,
      }}
    >
      {expired && (
        <div style={{ fontSize: 9, color: T.orangeLt, fontWeight: 500, marginBottom: 4 }}>
          Time on target is <span style={{ fontWeight: 700, color: T.orangeLt }}>expired</span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon icon={Crosshair} size={12} color={T.hostile} />
        <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.textMuted, fontWeight: 500 }}>{id}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{title}</span>
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, marginLeft: 20 }}>{subtitle}</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Badge label={stage} color={stageColor} variant="subtle" />
        <span style={{ fontSize: 10, color: T.textDisabled }}>{time}</span>
      </div>
      <div style={{ position: "absolute" as const, top: 8, right: 8 }}>
        <Icon icon={AlertTriangle} size={10} color={T.orangeLt} />
      </div>
    </div>
  );
}

function TargetListItem({
  title, subtitle, stage, stageColor, piLabel, selected = false,
}: {
  title: string; subtitle: string; stage: string; stageColor: string;
  piLabel?: string; selected?: boolean;
}) {
  return (
    <div
      style={{
        background: selected ? `${T.blue}15` : T.bgElevated,
        border: `1px solid ${selected ? `${T.blue}35` : T.border}`,
        borderRadius: T.radius, padding: "10px 12px", fontFamily: T.fontSans, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon icon={Crosshair} size={12} color={T.hostile} />
          <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{title}</span>
        </div>
        {piLabel && (
          <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, background: T.bgActive, padding: "1px 5px", borderRadius: T.radius }}>
            {piLabel}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: T.textSecondary, marginBottom: 6, marginLeft: 20 }}>{subtitle}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginLeft: 20 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Badge label="ECD" color={T.textMuted} variant="outline" />
          <Badge label={stage} color={stageColor} variant="subtle" />
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, fontFamily: T.fontMono, color: T.textMuted }}>MS</span>
      </div>
    </div>
  );
}

function TelemetryPanel() {
  const fields = [
    { section: "PLATFORM", items: [
      { label: "Altitude (MSL)", value: "758m" },
      { label: "Heading", value: "10.84°" },
      { label: "Pitch", value: "2.90°" },
      { label: "Roll", value: "-17.54°" },
      { label: "Location", value: "10SEG 54018 99428" },
    ]},
    { section: "SENSOR", items: [
      { label: "Type", value: "FLIR SS380-HD HDEO" },
      { label: "Relative Azimuth", value: "269.83°" },
      { label: "Relative Roll", value: "0°" },
      { label: "Relative Elevation", value: "-22.67°" },
      { label: "SPI Location", value: "10SEG 53152 99623" },
      { label: "SPI Elevation", value: "11.27m" },
    ]},
  ];

  return (
    <div
      style={{
        width: 260, background: T.bgElevated, border: `1px solid ${T.border}`,
        borderRadius: T.radius, overflow: "hidden", fontFamily: T.fontSans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>Telemetry</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Icon icon={Settings} size={11} color={T.textMuted} style={{ cursor: "pointer" }} />
          <Icon icon={X} size={11} color={T.textMuted} style={{ cursor: "pointer" }} />
        </div>
      </div>

      {/* Compass */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 8px", borderBottom: `1px solid ${T.border}` }}>
        <div
          style={{
            width: 80, height: 80, borderRadius: "50%", border: `2px solid ${T.borderStrong}`,
            display: "flex", alignItems: "center", justifyContent: "center", position: "relative" as const,
          }}
        >
          <span style={{ position: "absolute" as const, top: 4, fontSize: 9, fontWeight: 700, color: T.textPrimary }}>N</span>
          <span style={{ position: "absolute" as const, right: 4, fontSize: 9, color: T.textMuted }}>E</span>
          <span style={{ position: "absolute" as const, bottom: 4, fontSize: 9, color: T.textMuted }}>S</span>
          <span style={{ position: "absolute" as const, left: 4, fontSize: 9, color: T.textMuted }}>W</span>
          <Icon icon={Plane} size={22} color={T.friendly} />
        </div>
      </div>
      <div style={{ padding: "4px 12px 8px", textAlign: "center" as const, borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 9, color: T.textDisabled, fontStyle: "italic" }}>Notional — may not reflect actual aircraft type</span>
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 11, color: T.textPrimary }}>Use modified telemetry</span>
        <div style={{ width: 32, height: 16, borderRadius: 8, background: T.blue, display: "flex", alignItems: "center", padding: 2, cursor: "pointer" }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#fff", marginLeft: "auto" }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 11, color: T.textMuted }}>Source</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: T.textPrimary }}>Palantir</span>
      </div>

      {fields.map((section) => (
        <div key={section.section}>
          <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: T.textMuted }}>
            {section.section}
          </div>
          {section.items.map((item) => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "4px 12px", fontSize: 11 }}>
              <span style={{ color: T.textMuted }}>{item.label}</span>
              <span style={{ fontFamily: T.fontMono, color: T.textPrimary, fontWeight: 400 }}>{item.value}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ToolsPanel() {
  const groups: { icon: LucideIcon; title: string; desc: string; link?: string; tools: string[] }[] = [
    {
      icon: LocateFixed,
      title: "Range ring",
      desc: "Calculate the distance between any given point and an object or target",
      tools: ["Range ring", "Intervisibility", "Ballistic"],
    },
    {
      icon: AlertTriangle,
      title: "Alerts",
      desc: "Get alerted when entities enter a designated region based on your selections and alert conditions",
      tools: ["Geofence", "Proximity"],
    },
    {
      icon: Mountain,
      title: "Terrain",
      desc: "Analyze terrain and land cover in an area to inform movement",
      link: "Guided workflow",
      tools: ["Slope", "Land cover", "Pathways", "Projection", "Route"],
    },
    {
      icon: Shield,
      title: "Key terrain",
      desc: "Detect important terrain features in an area",
      link: "Guided workflow",
      tools: ["Peaks", "Bridges", "Key terrain"],
    },
  ];

  return (
    <div
      style={{
        width: 260, background: T.bgElevated, border: `1px solid ${T.border}`,
        borderRadius: T.radius, overflow: "hidden", fontFamily: T.fontSans,
      }}
    >
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>
        {["Map layers", "Data sources", "Tools"].map((tab, i) => (
          <div
            key={tab}
            style={{
              flex: 1, padding: "8px 8px", textAlign: "center" as const, fontSize: 11,
              fontWeight: i === 2 ? 600 : 400, color: i === 2 ? T.blueLt : T.textMuted,
              borderBottom: i === 2 ? `2px solid ${T.blueLt}` : "2px solid transparent", cursor: "pointer",
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 10px", background: T.bgSurface, border: `1px solid ${T.border}`,
            borderRadius: T.radius, fontSize: 11, color: T.textDisabled,
          }}
        >
          <Icon icon={SearchIcon} size={11} color={T.textDisabled} />
          Find...
        </div>
      </div>

      {groups.map((group) => (
        <div key={group.title} style={{ padding: "12px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon icon={group.icon} size={14} color={T.textSecondary} />
            <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>{group.title}</span>
          </div>
          <p style={{ fontSize: 10, color: T.textMuted, lineHeight: "1.5", margin: "0 0 8px 0" }}>
            {group.desc}
          </p>
          {group.link && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.blueLt, marginBottom: 8, cursor: "pointer" }}>
              {group.link} <Icon icon={ArrowRight} size={10} color={T.blueLt} />
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 6 }}>
            {group.tools.map((tool) => (
              <div
                key={tool}
                style={{
                  padding: "6px 12px", background: T.bgSurface, border: `1px solid ${T.border}`,
                  borderRadius: T.radius, fontSize: 11, color: T.textSecondary, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <div style={{ width: 16, height: 16, background: T.bgActive, borderRadius: 2 }} />
                {tool}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AIMetricsPanel() {
  return (
    <div
      style={{
        width: 520, background: T.bgElevated, border: `1px solid ${T.blue}30`,
        borderRadius: T.radius, overflow: "hidden", fontFamily: T.fontSans,
      }}
    >
      <div
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px", borderBottom: `1px solid ${T.border}`, background: `${T.blue}08`,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: T.textPrimary }}>Choose which metrics AI should prioritize</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Icon icon={Info} size={14} color={T.textMuted} style={{ cursor: "pointer" }} />
          <Icon icon={Settings} size={14} color={T.textMuted} style={{ cursor: "pointer" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, padding: 1, background: T.border }}>
        <MetricGauge label="AGM Match (Effect Priority)" value={30} />
        <MetricGauge label="Time to Target" value={50} />
        <MetricGauge label="Distance" value={10} />
        <MetricGauge label="Time on Station" value={20} />
        <MetricGauge label="Fuel" value={40} />
        <MetricGauge label="Munitions" value={10} />
      </div>

      <div style={{ textAlign: "center" as const, padding: "10px", borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted, cursor: "pointer" }}>
        Show all metrics (+7)
      </div>

      <div style={{ display: "flex", borderTop: `1px solid ${T.border}` }}>
        <button
          style={{
            flex: 1, padding: "10px", background: `${T.blue}12`, border: "none",
            borderRight: `1px solid ${T.border}`, color: T.blueLt, fontSize: 12,
            fontWeight: 500, cursor: "pointer", fontFamily: T.fontSans,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Icon icon={Wrench} size={13} color={T.blueLt} /> Optimize Recommender
        </button>
        <button
          style={{
            flex: 1, padding: "10px", background: `${T.blue}12`, border: "none",
            color: T.blueLt, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: T.fontSans,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Icon icon={RefreshCw} size={13} color={T.blueLt} /> Continuous Optimization On
        </button>
      </div>
    </div>
  );
}

// ── Chrome components ────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div
      style={{
        height: 36, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px", background: T.bgElevated, borderBottom: `1px solid ${T.border}`, fontFamily: T.fontSans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 18, height: 18, borderRadius: "50%", background: T.hostile,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <Icon icon={Radio} size={10} color="#fff" />
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary, letterSpacing: "0.14em", textTransform: "uppercase" as const }}>
            OpenMaven
          </span>
        </div>

        <div style={{ width: 1, height: 16, background: T.border }} />

        {["Map", "Targets", "Intel", "Assets"].map((tab, i) => (
          <span
            key={tab}
            style={{
              fontSize: 11, fontWeight: i === 0 ? 600 : 400,
              color: i === 0 ? T.textPrimary : T.textMuted,
              padding: "4px 10px", borderRadius: T.radius,
              background: i === 0 ? `${T.blue}15` : "transparent", cursor: "pointer",
            }}
          >
            {tab}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textMuted, letterSpacing: "0.02em" }}>
          28MAR2026 14:30:19Z
        </span>
        <div style={{ width: 1, height: 16, background: T.border }} />
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
            background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: T.radius,
            fontSize: 11, color: T.textDisabled, width: 160,
          }}
        >
          <Icon icon={SearchIcon} size={11} color={T.textDisabled} />
          Search
        </div>
      </div>
    </div>
  );
}

function BottomBar() {
  return (
    <div
      style={{
        height: 28, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 12px", background: T.bgElevated, borderTop: `1px solid ${T.border}`, fontFamily: T.fontSans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {[
          { label: "BLUFOR", count: 24, color: T.friendly },
          { label: "OPFOR", count: 18, color: T.hostile },
          { label: "NEUTRAL", count: 6, color: T.neutral },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StatusDot color={item.color} />
            <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 600, color: item.color }}>{item.count}</span>
            <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.04em" }}>{item.label}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textMuted }}>TICK 1,247</span>
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.greenLt }}>2x</span>
        <StatusDot color={T.greenLt} pulse />
        <span style={{ fontSize: 9, color: T.greenLt, fontWeight: 600 }}>CONNECTED</span>
      </div>
    </div>
  );
}

// ── Logo concepts ───────────────────────────────────────────────────────────

/**
 * Concept A — "Panopticon"
 * All-seeing eye formed from concentric radar arcs and a central aperture.
 * Conveys surveillance, awareness, omniscience.
 */
function LogoA({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Outer ring */}
      <circle cx="24" cy="24" r="22" stroke={T.friendly} strokeWidth="1.5" opacity="0.3" />
      {/* Radar arc top-right */}
      <path d="M24 6 A18 18 0 0 1 42 24" stroke={T.friendly} strokeWidth="2" strokeLinecap="round" />
      {/* Radar arc bottom-left */}
      <path d="M24 42 A18 18 0 0 1 6 24" stroke={T.friendly} strokeWidth="2" strokeLinecap="round" />
      {/* Inner ring */}
      <circle cx="24" cy="24" r="10" stroke={T.friendly} strokeWidth="1.5" />
      {/* Aperture / pupil */}
      <circle cx="24" cy="24" r="4" fill={T.friendly} />
      {/* Cross-hairs */}
      <line x1="24" y1="2" x2="24" y2="8" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="40" x2="24" y2="46" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="2" y1="24" x2="8" y2="24" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="40" y1="24" x2="46" y2="24" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/**
 * Concept B — "Maven Eye"
 * Almond-shaped eye with a network graph iris.
 * Merges the "knowledge graph" concept with surveillance.
 */
function LogoB({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Eye shape — almond outline */}
      <path
        d="M4 24 C4 24 12 8 24 8 C36 8 44 24 44 24 C44 24 36 40 24 40 C12 40 4 24 4 24Z"
        stroke={T.friendly}
        strokeWidth="1.8"
        fill="none"
      />
      {/* Iris ring */}
      <circle cx="24" cy="24" r="9" stroke={T.friendly} strokeWidth="1.5" />
      {/* Graph nodes inside iris */}
      <circle cx="24" cy="19" r="1.8" fill={T.friendly} />
      <circle cx="20" cy="26" r="1.8" fill={T.friendly} />
      <circle cx="28" cy="26" r="1.8" fill={T.friendly} />
      <circle cx="24" cy="30" r="1.2" fill={T.friendly} opacity="0.6" />
      {/* Graph edges */}
      <line x1="24" y1="19" x2="20" y2="26" stroke={T.friendly} strokeWidth="0.8" opacity="0.7" />
      <line x1="24" y1="19" x2="28" y2="26" stroke={T.friendly} strokeWidth="0.8" opacity="0.7" />
      <line x1="20" y1="26" x2="28" y2="26" stroke={T.friendly} strokeWidth="0.8" opacity="0.7" />
      <line x1="20" y1="26" x2="24" y2="30" stroke={T.friendly} strokeWidth="0.5" opacity="0.4" />
      <line x1="28" y1="26" x2="24" y2="30" stroke={T.friendly} strokeWidth="0.5" opacity="0.4" />
      {/* Pupil glow */}
      <circle cx="24" cy="24" r="3" fill={T.friendly} opacity="0.15" />
    </svg>
  );
}

/**
 * Concept C — "Nexus"
 * Hexagonal frame (military/tactical) with an interconnected node graph inside.
 * Clean, geometric, works well at small sizes.
 */
function LogoC({ size = 48 }: { size?: number }) {
  // Hexagon points (pointy-top)
  const hex = (r: number) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(`${24 + r * Math.cos(a)},${24 + r * Math.sin(a)}`);
    }
    return pts.join(" ");
  };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Outer hex */}
      <polygon points={hex(22)} stroke={T.friendly} strokeWidth="1.5" fill="none" />
      {/* Inner hex faint */}
      <polygon points={hex(13)} stroke={T.friendly} strokeWidth="0.8" fill="none" opacity="0.25" />
      {/* Center node */}
      <circle cx="24" cy="24" r="3.5" fill={T.friendly} />
      {/* Satellite nodes */}
      <circle cx="24" cy="13" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="33" cy="19" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="33" cy="29" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="24" cy="35" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="15" cy="29" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="15" cy="19" r="2" fill={T.friendly} opacity="0.7" />
      {/* Spokes */}
      <line x1="24" y1="24" x2="24" y2="13" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="24" x2="33" y2="19" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="24" x2="33" y2="29" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="24" x2="24" y2="35" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="24" x2="15" y2="29" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="24" x2="15" y2="19" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

/**
 * Concept D — "Scope"
 * Minimalist crosshair with a diamond reticle.
 * Bold, instantly readable at any size. Pure military targeting aesthetic.
 */
function LogoD({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Outer circle */}
      <circle cx="24" cy="24" r="20" stroke={T.friendly} strokeWidth="1.5" />
      {/* Crosshair lines with gap */}
      <line x1="24" y1="2" x2="24" y2="14" stroke={T.friendly} strokeWidth="1.5" />
      <line x1="24" y1="34" x2="24" y2="46" stroke={T.friendly} strokeWidth="1.5" />
      <line x1="2" y1="24" x2="14" y2="24" stroke={T.friendly} strokeWidth="1.5" />
      <line x1="34" y1="24" x2="46" y2="24" stroke={T.friendly} strokeWidth="1.5" />
      {/* Diamond reticle */}
      <path d="M24 17 L31 24 L24 31 L17 24 Z" stroke={T.friendly} strokeWidth="1.5" fill={`${T.friendly}15`} />
      {/* Center dot */}
      <circle cx="24" cy="24" r="2" fill={T.friendly} />
    </svg>
  );
}

/**
 * Concept E — "Shield Network"
 * Shield silhouette (defense/protection) with graph nodes inside.
 * Bridges C2 command authority and intelligence graph.
 */
function LogoE({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Shield outline */}
      <path
        d="M24 4 L40 12 L40 26 C40 34 33 41 24 44 C15 41 8 34 8 26 L8 12 Z"
        stroke={T.friendly}
        strokeWidth="1.8"
        fill={`${T.friendly}08`}
      />
      {/* Inner graph — 5 nodes */}
      <circle cx="24" cy="18" r="2.5" fill={T.friendly} />
      <circle cx="17" cy="26" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="31" cy="26" r="2" fill={T.friendly} opacity="0.7" />
      <circle cx="20" cy="34" r="1.5" fill={T.friendly} opacity="0.5" />
      <circle cx="28" cy="34" r="1.5" fill={T.friendly} opacity="0.5" />
      {/* Edges */}
      <line x1="24" y1="18" x2="17" y2="26" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="24" y1="18" x2="31" y2="26" stroke={T.friendly} strokeWidth="1" opacity="0.5" />
      <line x1="17" y1="26" x2="20" y2="34" stroke={T.friendly} strokeWidth="1" opacity="0.4" />
      <line x1="31" y1="26" x2="28" y2="34" stroke={T.friendly} strokeWidth="1" opacity="0.4" />
      <line x1="17" y1="26" x2="31" y2="26" stroke={T.friendly} strokeWidth="0.8" opacity="0.3" />
      <line x1="20" y1="34" x2="28" y2="34" stroke={T.friendly} strokeWidth="0.8" opacity="0.3" />
    </svg>
  );
}

/**
 * Concept F — "Orbital"
 * Abstract letter M formed from two orbital paths crossing.
 * Sleek, modern, distinctive. Works as both icon and monogram.
 */
function LogoF({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Left arc of M */}
      <path d="M8 40 L8 12 L24 28" stroke={T.friendly} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Right arc of M */}
      <path d="M24 28 L40 12 L40 40" stroke={T.friendly} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Orbital ring */}
      <ellipse cx="24" cy="22" rx="18" ry="8" stroke={T.friendly} strokeWidth="1" opacity="0.3" transform="rotate(-15 24 22)" />
      {/* Node at apex */}
      <circle cx="24" cy="28" r="3" fill={T.friendly} />
      {/* Small orbital dots */}
      <circle cx="10" cy="16" r="1.5" fill={T.friendly} opacity="0.5" />
      <circle cx="38" cy="16" r="1.5" fill={T.friendly} opacity="0.5" />
    </svg>
  );
}

function LogoShowcase({ children, label, description }: { children: React.ReactNode; label: string; description: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 16,
      padding: 24, background: T.bgElevated, border: `1px solid ${T.border}`,
      borderRadius: T.radius, width: 220,
    }}>
      {/* Dark backdrop for the icon */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 96, height: 96, background: T.bgDeep, borderRadius: T.radius,
        border: `1px solid ${T.border}`,
      }}>
        {children}
      </div>
      <div style={{ textAlign: "center" as const }}>
        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: T.fontSans, color: T.textPrimary, marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 10, fontFamily: T.fontSans, color: T.textMuted, lineHeight: 1.5 }}>
          {description}
        </div>
      </div>
    </div>
  );
}

function LogoWordmark({ icon, size = 20 }: { icon: React.ReactNode; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon}
      <span style={{
        fontSize: 14, fontWeight: 600, letterSpacing: "0.18em",
        textTransform: "uppercase" as const, fontFamily: T.fontSans, color: T.textPrimary,
      }}>
        OpenMaven
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DesignPage() {
  const [activeTab, setActiveTab] = useState("components");

  return (
    <div
      style={{
        flex: 1, display: "flex", flexDirection: "column" as const,
        background: T.bgDeep, fontFamily: T.fontSans, color: T.textPrimary, overflow: "auto",
      }}
    >
      <div style={{ padding: "24px 32px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, letterSpacing: "-0.01em" }}>
          Design System
        </h1>
        <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>
          Palantir-inspired tactical C2 components — isolated preview
        </p>
        <div style={{ display: "flex", gap: 0 }}>
          {[/* "logo", */ "components", "layout", "typography", "colors"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px", fontSize: 11, fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? T.textPrimary : T.textMuted,
                background: "none", border: "none",
                borderBottom: activeTab === tab ? `2px solid ${T.blue}` : "2px solid transparent",
                cursor: "pointer", fontFamily: T.fontSans, textTransform: "capitalize" as const,
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "32px", overflow: "auto", flex: 1 }}>
        {activeTab === "logo" && (
          <>
            <Section title="Logo Concepts — Icon Mark">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                <LogoShowcase label="A — Panopticon" description="Radar arcs + central aperture. Surveillance, omniscience.">
                  <LogoA size={64} />
                </LogoShowcase>
                <LogoShowcase label="B — Maven Eye" description="Almond eye with graph iris. Knowledge + surveillance.">
                  <LogoB size={64} />
                </LogoShowcase>
                <LogoShowcase label="C — Nexus" description="Hex frame + node graph. Tactical, geometric, scalable.">
                  <LogoC size={64} />
                </LogoShowcase>
                <LogoShowcase label="D — Scope" description="Crosshair + diamond reticle. Pure targeting aesthetic.">
                  <LogoD size={64} />
                </LogoShowcase>
                <LogoShowcase label="E — Shield Network" description="Shield + graph nodes. Defense authority + intelligence.">
                  <LogoE size={64} />
                </LogoShowcase>
                <LogoShowcase label="F — Orbital M" description="Letter M from orbital paths. Modern monogram.">
                  <LogoF size={64} />
                </LogoShowcase>
              </div>
            </Section>

            <Section title="Wordmark Lockups">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 24 }}>
                {[
                  { label: "Panopticon", el: <LogoA size={24} /> },
                  { label: "Maven Eye", el: <LogoB size={24} /> },
                  { label: "Nexus", el: <LogoC size={24} /> },
                  { label: "Scope", el: <LogoD size={24} /> },
                  { label: "Shield Network", el: <LogoE size={24} /> },
                  { label: "Orbital M", el: <LogoF size={24} /> },
                ].map((item) => (
                  <div key={item.label} style={{
                    display: "flex", alignItems: "center", gap: 24,
                    padding: "12px 20px", background: T.bgElevated,
                    border: `1px solid ${T.border}`, borderRadius: T.radius, width: "fit-content",
                  }}>
                    <LogoWordmark icon={item.el} />
                    <span style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Size Scale">
              <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
                {[16, 24, 32, 48, 64, 96].map((s) => (
                  <div key={s} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8 }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: s + 16, height: s + 16, background: T.bgElevated,
                      border: `1px solid ${T.border}`, borderRadius: T.radius,
                    }}>
                      <LogoC size={s} />
                    </div>
                    <span style={{ fontSize: 9, color: T.textMuted, fontFamily: T.fontMono }}>{s}px</span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="On Surfaces">
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                {[
                  { bg: T.bgDeep, label: "Deep" },
                  { bg: T.bgPrimary, label: "Primary" },
                  { bg: T.bgElevated, label: "Elevated" },
                  { bg: T.bgSurface, label: "Surface" },
                  { bg: "#000000", label: "Black" },
                  { bg: "#FFFFFF", label: "White" },
                ].map((item) => (
                  <div key={item.label} style={{
                    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8,
                    padding: 20, background: item.bg,
                    border: `1px solid ${T.border}`, borderRadius: T.radius, width: 100,
                  }}>
                    <LogoC size={40} />
                    <span style={{
                      fontSize: 9, fontFamily: T.fontMono,
                      color: item.bg === "#FFFFFF" ? "#666" : T.textMuted,
                    }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}

        {activeTab === "components" && (
          <>
            <Section title="Chrome — Top Bar & Status Bar">
              <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden", marginBottom: 24 }}>
                <TopBar />
                <div style={{ height: 120, background: T.bgPrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 11, color: T.textDisabled }}>[ Map canvas area ]</span>
                </div>
                <BottomBar />
              </div>
            </Section>

            <Section title="Asset Pairing Card">
              <AssetPairingCard />
            </Section>

            <Section title="Battle Damage Assessment Table">
              <BDATable />
            </Section>

            <Section title="AI Metrics Prioritization">
              <AIMetricsPanel />
            </Section>

            <Section title="Targeting Kanban Cards">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, maxWidth: 640 }}>
                <TargetCard id="NY2182" title="SAM Site 0018" stage="Kinetic Layer 2" stageColor={T.red} time="1 day ago" expired />
                <TargetCard id="RG8580" title="Computer Vision Detection" subtitle="C2" stage="DYNAMIC" stageColor={T.violet} time="3 hours ago" highlighted />
                <TargetCard id="DM2561" title="Computer Vision Detection" subtitle="C2" stage="PENDING PAIRING" stageColor={T.orange} time="3 hours ago" />
              </div>
            </Section>

            <Section title="Target List Items">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, width: 280 }}>
                <TargetListItem title="Computer Vision Detection" subtitle="Tank · 2 Aimpoints" stage="Pending BDA" stageColor={T.orange} piLabel="P1" />
                <TargetListItem title="Computer Vision Detection" subtitle="Tank · 2 Aimpoints" stage="Deliberate" stageColor={T.red} piLabel="P1" />
                <TargetListItem title="Computer Vision Detection" subtitle="Tank · 2 Aimpoints" stage="In Execution" stageColor={T.green} piLabel="P1" selected />
              </div>
            </Section>

            <Section title="Sidebar Panels">
              <Row gap={16}>
                <TelemetryPanel />
                <ToolsPanel />
              </Row>
            </Section>

            <Section title="Badges & Status Indicators">
              <Row gap={8} wrap>
                <Badge label="FRIENDLY" color={T.friendly} variant="subtle" />
                <Badge label="HOSTILE" color={T.hostile} variant="subtle" />
                <Badge label="NEUTRAL" color={T.neutral} variant="subtle" />
                <Badge label="UNKNOWN" color={T.unknown} variant="subtle" />
                <Badge label="Destroyed" color={T.redLt} variant="filled" />
                <Badge label="Operational" color={T.greenLt} variant="filled" />
                <Badge label="Degraded" color={T.orangeLt} variant="filled" />
                <Badge label="ECD" color={T.textMuted} variant="outline" />
                <Badge label="P1" color={T.textMuted} variant="outline" />
                <Badge label="MS" color={T.textMuted} variant="outline" />
              </Row>
              <div style={{ marginTop: 16 }}>
                <Row gap={16}>
                  <Row gap={6}>
                    <StatusDot color={T.greenLt} pulse />
                    <span style={{ fontSize: 10, color: T.greenLt, fontWeight: 600, fontFamily: T.fontSans }}>LIVE</span>
                  </Row>
                  <Row gap={6}>
                    <StatusDot color={T.hostile} />
                    <span style={{ fontSize: 10, color: T.hostile, fontWeight: 600, fontFamily: T.fontSans }}>CRITICAL</span>
                  </Row>
                  <Row gap={6}>
                    <StatusDot color={T.orangeLt} />
                    <span style={{ fontSize: 10, color: T.orangeLt, fontWeight: 600, fontFamily: T.fontSans }}>WARNING</span>
                  </Row>
                  <Row gap={6}>
                    <StatusDot color={T.blueLt} />
                    <span style={{ fontSize: 10, color: T.blueLt, fontWeight: 600, fontFamily: T.fontSans }}>INFO</span>
                  </Row>
                </Row>
              </div>
            </Section>

            <Section title="Data Readout Strip">
              <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden", width: "fit-content" }}>
                <DataCell label="Latitude" value="33.3128°" />
                <DataCell label="Longitude" value="44.3615°" />
                <DataCell label="Altitude" value="1,200 ft" />
                <DataCell label="Speed" value="450 kts" />
                <DataCell label="Heading" value="270°" />
              </div>
            </Section>
          </>
        )}

        {activeTab === "layout" && (
          <Section title="Full Layout Skeleton">
            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden", height: 500 }}>
              <TopBar />
              <div style={{ display: "flex", flex: 1, height: "calc(100% - 64px)" }}>
                {/* Left sidebar */}
                <div style={{ width: 260, background: T.bgElevated, borderRight: `1px solid ${T.border}`, overflow: "auto", padding: 8 }}>
                  <div style={{ padding: "8px", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: T.textMuted }}>
                    TARGET BOARD
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                    <TargetListItem title="Computer Vision Detection" subtitle="Tank · 2 Aimpoints" stage="Pending BDA" stageColor={T.orange} piLabel="P1" />
                    <TargetListItem title="Computer Vision Detection" subtitle="Tank · 2 Aimpoints" stage="Paired" stageColor={T.blue} piLabel="P1" />
                    <TargetListItem title="Target" subtitle="TEL" stage="Pending BDA" stageColor={T.orange} selected />
                    <TargetListItem title="TEL" subtitle="TEL · No Linked Intelligence" stage="Dynamic" stageColor={T.violet} piLabel="P1" />
                  </div>
                </div>

                {/* Center — map placeholder */}
                <div
                  style={{
                    flex: 1, background: T.bgPrimary, display: "flex", alignItems: "center",
                    justifyContent: "center", position: "relative" as const,
                  }}
                >
                  <span style={{ fontSize: 12, color: T.textDisabled }}>[ Satellite / Map View ]</span>

                  <div
                    style={{
                      position: "absolute" as const, top: "40%", left: "55%",
                      width: 80, height: 80, borderRadius: "50%",
                      border: `2px solid ${T.hostile}40`,
                      animation: "ds-ring 2s ease-out infinite",
                    }}
                  />

                  {/* HUD overlay bottom-right */}
                  <div
                    style={{
                      position: "absolute" as const, bottom: 12, right: 12,
                      background: "rgba(20,20,20,0.85)", backdropFilter: "blur(4px)",
                      border: `1px solid ${T.border}`, borderRadius: T.radius,
                      padding: "6px 10px", fontFamily: T.fontMono, fontSize: 10, color: T.textMuted,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Icon icon={MapPin} size={10} color={T.textMuted} /> 49QFU 44564 60867
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <Icon icon={Navigation} size={9} color={T.textMuted} /> -36.00 m
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <Icon icon={Compass} size={9} color={T.textMuted} /> -2.3°
                      </span>
                    </div>
                  </div>

                  <div style={{ position: "absolute" as const, top: 12, right: 12, display: "flex", gap: 4 }}>
                    <span style={{ padding: "4px 8px", background: "rgba(20,20,20,0.85)", border: `1px solid ${T.border}`, borderRadius: T.radius, fontSize: 9, color: T.textMuted, cursor: "pointer" }}>25°</span>
                  </div>
                </div>

                {/* Right panel */}
                <div style={{ width: 300, background: T.bgElevated, borderLeft: `1px solid ${T.border}`, overflow: "auto", padding: 12 }}>
                  <div
                    style={{
                      background: T.bgSurface, border: `1px solid ${T.border}`,
                      borderRadius: T.radius, padding: "10px 12px", marginBottom: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>Computer Vision Detection</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.blueLt, cursor: "pointer" }}>
                        Task asset <Icon icon={ArrowRight} size={10} color={T.blueLt} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <Badge label="Tank" color={T.textMuted} variant="outline" />
                      <Badge label="2 Aimpoints" color={T.textMuted} variant="outline" />
                    </div>
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, color: T.textMuted, marginBottom: 8 }}>
                    C2 OPERATOR
                  </div>
                  <div
                    style={{
                      background: T.bgSurface, border: `1px solid ${T.border}`,
                      borderRadius: T.radius, padding: "10px 12px", fontSize: 11, color: T.textDisabled,
                    }}
                  >
                    Ask about the battlefield...
                  </div>
                </div>
              </div>
              <BottomBar />
            </div>
          </Section>
        )}

        {activeTab === "typography" && (
          <>
            <Section title="Type Scale — Inter (Sans-Serif)">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                {[
                  { size: 20, weight: 600, lh: 1.4, ls: "-0.02em", label: "Page Title — 20px / 600" },
                  { size: 14, weight: 600, lh: 1.43, ls: "-0.01em", label: "Section Header — 14px / 600" },
                  { size: 13, weight: 400, lh: 1.54, ls: "0em", label: "Body Text — 13px / 400" },
                  { size: 12, weight: 600, lh: 1.33, ls: "0.01em", label: "Subsection — 12px / 600" },
                  { size: 11, weight: 500, lh: 1.45, ls: "0.02em", label: "Label / Caption — 11px / 500" },
                  { size: 10, weight: 600, lh: 1.4, ls: "0.08em", label: "OVERLINE — 10px / 600 / UPPERCASE", upper: true },
                  { size: 9, weight: 400, lh: 1.33, ls: "0.04em", label: "Tiny / Attribution — 9px / 400" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
                    <span
                      style={{
                        fontFamily: T.fontSans, fontSize: item.size, fontWeight: item.weight,
                        lineHeight: item.lh, letterSpacing: item.ls, color: T.textPrimary,
                        textTransform: item.upper ? "uppercase" as const : "none" as const, minWidth: 240,
                      }}
                    >
                      {item.upper ? "Category Overline" : "The quick brown fox"}
                    </span>
                    <span style={{ fontSize: 10, color: T.textDisabled, fontFamily: T.fontMono, whiteSpace: "nowrap" as const }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Type Scale — JetBrains Mono (Data)">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                {[
                  { size: 14, weight: 500, label: "Primary Data — 14px / 500", value: "33.3128° N, 44.3615° E" },
                  { size: 13, weight: 400, label: "Data Value — 13px / 400", value: "450 kts · ALT 1,200 ft · HDG 270°" },
                  { size: 11, weight: 500, label: "Small Data — 11px / 500", value: "TICK 1,247 · 2x · 28MAR2026 14:30Z" },
                  { size: 10, weight: 400, label: "Micro Data — 10px / 400", value: "10SEG 54018 99428 · FLIR SS380-HD" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
                    <span
                      style={{
                        fontFamily: T.fontMono, fontSize: item.size, fontWeight: item.weight,
                        color: T.textPrimary, fontVariantNumeric: "tabular-nums", minWidth: 340,
                      }}
                    >
                      {item.value}
                    </span>
                    <span style={{ fontSize: 10, color: T.textDisabled, fontFamily: T.fontMono, whiteSpace: "nowrap" as const }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Status Labels">
              <Row gap={16} wrap>
                {[
                  { label: "OPERATIONAL", color: T.greenLt },
                  { label: "DEGRADED", color: T.orangeLt },
                  { label: "CRITICAL", color: T.redLt },
                  { label: "FRIENDLY", color: T.friendly },
                  { label: "HOSTILE", color: T.hostile },
                  { label: "UNKNOWN", color: T.unknown },
                ].map((item) => (
                  <span
                    key={item.label}
                    style={{
                      fontFamily: T.fontSans, fontSize: 11, fontWeight: 600,
                      letterSpacing: "0.06em", textTransform: "uppercase" as const, color: item.color,
                    }}
                  >
                    {item.label}
                  </span>
                ))}
              </Row>
            </Section>
          </>
        )}

        {activeTab === "colors" && (
          <>
            <Section title="Surface Palette">
              <Row gap={8} wrap>
                {[
                  { name: "Deep", hex: T.bgDeep },
                  { name: "Primary", hex: T.bgPrimary },
                  { name: "Elevated", hex: T.bgElevated },
                  { name: "Surface", hex: T.bgSurface },
                  { name: "Hover", hex: T.bgHover },
                  { name: "Active", hex: T.bgActive },
                ].map((c) => (
                  <div key={c.name} style={{ width: 80, textAlign: "center" as const }}>
                    <div style={{ width: 80, height: 48, background: c.hex, border: `1px solid ${T.borderStrong}`, borderRadius: T.radius, marginBottom: 4 }} />
                    <div style={{ fontSize: 9, fontWeight: 600, color: T.textSecondary }}>{c.name}</div>
                    <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted }}>{c.hex}</div>
                  </div>
                ))}
              </Row>
            </Section>

            <Section title="Force Affiliation (MIL-STD-2525D)">
              <Row gap={8} wrap>
                {[
                  { name: "Friendly", hex: T.friendly },
                  { name: "Hostile", hex: T.hostile },
                  { name: "Neutral", hex: T.neutral },
                  { name: "Unknown", hex: T.unknown },
                ].map((c) => (
                  <div key={c.name} style={{ width: 80, textAlign: "center" as const }}>
                    <div style={{ width: 80, height: 48, background: c.hex, borderRadius: T.radius, marginBottom: 4 }} />
                    <div style={{ fontSize: 9, fontWeight: 600, color: c.hex }}>{c.name}</div>
                    <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted }}>{c.hex}</div>
                  </div>
                ))}
              </Row>
            </Section>

            <Section title="Semantic / Intent Colors">
              <Row gap={8} wrap>
                {[
                  { name: "Info", hex: T.blue, lt: T.blueLt },
                  { name: "Success", hex: T.green, lt: T.greenLt },
                  { name: "Warning", hex: T.orange, lt: T.orangeLt },
                  { name: "Danger", hex: T.red, lt: T.redLt },
                ].map((c) => (
                  <div key={c.name} style={{ display: "flex", gap: 4 }}>
                    <div style={{ textAlign: "center" as const }}>
                      <div style={{ width: 56, height: 48, background: c.hex, borderRadius: T.radius, marginBottom: 4 }} />
                      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted }}>{c.hex}</div>
                    </div>
                    <div style={{ textAlign: "center" as const }}>
                      <div style={{ width: 56, height: 48, background: c.lt, borderRadius: T.radius, marginBottom: 4 }} />
                      <div style={{ fontSize: 9, fontFamily: T.fontMono, color: T.textMuted }}>{c.lt}</div>
                    </div>
                  </div>
                ))}
              </Row>
            </Section>

            <Section title="Categorical (Data Visualization)">
              <Row gap={8} wrap>
                {[
                  { name: "Blue", hex: T.blue },
                  { name: "Green", hex: T.green },
                  { name: "Gold", hex: T.gold },
                  { name: "Rose", hex: T.rose },
                  { name: "Cerulean", hex: T.cerulean },
                  { name: "Vermilion", hex: T.vermilion },
                  { name: "Violet", hex: T.violet },
                  { name: "Turquoise", hex: T.turquoise },
                ].map((c) => (
                  <div key={c.name} style={{ width: 56, textAlign: "center" as const }}>
                    <div style={{ width: 56, height: 32, background: c.hex, borderRadius: T.radius, marginBottom: 4 }} />
                    <div style={{ fontSize: 8, fontFamily: T.fontMono, color: T.textMuted }}>{c.hex}</div>
                  </div>
                ))}
              </Row>
            </Section>

            <Section title="Text Colors">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {[
                  { name: "Primary", hex: T.textPrimary, sample: "Primary text on dark — headings, values" },
                  { name: "Secondary", hex: T.textSecondary, sample: "Secondary text — body, descriptions" },
                  { name: "Muted", hex: T.textMuted, sample: "Muted text — labels, placeholders" },
                  { name: "Disabled", hex: T.textDisabled, sample: "Disabled text — inactive controls" },
                ].map((c) => (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ width: 24, height: 24, background: c.hex, borderRadius: T.radius }} />
                    <span style={{ fontSize: 12, color: c.hex, minWidth: 80, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: c.hex }}>{c.sample}</span>
                    <span style={{ fontSize: 10, fontFamily: T.fontMono, color: T.textDisabled }}>{c.hex}</span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>

      <style>{`
        @keyframes ds-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(50, 164, 103, 0.7); }
          50%       { box-shadow: 0 0 0 4px rgba(50, 164, 103, 0); }
        }
        @keyframes ds-ring {
          0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
