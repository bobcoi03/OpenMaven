# OpenMaven Design System

> Tactical C2 interface inspired by Palantir Foundry/Gotham, MIL-STD-2525, and
> modern data-dense enterprise patterns. This document captures concrete design
> tokens, typography scales, layout conventions, and component recommendations
> for the OpenMaven web interface.

---

## 1. Design Philosophy

**Data density over aesthetics.** Every pixel earns its place. The UI is an
operational tool, not a marketing page.

**Dark-first, always.** No C2 system uses a light theme in operations. Backgrounds
are deep blue-tinted darks — never pure black (causes halation on LCD panels).

**Information hierarchy through brightness, not size.** Critical data is brighter
and more saturated. Routine data is dimmer. Size stays relatively uniform to
maximize density.

**Micro-animations are functional.** Pulse = critical alert. Blink = hostile
contact. Expanding ring = new detection. Every animation encodes meaning.

**Sharp, not rounded.** Border radius ≤ 2px. This is a tactical interface, not a
consumer app. Zero radius on panels, 2px on buttons/inputs.

### Reference Products

| Product | What to borrow |
|---------|---------------|
| **Palantir Blueprint** | Color system, spacing grid, density philosophy |
| **Palantir Foundry/Gotham** | Layout zones, F-pattern hierarchy, overlay panels |
| **Linear** | 12px uppercase section headers, minimal chrome |
| **Bloomberg Terminal** | Numerical typography, tabular alignment |
| **Carbon (IBM)** | Condensed density mode, dark palette anchors |

---

## 2. Color System

### 2.1 Surface Palette (Dark Theme)

Based on Palantir Blueprint's gray scale with tactical blue tint:

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-deepest` | `#0A0E1A` | Map surround, full-bleed background |
| `--bg-primary` | `#111827` | Main panels (≈ Tailwind gray-900) |
| `--bg-elevated` | `#1E293B` | Cards, sidebars, overlays (≈ slate-800) |
| `--bg-surface` | `#334155` | Hover states, selected items (≈ slate-700) |
| `--bg-interactive` | `#475569` | Active/pressed states |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Panel dividers |
| `--border-default` | `rgba(255,255,255,0.10)` | Input borders |
| `--border-active` | `rgba(255,255,255,0.20)` | Focus rings |

**Why blue-tinted?** Pure neutral grays look lifeless on tactical displays. A
slight blue undertone (the `1A` in `#0A0E1A`) creates depth and suggests
electronic display warmth without being noticeable.

### 2.2 Text Colors

| Token | Hex | Brightness | Usage |
|-------|-----|-----------|-------|
| `--text-primary` | `#E2E8F0` | 91% | Headings, primary labels |
| `--text-secondary` | `#94A3B8` | 63% | Body text, descriptions |
| `--text-muted` | `#64748B` | 44% | Placeholders, tertiary info |
| `--text-disabled` | `#475569` | 32% | Disabled controls |
| `--text-accent` | `#38BDF8` | — | Highlighted values, links |

Never use pure white `#FFFFFF` for text — `#E2E8F0` is maximum.

### 2.3 Force Affiliation (MIL-STD-2525D)

These colors are non-negotiable for military audiences:

| Affiliation | Dark | Medium | Light | Frame |
|-------------|------|--------|-------|-------|
| **Friendly** | `#006B8C` | `#00A8DC` | `#80E0FF` | Rectangle |
| **Hostile** | `#C80000` | `#FF3031` | `#FF8080` | Diamond |
| **Neutral** | `#00A000` | `#00E200` | `#AAFFAA` | Square |
| **Unknown** | `#E1DC00` | `#FFFF00` | `#FFFF80` | Cloverleaf |
| **Civilian** | `#500050` | `#800080` | `#FFA1FF` | — |

Team overlays for multi-force:

