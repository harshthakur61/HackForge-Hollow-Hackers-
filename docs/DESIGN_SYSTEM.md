# Reserve Juggler: Treasury Console Design System

A restrained, high-density presentation specification for institutional liquidity management and automated treasury operations. Designed according to the fintech frontend standard for bank workstations: calm, dense, precise, and completely free of decorative illustrations, emojis, glow, gradients, or marketing claims.

---

## 1. Design Tokens

### 1.1 Color Palette & Semantic Roles
All colors are defined as CSS custom properties mapped directly into Tailwind configuration. No ad-hoc hex codes or arbitrary tints are permitted in component markup. Contrast ratios meet WCAG 2.2 AA standards (minimum 4.5:1 for normal text, 3:1 for large text and UI boundaries) across both themes.

| Role | Light Theme (`:root`) | Dark Theme (`.dark`) | WCAG Contrast | Usage |
|:---|:---|:---|:---:|:---|
| **Canvas Background** | `#f8fafc` (slate-50) | `#090d16` (slate-950 deep) | > 14:1 | Main application viewport |
| **Surface (Card/Panel)** | `#ffffff` (white) | `#0f172a` (slate-900) | > 12:1 | Cards, tables, drawers, sidebars |
| **Subtle Surface** | `#f1f5f9` (slate-100) | `#1e293b` (slate-800) | > 10:1 | Table headers, secondary toolbars |
| **Border Subtle** | `#e2e8f0` (slate-200) | `#334155` (slate-700) | > 3.0:1 | 1px card separators, row borders |
| **Border Strong** | `#cbd5e1` (slate-300) | `#475569` (slate-600) | > 4.5:1 | Focused controls, active tabs |
| **Text Primary** | `#0f172a` (slate-900) | `#f8fafc` (slate-50) | > 13:1 | Headings, monetary values |
| **Text Secondary** | `#475569` (slate-600) | `#cbd5e1` (slate-300) | > 5.5:1 | Field labels, table headers |
| **Text Muted** | `#64748b` (slate-500) | `#94a3b8` (slate-400) | > 4.5:1 | Metadata, timestamps, disclaimers |
| **Accent Primary** | `#0284c7` (sky-600) | `#38bdf8` (sky-400) | > 4.5:1 | Primary actions, active navigation |
| **Accent Hover** | `#0369a1` (sky-700) | `#7dd3fc` (sky-300) | > 4.5:1 | Hover states on interactive elements |
| **Accent Subtle** | `#e0f2fe` (sky-100) | `#0c4a6e` (sky-900) | > 3.0:1 | Selected row highlight |
| **Semantic Positive** | `#15803d` (green-700) | `#4ade80` (green-400) | > 4.5:1 | Net gains, covered settlements |
| **Positive Background** | `#f0fdf4` (green-50) | `#052e16` (green-950) | — | Positive status badge background |
| **Semantic Negative** | `#b91c1c` (red-700) | `#f87171` (red-400) | > 4.5:1 | Repo break fees, overdraft costs |
| **Negative Background** | `#fef2f2` (red-50) | `#450a0a` (red-950) | — | Negative status badge background |
| **Semantic Warning** | `#b45309` (amber-700) | `#fbbf24` (amber-400) | > 4.5:1 | Advance warning what-ifs, alerts |
| **Warning Background** | `#fffbeb` (amber-50) | `#451a03` (amber-950) | — | Warning badge background |
| **Semantic Info** | `#0369a1` (sky-700) | `#38bdf8` (sky-400) | > 4.5:1 | Tooltips, parameter explanations |

### 1.2 Typography & Numerical Formatting
- **Font Family**: Inter Variable via `@fontsource-variable/inter` (bundled locally in Docker; zero external CDN dependencies).
- **Tabular Numerals**: `font-variant-numeric: tabular-nums` (`tnum`) applied globally across all numerical metrics, timestamps, and financial figures to ensure columns align perfectly.
- **Scale**:
  - `text-2xs` (10px / 14px, weight 500/600): Column descriptors, uppercase badges, timeline markers.
  - `text-xs` (12px / 16px, weight 400/500/600): Standard data table cells, inputs, controls, tooltips.
  - `text-sm` (14px / 20px, weight 500/600): Secondary titles, balance figures, card headings.
  - `text-base` (16px / 24px, weight 600): Section headers, modal titles.
  - `text-lg` (18px / 24px, weight 700): Primary KPI strip values, net P&L headline.
  - `text-xl` (20px / 28px, weight 700): Primary page titles.

