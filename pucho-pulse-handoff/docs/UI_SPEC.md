# UI_SPEC — Pucho Pulse dashboard

**The reference implementation is `reference/pucho-pulse-dashboard.html`** — a complete, working, single-file prototype of all 7 views with demo data, validated brand palette, light/dark themes, tooltips, working search, and mobile layout. Open it in a browser; it IS the design spec. Build the production app to match it visually, replacing demo data with API data per TRD §4. This file lists what the prototype can't say in pixels.

## 1. Brand tokens

Fonts: **Anek Latin** (headings, 600–800), **Lato** (body), **Chivo Mono** (badges/mono accents) — Google Fonts.
Light: surface `#f7f6fa` / cards `#ffffff` / text `#17131f` / brand **Pucho Violet `#5922c6`**.
Dark: surface `#121016` / cards `#1a1a19` / brand `#9d7bea`.
Categorical series (CVD-validated, fixed order — never re-assign on filter): light `#5922c6, #1baf7a, #eb6834, #af3db8, #eda100`; dark `#7b4ce0, #199e70, #d95926, #c94fd1, #c98500`. Feature→color mapping is fixed: Chat=violet, Workflow=aqua, Agent=orange, Voice=magenta, Other=yellow.
Sequential (heatmaps/funnel): violet ramp `--seq-1…7` (values in prototype CSS). Status: good `#0e8345`, warn `#b25e00`, danger `#c62828` (light); dark variants in prototype.
Tagline "Pucho Toh Sahi!" appears in the footer only.

## 2. Views & routes

| Route | View | Key widgets (all data-mapped in prototype code comments) |
|---|---|---|
| `/` | Command Center | 6 stat tiles · daily burn + 7d MA line · signups vs activated stacked bars · feature donut · needs-attention table |
| `/credits` | Credits & Revenue | tiles · weekly burn stacked by feature · MRR by plan · wallet utilization meters table · monthly revenue |
| `/engagement` | Users & Engagement | DAU/WAU/MAU/stickiness tiles · retention cohort heatmap · power users · device split · dormant seats |
| `/features` | Feature Usage | chat-type h-bars · pro/deep/file/mobile tiles · voice minutes · workflow leaderboard |
| `/partners` | Partners & Funnel | partner tiles · SDR funnel (ordinal violet ramp) · contact-sales stacked bars · partner scorecard |
| `/grant` | Credit Grant Benchmark | grant tiles · conversion-by-band "money chart" · burn milestones · feature-vs-conversion · "is 1,000 right" percentile card · partner grant benchmark |
| `/search` | Search & 360 + Propensity | search box + type chips + results · Partner/User/Org 360 panels · zero-use aging · profile-vs-behavior · partner health · **PPS Office leaderboard** |
| `/workshops` | Workshop admin (no prototype — follow existing card/table patterns) | create form → QR modal · workshop list with funnel columns (G1) · attendance quick-entry · red rows for missing attendance |

Global: date-range presets (7/30/90) in one row above content, scoping everything below; theme toggle; "DEMO DATA" chip removed in production.

## 3. Chart & interaction rules (from the prototype — keep them)

Bars ≤24px, 4px rounded data-end, square baseline; 2px lines; 2px surface gaps between stacked segments; hairline grids; one axis only (never dual); legends for ≥2 series; direct labels selectively (never every point); text never in series colors. Line charts: crosshair + all-series tooltip. Bars/cells: per-mark tooltip, hit target ≥ the slot. Mobile (≤700px): tiles 2-across, h-bar labels move above bars, tables scroll horizontally inside cards, nav scrolls horizontally, 3 x-ticks max. Numbers: Indian formatting (K/L/Cr), `tabular-nums` in table columns only.

## 4. The 360 panels & PPS table

Follow prototype exactly: Partner 360 = grade circle + score breakdown + stat grid + 3-month stacked trend; End-user 360 = status pill + profile/behavior stat grid + inline action note for zero-use; PPS table columns = Organization · Credits · Office days/14 · Office apps · Office chats · Momentum · PPS · Band pill (A good / B neut / C+W warn / D risk) · Next action. Search results: type-colored tag (PARTNER magenta / ORG violet / USER aqua) + name + right-aligned context.

## 5. Empty/loading/error states (not in prototype)

Loading: hold previous render at 50% opacity (no skeleton jumps). Empty (pre-data): show the widget frame + one line ("No workshop data yet — create the first workshop"). Error: inline retry, never a blank card. Every chart offers a table-view toggle (accessibility relief for low-contrast hues — required, see dataviz notes in prototype).