| Team | Hex |
|------|-----|
| Alpha | `#83C7DC` |
| Bravo | `#00A8DC` |
| Charlie | `#006B8C` |
| Delta | `#F67585` |
| Echo | `#FF3031` |
| Foxtrot | `#C80000` |

### 2.4 Semantic / Status Colors

| Intent | Primary | Dark | Light | Usage |
|--------|---------|------|-------|-------|
| **Info (Blue)** | `#2D72D2` | `#184A90` | `#8ABBFF` | Selected, active, info |
| **Success (Green)** | `#238551` | `#165A36` | `#72CA9B` | Operational, healthy |
| **Warning (Orange)** | `#C87619` | `#77450D` | `#FBB360` | Degraded, caution |
| **Danger (Red)** | `#CD4246` | `#8E292C` | `#FA999C` | Alerts, hostile, critical |

Tailwind mapping for alert components:

```tsx
const alertStyles = {
  critical: 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse',
  warning:  'bg-amber-500/15 border-amber-500/40 text-amber-400',
  advisory: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
  status:   'bg-emerald-500/10 border-emerald-500/30 text-emerald-400/70',
};
```

### 2.5 Data Visualization Palette

Categorical series (Blueprint extended palette, level 3 — primary shade):

```
1. Blue       #2D72D2
2. Green      #238551
3. Gold       #D1980B
4. Rose       #DB2C6F
5. Cerulean   #147EB3
6. Vermilion  #D33D17
7. Violet     #9D3F9D
8. Turquoise  #00A396
```

Sequential: use a single hue's 5-step range (e.g., Blue: `#184A90` → `#8ABBFF`).
Diverging: pair two hue ramps through a neutral midpoint.

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Rationale |
|------|------|-----------|
| **UI text, labels, body** | Inter | Tall x-height (0.72), excellent at 11px+, tabular figures |
| **Data values, coordinates** | JetBrains Mono | Tallest x-height of any mono (0.73), readable at 10px |
| **Headings** | Inter 600-700 | Bold, condensed feel for mission names |

Both fonts are already configured in the project. This is one of the strongest
pairings for data-dense tactical UIs — both have tall x-heights, excellent
hinting, and variable font support.

**Alternatives considered:**

| Font | Verdict |
|------|---------|
| Geist + Geist Mono | Best cohesion (designed as pair), free. Consider for future rebrand. |
| Berkeley Mono | Exceptional data readability, but $75+ license. |
| IBM Plex Sans/Mono | Best glyph differentiation (0 vs O), lacks variable support. |
| Source Sans 3 | Best cross-platform hinting, especially on Windows. |

### 3.2 Type Scale

Tactical UIs run **one full step smaller** than consumer UIs. Where a SaaS app
uses 14px body text, a C2 display uses 12-13px to maximize data density.

| Role | Size | Weight | Line-Height | Letter-Spacing | Font |
|------|------|--------|-------------|----------------|------|
| **Page title** | 20px | 600 | 1.4 | -0.02em | Inter |
| **Section header** | 14px | 600 | 1.43 | -0.01em | Inter |
| **Subsection / toolbar** | 12px | 600 | 1.33 | 0.01em | Inter |
| **Body text** | 13px | 400 | 1.54 | 0em | Inter |
| **Labels / captions** | 11px | 500 | 1.45 | 0.02em | Inter |
| **Data values** | 13px | 400 | 1.38 | 0em | JetBrains Mono |
| **Small data / badge** | 11px | 500 | 1.27 | 0.01em | JetBrains Mono |
| **Tiny / attribution** | 9px | 400 | 1.33 | 0.04em | Inter |
| **Status indicator** | 11px | 600 | 1.27 | 0.06em | Inter (uppercase) |
| **Overline / category** | 10px | 600 | 1.4 | 0.08em | Inter (uppercase) |

### 3.3 Dark Mode Adjustments

Light text on dark backgrounds appears optically heavier. Reduce weight by ~50
units in dark mode:

| Context | Light mode | Dark mode |
|---------|-----------|-----------|
| Body | 400 | 350 |
| Medium | 500 | 450 |
| Semibold | 600 | 550 |
| Bold | 700 | 650 |

Line height should increase +0.05 to +0.1 in dark mode to reduce visual density.

Letter spacing should increase +0.005em to +0.01em globally (light text on dark
backgrounds appears tighter).

### 3.4 Typographic Conventions

- **ALL CAPS + wide letter-spacing** for section headers, overlines, and status labels:
  `text-[10px] uppercase tracking-[0.15em] text-zinc-500`
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) on all numeric data
- **Monospace** for machine data: coordinates, timestamps (DTG: `281430ZMAR2026`), IDs, SIDC strings
- **Color-coded values**: green=nominal, amber=warning, red=critical — never rely on color alone (add icons)

### 3.5 Reference: How Others Scale

| Product | Base | Small | Scale | Line-Height |
|---------|------|-------|-------|-------------|
| **Blueprint** | 14px | 12px | 12/14/16/18/22/28/36 | 1.286 |
| **Linear** | 15px | 12px | 12/14/15 (UI) | ~1.35 |
| **Vercel Geist** | 14px | 12px | 12/13/14/16/18/20/24... | Bundled per class |
| **Bloomberg** | Custom | Custom | Proprietary | Optimized for numbers |
| **Carbon (IBM)** | 14px | 12px | 12/14/16/20/24/28/32/36/42/54/60/76 | 1.25-1.5 |

---

## 4. Spacing & Sizing

### 4.1 Base Unit

**4px grid** (aligns with Blueprint v5+). All spacing derives from multiples of 4:

```
 4px  (1×)   Tight gaps, icon padding
 8px  (2×)   Small gaps, compact padding
12px  (3×)   Default compact padding
16px  (4×)   Standard padding, section gaps
20px  (5×)   Medium gaps
24px  (6×)   Comfortable padding
32px  (8×)   Large section spacing
48px  (12×)  Major section breaks
```

### 4.2 Component Dimensions

| Component | Height | Compact Height |
|-----------|--------|---------------|
| Top bar / header | 40px | 32px |
| Bottom status bar | 28px | 24px |
| Button (default) | 30px | 24px |
| Button (large) | 40px | — |
| Input field | 30px | 24px |
| Table row | 40px | 30px |
| Icon (standard) | 16px | 12px |
| Icon (large) | 20px | — |
| Touch target (min) | 30px | — |

### 4.3 Panel Widths

| Panel | Width | Notes |
|-------|-------|-------|
| Left sidebar | 240-320px | Order of battle, filters, asset tree |
| Right panel | 300-400px | Detail views, AI query, intel feed |
| Map (center) | Fills remaining | 60-70% of screen |

---

## 5. Layout Architecture

### 5.1 Zone Layout (Map-Centric COP)

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR (40px)                                                   │
│ [Brand] [Nav Tabs] ·························· [Search] [User]    │
├───────┬──────────────────────────────────────┬───────────────────┤
│       │                                      │                   │
│ LEFT  │          CENTER MAP                  │    RIGHT          │
│ PANEL │       (fills remaining)              │    PANEL          │
│(240-  │                                      │  (300-400px)      │
│ 320px)│   Common Operating Picture           │                   │
│       │   + Force Overlays                   │  Asset Detail     │
│ Order │   + Tactical Graphics                │  AI Query         │
│ of    │   + Sensor Coverage                  │  Engagement       │
│Battle │                                      │  Status           │
│       │                                      │                   │
├───────┴──────────────────────────────────────┴───────────────────┤
│ BOTTOM BAR (28px)                                                │
│ [Status Dots] [Asset Counts] ·············· [Sim Controls]       │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Key Layout Principles

From Palantir's official design guidelines:

1. **F-shaped hierarchy** — primary content top-left, navigation scanning
   vertically along left edge
2. **30-40% whitespace** — avoid overcrowding, even in dense UIs
3. **Max 10 visible components** per view (buttons, panels, widgets)
4. **Max 5 primary navigation actions** in the top bar
5. **Panels float over the map** with semi-transparent backgrounds
   (`bg-slate-900/80 backdrop-blur-sm`), not opaque sidebars
6. **Compact padding** by default — 80% height/width with 16px spacing
7. **Collapsible panels** for supplementary info — keep location visible when
   collapsed
8. **No horizontal scrolling** except full-page scenarios
9. **Drop shadows**: maximum 1 per page for hierarchy clarity
10. **Container nesting**: maximum 3-4 levels deep

### 5.3 Information Priority

C2 displays follow strict information priority ordering:

| Priority | Color | Indicator | Examples |
|----------|-------|-----------|----------|
| **CRITICAL** | Red, pulsing | `animate-pulse` | Threats, weapons, IFF failures |
| **WARNING** | Amber, steady | Static | Degraded systems, low fuel |
| **ADVISORY** | Blue/cyan | Static | New intel, position updates |
| **STATUS** | Dim green/gray | Static | Routine status, heartbeat |

---

## 6. Component Patterns

### 6.1 HUD-Style Overlays

Semi-transparent panels anchored to map corners:

```tsx
<div className="absolute top-3 left-3 z-10
  bg-slate-900/80 backdrop-blur-sm border border-slate-700/50
  px-3 py-2 font-mono text-xs text-slate-300">
  <div className="text-[10px] text-slate-500 uppercase tracking-widest">OPCON</div>
  <div className="text-emerald-400">OPERATION IRON SENTINEL</div>
  <div className="text-slate-400">DTG: 281430ZMAR2026</div>
</div>
```

### 6.2 Status Indicators (Compact Readouts)

```
[●] LABEL      VALUE    TREND
 ●  CPU Load    87%      ↑
 ●  Bandwidth   2.4Gbps  →
 ●  Latency     12ms     ↓
```

```tsx
<div className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs">
  <span className="h-2 w-2 rounded-full bg-emerald-500" />
  <span className="text-slate-400 uppercase tracking-wider w-24">CPU Load</span>
  <span className="text-slate-200 tabular-nums">87%</span>
  <span className="text-red-400">↑</span>
</div>
```

### 6.3 Tactical Animations

```css
/* Radar sweep */
@keyframes tac-sweep {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Hostile contact blink */
@keyframes tac-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.3; }
}
.tac-hostile-blink {
  animation: tac-blink 0.8s step-end infinite;
}

/* New detection expanding ring */
@keyframes tac-detect {
  0%   { transform: scale(0.5); opacity: 0.8; }
  100% { transform: scale(2.5); opacity: 0; }
}
.tac-detection-ring {
  animation: tac-detect 2s ease-out infinite;
}

/* Subtle tactical grid overlay */
.tactical-grid-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(56, 189, 248, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(56, 189, 248, 0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  z-index: 5;
}
```

### 6.4 Classification Banner

All DoD/IC software displays a classification banner:

| Classification | Background | Text |
|----------------|-----------|------|
| UNCLASSIFIED | `#007A33` (green) | White |
| CONFIDENTIAL | `#0033A0` (blue) | White |
| SECRET | `#C8102E` (red) | White |
| TOP SECRET | `#FF8C00` (orange) | Black |
| TOP SECRET/SCI | `#FFD700` (gold) | Black |

```tsx
<div className="h-6 bg-emerald-700 text-white text-[10px] font-bold
  uppercase tracking-[0.2em] flex items-center justify-center">
  UNCLASSIFIED // FOR OFFICIAL USE ONLY
</div>
```

---

## 7. Component Library Stack

### Adopt