### 1.3 Spacing, Borders, and Radii
- **Grid Scale**: Strict 4px modular spacing (`p-1` = 4px, `p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-5` = 20px, `p-6` = 24px).
- **Border Radii**: Flat institutional geometry:
  - `rounded-xs` (4px): Badges, pill tags.
  - `rounded-sm` (6px): Form inputs, action buttons, table row highlights.
  - `rounded-md` (8px): Standard cards, chart panels, popovers.
  - `rounded-lg` (12px): Slide-over drawers, dialog overlays.
- **Borders & Shadows**: 1px solid borders (`1px solid var(--border-subtle)`). No decorative drop shadows or blurred glass panels. Subtle 1px shadow permitted only on floating dropdowns and slide-over drawers (`0 1px 3px 0 rgb(0 0 0 / 0.1)`).
- **Motion**: Max duration 150ms ease-out. All transitions and micro-animations are disabled under `@media (prefers-reduced-motion: reduce)`.

---

## 2. Component System

| Component | Responsibility | Accessibility & Interaction |
|:---|:---|:---|
| `AppShell` | Persistent frame: left desktop sidebar, mobile drawer, top status bar, permanent disclaimer banner. | ARIA landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`), focus ring indicators. |
| `Sidebar` | Navigation links across 5 modules: Live Treasury, Strategy Performance, Stress Lab, Decision Log, Methodology. | Keyboard navigable, active tab highlighted with `aria-current="page"`, badge counts. |
| `TopBar` | Global state: engine connection status, simulated 24h clock, Day/Night phase pill, and memory-only theme toggle. | Non-interactive clock announced cleanly, theme toggle button with accessible label. |
| `Card` | Uniform content container with 1px border, header action slot, and optional compact padding. | Semantic `section`, proper heading hierarchy. |
| `Stat` | Key metric block: label, tabular currency/percent, signed delta, and explanatory tooltip. | Positive/negative values always have explicit sign (`+`/`-`) and icon, not color alone. |
| `Badge` | State pill: Strategy name, policy mode (`zero_overdraft` vs `cost_optimal`), event tag, phase. | High contrast, solid 1px border. |
| `DataTable` | High-density grid: sortable headers, right-aligned monetary values, sticky header, row selection. | ARIA table roles, keyboard row selection, horizontal scroll container with focus trap. |
| `Tooltip` | Contextual explainer for treasury definitions (e.g. "Reserve Buffer", "Price of Safety"). | Keyboard reachable via focus, `role="tooltip"`, `aria-describedby`. |
| `Drawer` | Slide-over inspection panel for scenario parameters and decision audit log details. | Focus trapped inside drawer, ESC key listener, restore focus on close. |
| `Banner` | Non-dismissible disclaimer: *"Backtest replay of the provided dataset. Daytime hours are not simulated; the pool is replenished externally."* | `role="region"`, understated slate background. |
| `Skeleton` | Content-preserving loading rectangle matching exact dimensions of table rows and metric cards. | `aria-busy="true"`, zero layout shift. |
| `EmptyState` | Informative state when data is not yet available (e.g. before clicking Start). | Clear plain text, action button. |
| `ErrorState` | Actionable failure panel when API or WebSocket disconnected. | Clear error description, manual retry button. |
| `ChartFrame` | Wrapper for Recharts visualizations with title, units ($M USD), period, and "View as table" toggle. | Provides accessible text/table alternative for all chart points. |
| `SleeveChart` | Real-time stacked area chart for strategic sleeve valuation across Tier 1, 2, and 3 plus benchmark line. | Continuous 24/7 valuation, accessible data table alternative, labelled $M axes. |
| `Money` | Formats currency with tabular numerals, explicit currency prefix, and exact decimal control. | Displays "—" for missing/null values; never displays undefined or NaN. |
| `SignedMoney`| Explicit `+$X` / `-$X` display with directional arrow and semantic color. | Distinguishes zero (`$0.00`) from positive/negative. |
| `Percent` | Formats percentages and basis points with explicit units. | `xx.x%` or `xxx.x bps`. |

---

## 3. Information Architecture & Navigation

The application uses `react-router-dom` with the socket connection and Zustand state held persistently at the root, ensuring the clock, simulation ticks, and replay streaming continue unhindered across page switches.

```
App Root (Socket + Zustand Replay Store + Stress Store + In-Memory Theme)
├── AppShell (Permanent Disclaimer Banner)
│   ├── TopBar (Connection Pill | Simulated Clock | Phase Badge | Theme Toggle)
│   ├── Sidebar (Persistent Left Nav on >=1024px, Mobile Drawer on <1024px)
│   └── Main Viewport
│       ├── Route: / (Live Treasury Console)
│       │   ├── Replay Control Toolbar & Scenario Settings Drawer
│       │   ├── Primary Liquidity Area (Night Chart + View-as-Table Toggle)
│       │   ├── Strategic Sleeve Chart (Stacked Area $M + Benchmark Line)
│       │   ├── Decision Rail (Buffer, Sweep, Model, Reserve Gauge, Post-Settlement Actual)
│       │   ├── Compact Balances Strip (Tier 0 Cash, Tier 1 Repo, Tier 2 Bonds, Tier 3 Equities, Overdraft)
│       │   ├── Cumulative Performance Strip (Net P&L, Break Fees, Overdraft Nights, Price of Safety)
│       │   ├── Strategic Sleeve Strip (Sleeve P&L, Excess vs Repo, Operating + Sleeve Combined Line)
│       │   ├── Multi-Strategy Race & Forecast vs Actual Calibration Charts
│       │   └── Decision Log Preview & Operational Event Feed
│       ├── Route: /sleeve (Strategic Sleeve Workstation)
│       │   ├── Allocation Selector (Risk Budget Default, 4 Presets, Custom Sliders with 20% Repo Floor)
│       │   ├── Top Summary Metric Cards from /sleeve/path
│       │   ├── Risk-Budget Mathematical Model Working Table
│       │   ├── Break-Even Holding Period per Tier (Ex-Ante & Ex-Post with Haircut Tooltip)
│       │   ├── Liquidation-Adjusted Salvage Value Card with Definition Tooltip
│       │   ├── Sortable Preset Comparison Table from /sleeve/compare (through <date>)
│       │   └── Mandatory Honesty Disclosures Banner
│       ├── Route: /strategies (Strategy Performance)
│       │   ├── Header with "through <date>" basis
│       │   ├── Cumulative Net P&L & Capture Ratio vs Oracle Bar Chart
│       │   └── Full Sortable KPI Table (S0 to S6 with yield bps, payout rate, break nights)
│       ├── Route: /decisions (Decision Audit Log)
│       │   ├── Filter by Strategy, Limit, and Date
│       │   ├── Export Loaded Table as CSV Action
│       │   ├── Paginated High-Density Audit Table
│       │   └── Row Detail Inspection Drawer
│       ├── Route: /stress (Stress Lab)
│       │   ├── Scenario Config (Withdrawal Surge, Bank Run, Deposit Freeze)
│       │   ├── Parameter Sliders with Units & Night Picker
│       │   ├── Strategic Sleeve Allocation Selector (Weights & Presets)
│       │   ├── Waterfall Liquidation Cards (Bond & Equity Sales with Fees) & Sequence Audit
│       │   ├── Plain-Language Summary Line Built Strictly from Returned Numbers
│       │   ├── Single Night Impact Cards & Baseline vs Stressed Progression Chart
│       │   ├── Multi-Strategy Batch Test (All / Fri-Sat / Payday) & Stressed P&L Chart
│       │   └── Mandatory Synthetic Disclaimer Badges & Plain-Language Summary Box
│       └── Route: /methodology (Institutional Methodology & Model Assumptions)
│           ├── Dataset Replay & Replenishment Model
│           ├── Repo Accrual & Early Redemption Fee Mechanics
│           ├── Conformal Quantile Loss & Fractile Optimization (q*)
│           ├── Oracle Definition as Theoretical Upper Bound
│           ├── Strategic Sleeve Mechanics & Mandatory Fiduciary Honesty Disclosures
│           └── Known Architectural Limitations Stated Plainly
```

---

## 4. Data-State Rules

1. **Missing Data**: Display em-dash (`"—"`). Never display `undefined`, `NaN`, or fabricated zeros. Missing instantaneous yields or prices in tick contracts render as dash.
2. **No Client-Side Financial Math**: All Net P&L, yields, fees, and fractiles are rendered directly from server payloads. Combined lines are strictly labelled as simple arithmetic sums.
3. **Temporal Barrier**: Future actual required buffer is hidden until the 08:00 settlement event is received.
4. **Engine Down**: When WebSocket drops or engine reports offline, state shifts to `engine_down`, displays a clear recovery alert, pauses replay, and automatically resumes upon engine health restoration.
5. **Memory-Only State**: Theme (light/dark) defaults to browser preference (`prefers-color-scheme`) and can be toggled in memory; zero `localStorage` or `sessionStorage` usage.

---

## 5. Standardized Strategy & Model Labels

Defined in `web/src/utils/labels.ts` as the single typed source of truth across all views:

### Strategy Identifiers & Institutional Labels
- **S0_all_cash**: `S0 All cash`
- **S1_fixed_10**: `S1 Fixed 10% buffer`
- **S2_fixed_20**: `S2 Fixed 20% buffer`
- **S3_static**: `S3 Static quantile buffer`
- **S4_policy_zero_overdraft**: `S4 Zero-overdraft policy (default)`
- **S5_policy_cost_optimal**: `S5 Cost-optimal policy (uses overdraft)`
- **S6_oracle**: `S6 Oracle (upper bound, not deployable)`

### Institutional Liquidity Tiers
- **Tier 0 Cash**: Demand liquidity buffer held for overnight client withdrawals.
- **Tier 1 Repo**: Overnight repurchase agreement (operating pool sweep).
- **Tier 2 Bonds**: 2Y Government Bonds held in the strategic sleeve.
- **Tier 3 Equities**: Equity index allocation held in the strategic sleeve.

### Strategic Sleeve Presets
- **risk_budget**: `Risk Budget (Default)` — Ex-ante 50/50 risk budget based on starting volatility & duration. Max 5% stressed loss.
- **conservative**: `Conservative (100/0/0)` — 100% Overnight Repo, 0% Bonds, 0% Equities.
- **income**: `Income (50/50/0)` — 50% Overnight Repo, 50% 2Y Government Bonds.
- **balanced**: `Balanced (40/40/20)` — 40% Repo, 40% Bonds, 20% Equities.
- **growth**: `Growth (20/30/50)` — 20% Repo (floor), 30% Bonds, 50% Equities.
- **custom**: `Custom Allocation` — Minimum 20% repo floor strictly enforced.

### Mandatory Fiduciary Disclosures
1. *"Realised over this dataset's year; not a forecast."*
2. *"Equity expected return of about 10% is stated in the problem brief, not in the dataset, and is not used in realised figures."*
3. *"Presets are in-sample illustrations, not tuned."*
4. *"The sleeve is separate capital held outside the nightly pool; no dividends or transaction costs."*
5. *"Liquidation-adjusted value = repo + bonds × (1 - 2.0%) + equities × (1 - 15.0%). Represents immediate stressed salvage value."*

### Derived Metrics
- **Price of Safety**: `S5 net P&L minus S4 net P&L` (net yield sacrificed to maintain zero overdrafts).

### Forecasting Model Code Translations
- **B0**: `Static historical quantile`
- **B1**: `Same-weekday historical quantile forecast`
- **B2**: `Recent same-weekday maximum`
- **M1**: `XGBoost quantile model`
- **M2**: `XGBoost quantile model with conformal calibration`
- *Unknown codes*: Show the raw code as fallback.
