# PRD: Pucho Dashboard Vibe Coder

## Introduction

Pucho Dashboard Vibe Coder is a vibe coding tool that generates three integrated outputs:

1. **React Dashboards** — Vite + Tailwind CSS + Recharts + TanStack (Table & Query) with full Pucho branding
2. **Pucho AI Studio Workflow JSONs** — schemaVersion 7 backend automation definitions
3. **Auto-wired Webhook Connections** — linking frontend dashboard data sources to Pucho workflow webhook triggers

The tool ships as a fully working single-page React application with three pages: Dashboard, Workflows, and Connections — all styled to Pucho brand guidelines.

---

## Goals

- Deliver a pixel-perfect branded dashboard following Pucho's visual identity
- Provide a reusable component library (PuchoCard, PuchoButton, PuchoKPI, PuchoTable, PuchoLoading, PuchoEmpty)
- Generate valid Pucho AI Studio workflow JSON (schemaVersion 7) with preset templates
- Auto-wire frontend data sources to backend workflows via a webhook connection manager
- Maintain strict TypeScript, clean builds, and zero lint errors throughout

---

## Architecture

```
src/dashboard/
├── public/
├── src/
│   ├── components/         # Reusable Pucho UI components
│   │   ├── Sidebar.tsx     # ✅ Done (SETUP-001)
│   │   ├── Footer.tsx      # ✅ Done (SETUP-001)
│   │   ├── Layout.tsx      # ✅ Done (SETUP-001)
│   │   ├── PuchoCard.tsx
│   │   ├── PuchoButton.tsx
│   │   ├── PuchoKPI.tsx
│   │   ├── PuchoTable.tsx
│   │   ├── PuchoLoading.tsx
│   │   ├── PuchoEmpty.tsx
│   │   └── StatusBadge.tsx
│   ├── pages/
│   │   ├── DashboardPage.tsx
│   │   ├── WorkflowsPage.tsx
│   │   └── ConnectionsPage.tsx
│   ├── lib/                # Business logic & utilities
│   │   ├── workflow.ts     # Pucho workflow JSON generator
│   │   ├── templates.ts    # Preset workflow templates
│   │   └── webhooks.ts     # Webhook connection manager
│   ├── data/               # Sample/mock data
│   │   └── sample-data.ts
│   ├── App.tsx             # ✅ Done (SETUP-001)
│   ├── main.tsx            # ✅ Done (SETUP-001)
│   └── index.css           # ✅ Done (SETUP-001)
├── index.html              # ✅ Done (SETUP-001)
├── vite.config.ts          # ✅ Done (SETUP-001)
├── tsconfig.json
└── package.json
```

---

## Brand System (MANDATORY)

### Logo
Always in sidebar header:
```
https://cdn.prod.website-files.com/690ec911550adb97c4a56495/69399fa4c6253325791cd9ce_pucho%20logo.webp
```

### Colors

| Token             | Hex       | CSS Variable           | Usage                                              | Weight |
|-------------------|-----------|------------------------|-----------------------------------------------------|--------|
| Pucho Violet      | `#5922c6` | `--color-pucho-violet` | Headings, primary buttons, sidebar active, chart #1  | 30%    |
| Violet Blossom    | `#af3db8` | `--color-violet-blossom` | Hover states, chart #2                             | 15%    |
| White             | `#ffffff` | —                      | Backgrounds, cards                                   | 40%    |
| Black             | `#000000` | —                      | Body text, table data                                | 9%     |
| Sunshine Yellow   | `#fffac0` | `--color-sunshine-yellow` | Accent, warning badge                             | 2%     |
| Mint Green        | `#91ffd0` | `--color-mint-green`   | Success accent, success badge                        | 2%     |
| Sky Blue          | `#93d6ff` | `--color-sky-blue`     | Info accent, chart #3                                | 2%     |
| Sidebar BG        | `#f8f5ff` | `--color-sidebar-bg`   | Sidebar background                                   | —      |
| Gradient          | `linear-gradient(135deg, #5922c6, #af3db8)` | — | Sidebar header only               | —      |