| Library | Role | Why |
|---------|------|-----|
| **shadcn/ui** | Primary design system | Already adopted. Switch to **Mira** or **Lyra** style for maximum density. |
| **TanStack Table** | Data tables | Headless, Tailwind-native, MIT. Already have `@tanstack/react-virtual`. |
| **Tremor** (or shadcn charts) | Charts & KPIs | Shares Radix + Tailwind foundation. Evaluate shadcn charts first. |
| **MapLibre GL** | Mapping | Already adopted. |
| **milsymbol** | NATO symbols | Already adopted. Zero-dependency SVG output. |

### shadcn Style Recommendation

Currently on `base-nova`. For a Palantir-like aesthetic:

| Style | Character | Fit |
|-------|-----------|-----|
| **Lyra** | Zero border-radius, boxy, sharp. Pairs with mono fonts. | Best tactical fit |
| **Mira** | Most compact; every pixel counts. | Best for data-dense tables |
| ~~Nova~~ | Reduced padding/margins. | Current — too soft |

**Recommendation: Switch to Lyra** for the tactical/operational look. Use Mira
principles for table views.

### Borrow (Principles Only — Do Not Install)

| Library | What to borrow |
|---------|---------------|
| **Blueprint.js** | 14px base, 1.286 line-height, 4px grid, color system |
| **Carbon (IBM)** | Condensed density (0.5rem padding), dark palette anchors |

### Skip

| Library | Why |
|---------|-----|
| AG Grid | Paywalled features, Tailwind-incompatible, 300KB+ |
| Mantine | Conflicts with shadcn styling |
| Ant Design | Heavy, poor Tailwind compat, performance issues |
| Blueprint.js (as dep) | Incompatible with Tailwind |
| Carbon (as dep) | Same — study its design, don't install |

---

## 8. Tailwind Configuration

### Suggested Extensions

```ts
// tailwind.config.ts
{
  theme: {
    extend: {
      colors: {
        tactical: {
          bg: {
            DEFAULT: '#111827',
            deep: '#0A0E1A',
            elevated: '#1E293B',
            surface: '#334155',
          },
          friendly: { DEFAULT: '#00A8DC', dark: '#006B8C', light: '#80E0FF' },
          hostile:  { DEFAULT: '#FF3031', dark: '#C80000', light: '#FF8080' },
          neutral:  { DEFAULT: '#00E200', dark: '#00A000', light: '#AAFFAA' },
          unknown:  { DEFAULT: '#FFFF00', dark: '#E1DC00', light: '#FFFF80' },
          civilian: { DEFAULT: '#800080', dark: '#500050', light: '#FFA1FF' },
        },
      },
      fontFamily: {
        tactical: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'tac-2xs': ['0.5625rem', { lineHeight: '0.75rem' }],   // 9px
        'tac-xs':  ['0.625rem',  { lineHeight: '0.875rem' }],  // 10px
        'tac-sm':  ['0.6875rem', { lineHeight: '1rem' }],      // 11px
        'tac-base': ['0.8125rem', { lineHeight: '1.125rem' }], // 13px
      },
      borderRadius: {
        'tac': '2px',
      },
    },
  },
}
```

### CSS Custom Properties

```css
:root {
  /* Surface */
  --tac-bg-deepest:    #0A0E1A;
  --tac-bg-primary:    #111827;
  --tac-bg-elevated:   #1E293B;
  --tac-bg-surface:    #334155;
  --tac-border:        rgba(255,255,255,0.06);
  --tac-border-active: rgba(255,255,255,0.20);

  /* Text */
  --tac-text-primary:   #E2E8F0;
  --tac-text-secondary: #94A3B8;
  --tac-text-muted:     #64748B;
  --tac-text-accent:    #38BDF8;

  /* Status */
  --tac-status-ok:   #32A467;
  --tac-status-warn: #EC9A3C;
  --tac-status-crit: #CD4246;
  --tac-status-info: #4C90F0;

  /* Force affiliation */
  --tac-friendly: #00A8DC;
  --tac-hostile:  #FF3031;
  --tac-neutral:  #00E200;
  --tac-unknown:  #FFFF00;
  --tac-civilian: #800080;
}
```

