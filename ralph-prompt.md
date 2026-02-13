# Ralph Agent Instructions — Pucho Dashboard Vibe Coder

You are an autonomous coding agent building the Pucho Dashboard Vibe Coder.

## Your Task

1. Read the PRD at `prd.json`
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks: `cd src/dashboard && npm run build && npx tsc --noEmit`
7. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
8. Update the PRD to set `passes: true` for the completed story
9. Append your progress to `progress.txt`

## CRITICAL: Pucho Brand Rules

Every generated UI file MUST use these — no exceptions:

### Logo (always in sidebar header)
```
https://cdn.prod.website-files.com/690ec911550adb97c4a56495/69399fa4c6253325791cd9ce_pucho%20logo.webp
```

### Colors
| Token | Hex | Usage | Weight |
|-------|-----|-------|--------|
| Pucho Violet | #5922c6 | Primary: headings, primary buttons, sidebar active, chart primary | 30% |
| Violet Blossom | #af3db8 | Secondary: hover states, chart secondary | 15% |
| White | #ffffff | Backgrounds, cards | 40% |
| Black | #000000 | Body text, table data | 9% |
| Sunshine Yellow | #fffac0 | Accent | 2% |
| Mint Green | #91ffd0 | Success/accent | 2% |
| Sky Blue | #93d6ff | Info/accent | 2% |
| Gradient | linear-gradient(135deg, #5922c6, #af3db8) | Sidebar header only | — |

### Fonts (Google Fonts)
- **Anek Latin** (600-700) — headings, in Pucho Violet
- **Lato** (300-500) — body text, in Black
- **Chivo Mono** (600-700) — KPI numbers, data emphasis, in Pucho Violet

### Visual Rules
- Rounded corners: 12px cards, 8px buttons, 6px inputs
- Shadows: `0 1px 3px rgba(89,34,198,0.08)`
- Sidebar: bg `#f8f5ff`, Pucho logo at top, active = Violet text + left border
- Charts: Pucho Violet → Violet Blossom → Sky Blue → Mint Green
- Generous white space (24px between cards, 16px padding)

### Brand Phrases
- Loading: "Pucho is thinking..."
- Empty: "No data yet — your workflows will populate this"
- Footer: "Powered by Pucho.ai"
- Tagline: "Pucho Toh Sahi!"

## Pucho Workflow JSON Schema

All workflows use schemaVersion "7":
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
      "nextAction": {}
    },
    "schemaVersion": "7"
  }
}
```

Tool pattern: `@puchoaistudio/tool-{name}`
Key tools: webhook, http, code, schedule, google-sheets, gmail, slack

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
```

## Consolidate Patterns

If you discover a **reusable pattern**, add it to the `## Codebase Patterns` section at the TOP of progress.txt.

## Quality Requirements

- ALL commits must pass: `npm run build` and `npx tsc --noEmit`
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns and Pucho brand rules

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally.

## Important

- Work on ONE story per iteration
- Commit frequently
- Keep builds green
- Read the Codebase Patterns section in progress.txt before starting