### Fonts (Google Fonts)

| Font         | Weights | CSS Variable    | Usage                                |
|--------------|---------|-----------------|--------------------------------------|
| Anek Latin   | 600-700 | `--font-heading` | Headings, table headers — in Pucho Violet |
| Lato         | 300-500 | `--font-body`    | Body text, labels — in Black         |
| Chivo Mono   | 600-700 | `--font-mono`    | KPI numbers, data emphasis — in Pucho Violet |

### Visual Rules

| Element   | Spec                                                |
|-----------|-----------------------------------------------------|
| Cards     | White bg, `border-radius: 12px`, `box-shadow: 0 1px 3px rgba(89,34,198,0.08)`, `padding: 16px` |
| Buttons   | `border-radius: 8px`, primary = Pucho Violet bg + white text, secondary = Violet Blossom bg + white text |
| Inputs    | `border-radius: 6px`, 1px border `#e0d8f0`          |
| Spacing   | 24px gap between cards, 16px padding inside cards    |
| Sidebar   | bg `#f8f5ff`, active item = Pucho Violet text + 3px left border + `bg-white/50` |
| Charts    | Color sequence: Pucho Violet → Violet Blossom → Sky Blue → Mint Green |

### Brand Phrases

| Context   | Text                                                |
|-----------|-----------------------------------------------------|
| Loading   | "Pucho is thinking..."                              |
| Empty     | "No data yet — your workflows will populate this"   |
| Footer    | "Powered by Pucho.ai"                               |
| Tagline   | "Pucho Toh Sahi!"                                   |

---

## Pucho Workflow JSON Schema

All generated workflows MUST use `schemaVersion: "7"`:

```json
{
  "name": "workflow-name",
  "template": {
    "trigger": {
      "type": "PIECE_TRIGGER",
      "settings": {
        "pieceName": "@puchoaistudio/tool-webhook",
        "pieceVersion": "~0.4.8",
        "triggerName": "catch_webhook"
      },
      "nextAction": {
        "name": "action-name",
        "type": "PIECE",
        "settings": {
          "pieceName": "@puchoaistudio/tool-{name}",
          "pieceVersion": "~0.4.8",
          "actionName": "action_name",
          "input": {}
        },
        "nextAction": null
      }
    },
    "schemaVersion": "7"
  }
}
```

### Available Tools

| Tool           | pieceName                            | Common Actions                    |
|----------------|--------------------------------------|-----------------------------------|
| Webhook        | `@puchoaistudio/tool-webhook`        | `catch_webhook`                   |
| HTTP           | `@puchoaistudio/tool-http`           | `send_request`                    |
| Code           | `@puchoaistudio/tool-code`           | `run_code`                        |
| Schedule       | `@puchoaistudio/tool-schedule`       | `cron_trigger`, `interval_trigger`|
| Google Sheets  | `@puchoaistudio/tool-google-sheets`  | `append_row`, `read_sheet`        |
| Gmail          | `@puchoaistudio/tool-gmail`          | `send_email`                      |
| Slack          | `@puchoaistudio/tool-slack`          | `send_message`                    |

---

## User Stories

### Phase 1: Foundation (SETUP)

#### SETUP-001: Project scaffolding ✅ DONE
Vite + React + TypeScript + Tailwind v4 + Google Fonts + Sidebar + Footer + React Router

#### SETUP-002: Install Recharts + TanStack libraries
Install charting and data table dependencies. Wire up QueryClientProvider. Create a smoke-test chart.

#### SETUP-003: Reusable Pucho UI component library
Build PuchoCard, PuchoButton, PuchoKPI, PuchoTable, PuchoLoading, PuchoEmpty, StatusBadge — all branded.

### Phase 2: Dashboard Page (DASH)

#### DASH-001: KPI summary row
4 KPI cards (Total Workflows, Active Users, Success Rate, Avg Response) using PuchoKPI.

#### DASH-002: Interactive charts
Area chart (7-day trend) + Pie/donut chart (workflow distribution) using Recharts in PuchoCards.