---

## 9. Transitions & Motion

From Blueprint:

| Token | Value |
|-------|-------|
| Duration | `100ms` |
| Easing | `cubic-bezier(0.4, 1, 0.75, 0.9)` |
| Easing (bounce) | `cubic-bezier(0.54, 1.12, 0.38, 1.11)` |

Keep animations fast and functional. 100ms for hover/focus transitions. Reserve
longer durations (200-300ms) only for panel open/close.

---

## 10. Shadows & Elevation

Blueprint dark theme doubles shadow opacity:

| Context | Light opacity | Dark opacity |
|---------|-------------|-------------|
| Border shadow | 0.1 | 0.2 |
| Drop shadow | 0.2 | 0.4 |

For tactical overlays, prefer `backdrop-blur-sm` + semi-transparent backgrounds
over heavy box shadows. Shadows should be subtle — the brightness of the content
itself creates the hierarchy.

---

## Sources

### Palantir / Blueprint
- [Blueprint GitHub](https://github.com/palantir/blueprint)
- [Blueprint Colors Source](https://github.com/palantir/blueprint/blob/develop/packages/colors/src/colors.ts)
- [Blueprint Variables SCSS](https://github.com/palantir/blueprint/blob/develop/packages/core/src/common/_variables.scss)
- [Blueprint Typography SCSS](https://github.com/palantir/blueprint/blob/develop/packages/core/src/_typography.scss)
- [Blueprint Documentation](https://blueprintjs.com/docs/)
- [Palantir Workshop Design Best Practices](https://www.palantir.com/docs/foundry/workshop/application-design-best-practices)
- [Palantir Slate Complex Layouts](https://www.palantir.com/docs/foundry/slate/best-practices-complex-layouts)
- [Palantir Gotham Platform](https://www.palantir.com/platforms/gotham/)

### Military Standards
- [MIL-STD-2525D](https://www.jcs.mil/Portals/36/Documents/Doctrine/Other_Pubs/ms_2525d.pdf)
- [Esri MIL-STD-2525D Color Assignment](https://github.com/Esri/dictionary-renderer-toolkit/blob/master/docs/assign_color_by_team_for_MIL-STD-2525D.md)
- [milsymbol Library](https://github.com/spatialillusions/milsymbol)
- [NATO Joint Military Symbology](https://en.wikipedia.org/wiki/NATO_Joint_Military_Symbology)

### Typography
- [Inter Font](https://rsms.me/inter/)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- [Vercel Geist Typography](https://vercel.com/geist/typography)
- [Bloomberg Terminal UX](https://www.bloomberg.com/company/stories/how-bloomberg-terminal-ux-designers-conceal-complexity/)
- [Font Sizes in UI Design](https://www.learnui.design/blog/ultimate-guide-font-sizes-ui-design.html)
- [Dark Mode Typography](https://css-tricks.com/dark-mode-and-variable-fonts/)

### Component Libraries
- [shadcn/ui Component Styles](https://www.shadcnblocks.com/blog/shadcn-component-styles-vega-nova-maia-lyra-mira/)
- [TanStack Table](https://tanstack.com/table)
- [Tremor](https://www.tremor.so/)
- [Carbon Design System](https://carbondesignsystem.com/)
- [AG Grid Themes](https://www.ag-grid.com/react-data-grid/themes/)

### Design Patterns
- [Visual Logic — Military UX Design](https://visuallogic.com/military-ux/)
- [reloadux — Military & Defense UI/UX](https://reloadux.com/ui-ux/military-and-defense/)
- [Synergy Codes — Military Analytics](https://www.synergycodes.com/military-intelligence-solutions)