#### DASH-003: Workflow execution log table
Sortable TanStack Table with 10+ rows, status badges, column sorting.

### Phase 3: Workflow Engine (WF)

#### WF-001: Workflow JSON generator utility
TypeScript module exporting `createWorkflow()`, `createAction()`, `chainActions()` — all producing valid schemaVersion 7 JSON.

#### WF-002: Workflow template library UI
Card grid of 3+ preset templates. Clicking shows generated JSON in a code viewer panel.

### Phase 4: Webhook Connections (HOOK)

#### HOOK-001: Webhook connection manager
TypeScript module: `WebhookManager` with `registerConnection()`, `removeConnection()`, `triggerWebhook()`, status tracking.

#### HOOK-002: Connections UI panel
Connections page with connection cards, Add Connection form, status badges, "Pucho Toh Sahi!" tagline.

### Phase 5: Integration (FINAL)

#### FINAL-001: Full integration & polish
Wire all pages together. Verify all brand rules. Ensure build + typecheck pass. End-to-end verification.

---

## Functional Requirements

- FR-01: Dashboard page renders KPI row, charts, and execution log table
- FR-02: KPI values use Chivo Mono font in Pucho Violet; labels use Lato in Black
- FR-03: Charts use brand color sequence (Violet → Blossom → Sky Blue → Mint Green)
- FR-04: Execution log table supports column sorting via TanStack Table
- FR-05: Status badges use colored backgrounds (green=success, red=failed, yellow=running, gray=disconnected)
- FR-06: `createWorkflow()` generates valid schemaVersion 7 JSON with webhook trigger
- FR-07: `createAction()` generates valid action objects with correct pieceName pattern
- FR-08: At least 3 workflow templates ship as presets
- FR-09: Clicking a workflow template renders its JSON in a syntax-highlighted code viewer
- FR-10: `WebhookManager` stores connection mappings in React state
- FR-11: Connections UI shows all registered connections with status badges
- FR-12: Add Connection form validates dashboard source name and webhook URL
- FR-13: Every page includes sidebar navigation and footer
- FR-14: Loading state shows "Pucho is thinking..." with a branded spinner/animation
- FR-15: Empty state shows "No data yet — your workflows will populate this"

---

## Non-Goals (Out of Scope)

- No real backend / API server — all data is sample/mock
- No authentication or user management
- No actual webhook HTTP calls to external services in production
- No database or persistent storage — state lives in React state only
- No CI/CD pipeline setup
- No mobile-native app — responsive web only
- No dark mode (Pucho brand is light-mode only)

---

## Technical Considerations

- **Stack**: Vite 7 + React 19 + TypeScript 5.9 + Tailwind CSS 4
- **Charts**: Recharts (composable React chart library)
- **Tables**: @tanstack/react-table v8 (headless, sortable)
- **Data fetching**: @tanstack/react-query v5 (for future API integration)
- **Routing**: react-router-dom v7
- **Fonts**: Google Fonts CDN (Anek Latin, Lato, Chivo Mono)
- **Build**: `tsc -b && vite build` must pass clean
- **Linting**: ESLint with React + TypeScript plugins

---

## Success Metrics

- All 11 user stories pass with `passes: true` in prd.json
- `npm run build` completes with zero errors
- `npx tsc --noEmit` passes with zero type errors
- Every UI component follows Pucho brand guidelines (colors, fonts, spacing, shadows)
- Workflow JSON generator produces valid schemaVersion 7 output
- Webhook connection manager tracks status correctly

---

## Quality Checks (Run After Each Story)

```bash
cd src/dashboard
npx tsc --noEmit        # TypeScript typecheck
npm run build           # Full production build
npm run lint            # ESLint
```

---

## Ralph Loop Configuration

- **prd.json**: Contains all stories with `passes` status tracking
- **ralph-prompt.md**: Instructions for each autonomous iteration
- **ralph.sh**: Bash loop runner (`./ralph.sh [max_iterations]`)
- **progress.txt**: Append-only log with codebase patterns section
