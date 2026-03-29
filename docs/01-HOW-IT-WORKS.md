# Office-Agents: Complete Architecture & How It Works

> **Repo**: [hewliyang/office-agents](https://github.com/hewliyang/office-agents)
> **Type**: TypeScript monorepo (pnpm workspaces)
> **Purpose**: AI-powered chat agents embedded inside Microsoft Office (Excel, PowerPoint, Word)
> **Model**: BYOK (Bring Your Own Key) — no backend server, users supply their own LLM API keys

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Microsoft Office Host App                     │
│                  (Excel / PowerPoint / Word)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ Task Pane UI │    │  Office.js   │    │   Ribbon     │       │
│  │  (Svelte 5)  │◄──►│  Bridge API  │◄──►│  Commands    │       │
│  └──────┬───────┘    └──────────────┘    └──────────────┘       │
│         │                                                        │
│  ┌──────▼────────────────────────────────────────────────────┐  │
│  │              @office-agents/core (Svelte 5)                │  │
│  │   ChatInterface  │  Settings  │  Message Renderer          │  │
│  └──────┬────────────────────────────────────────────────────┘  │
│         │                                                        │
│  ┌──────▼────────────────────────────────────────────────────┐  │
│  │              @office-agents/sdk (Headless Runtime)          │  │
│  │                                                             │  │
│  │  AgentRuntime ──► LLM Provider ──► Tool Executor           │  │
│  │       │                                  │                  │  │
│  │       ▼                                  ▼                  │  │
│  │  State Manager    VFS    Storage    Sandbox (SES)           │  │
│  │       │                    │                                 │  │
│  │       ▼                    ▼                                 │  │
│  │  Event Emitter      IndexedDB                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. The 6 Packages (What Each Does)

### Package 1: `@office-agents/sdk` — The Brain

This is the **headless runtime** that powers everything. It has no UI. It manages:

| Component | File(s) | What It Does |
|-----------|---------|-------------|
| **AgentRuntime** | `runtime.ts` | Central orchestrator — receives user messages, sends them to the LLM, processes tool calls, emits state updates to the UI |
| **Provider Config** | `provider-config.ts` | Manages LLM API keys, model selection, proxy routing. Supports OpenAI, Anthropic, Google, Azure, Vertex AI |
| **OAuth** | `oauth/index.ts` | OAuth 2.0 + PKCE flow for Anthropic/OpenAI/Google. Handles token exchange, refresh, storage |
| **Virtual File System (VFS)** | `vfs.ts` | In-memory filesystem at `/home/user/uploads/`. Handles file uploads, reads, writes. Persists to IndexedDB |
| **Storage** | `storage/db.ts` | IndexedDB wrapper for persisting sessions, messages, files, skills across browser reloads |
| **Sandbox** | `sandbox.ts` + `lockdown.ts` | SES (Secure EcmaScript) sandbox for executing user/agent code safely. Blocks `Function`, `Reflect`, `Proxy` |
| **Skills** | `skills.ts` | Installs agent skills from markdown files. Parses metadata, injects into system prompt |
| **Web Tools** | `web/search.ts` | Web search via DuckDuckGo/Brave/Serper/Exa. HTML fetch + Readability + Turndown conversion |
| **Message Utils** | `message-utils.ts` | Converts between agent message format and chat UI format. Tracks token usage/costs |
| **Image Resize** | `image-resize.ts` | Compresses uploaded images to fit LLM token limits. Canvas-based PNG/JPEG encoding |
| **PDF Parser** | `pdf.ts` | Extracts text from uploaded PDFs using pdf.js |
| **Truncation** | `truncate.ts` | Truncates large file contents to fit context windows (head/tail modes) |
| **Bash Tool** | `bash.ts` | Executes shell commands in the VFS sandbox. Output limited to 100 lines / 256KB |

### Package 2: `@office-agents/core` — The UI Components

Svelte 5 component library shared across all Office apps:

- **ChatInterface** — The main chat window (message list, input box, streaming display)
- **Settings** — LLM provider configuration panel (API keys, model picker, proxy settings)
- **Message Renderer** — Markdown rendering (via Marked), code highlighting (via Shiki), HTML sanitization (DOMPurify)

### Package 3: `@office-agents/excel` — Excel Add-in

- **Task Pane** — Svelte app served at `https://localhost:3000/taskpane.html`
- **Adapter** (`adapter.ts`) — Bridges SDK ↔ Excel. Provides document metadata, handles dirty-range navigation, registers Excel-specific tools
- **16 Excel Tools** — setCellRange, getCellRanges, getRangeAsCsv, searchData, screenshotRange, modifySheetStructure, evalOfficeJs, etc.
- **Manifest** — Office XML manifest declaring permissions (ReadWriteDocument), ribbon buttons, URLs

### Package 4: `@office-agents/powerpoint` — PowerPoint Add-in

- **Task Pane** — Served at `https://localhost:3001/taskpane.html`
- **Adapter** — Bridges SDK ↔ PowerPoint. Includes theme detection, slide metadata extraction, shape geometry parsing
- **PPT Tools** — screenshotSlide, listSlideShapes, readSlideText, editSlideXml, editText, editChart, duplicateSlide, editMaster, evalOfficeJs
- **Manifest** — Requires PowerPoint API 1.5+

### Package 5: `@office-agents/word` — Word Add-in

- Served at `https://localhost:3002`
- Document structure tools, OOXML processing
- Earliest stage of development (v0.0.3)

### Package 6: `@office-agents/bridge` — Dev Inspector

- WebSocket-based RPC bridge for debugging live add-ins
- CLI tool (`office-bridge` command)
- Allows runtime inspection, tool execution, VFS browsing from terminal

---

## 3. How a User Message Flows (End-to-End)

Here is **exactly** what happens when a user types "Format column A as currency" in the Excel add-in:

```
Step 1: USER INPUT
───────────────────
User types message in ChatInterface (Svelte component)
  → Calls AgentRuntime.sendMessage("Format column A as currency")

Step 2: MESSAGE ENRICHMENT
───────────────────────────
AgentRuntime.sendMessage():
  a) Calls adapter.getDocumentMetadata()
     → Excel adapter fetches: sheet names, active sheet, selected range
     → Returns: { sheets: [{name: "Sheet1", id: 1}], activeSheet: 1, selection: "A1" }
  b) Wraps user message with metadata XML:
     <document_metadata>
       Workbook has 1 sheet: Sheet1 (active). Selection: A1
     </document_metadata>
     User: Format column A as currency
  c) Attaches any uploaded files from VFS
  d) Adds message to RuntimeState.messages[]
  e) Emits state update → UI shows user message bubble

Step 3: LLM API CALL
─────────────────────
AgentRuntime passes message history to the configured LLM provider:
  → provider-config.ts builds the Model object (API type, endpoint, key)
  → Sends to Claude/GPT/Gemini with system prompt + available tools list
  → Streams response tokens back via SSE/WebSocket

Step 4: STREAMING RESPONSE
──────────────────────────
handleAgentEvent() processes each streaming event:
  - "text" events → Update assistant message text in UI (real-time typing)
  - "thinking" events → Show reasoning blocks
  - "tool_call" events → Show tool execution in progress

Step 5: TOOL EXECUTION
──────────────────────
LLM decides to call: getCellRanges({ sheetId: 1, ranges: ["A1:A100"] })
  a) AgentRuntime receives tool_call event
  b) Looks up tool in adapter's registered tools (EXCEL_TOOLS array)
  c) Executes getCellRanges:
     → Creates Excel.run(async (context) => { ... })
     → Gets worksheet, loads range values/formulas/styles
     → Calls context.sync() (round-trip to Office host)
     → Returns JSON result
  d) Tool result sent back to LLM as tool_result message

Step 6: LLM PROCESSES TOOL RESULT
──────────────────────────────────
LLM sees the cell data, decides to call:
  setCellRange({ sheetId: 1, range: "A1:A100", styles: { numberFormat: "$#,##0.00" } })
  a) Tool executes → formats cells as currency
  b) Returns { success: true, _dirtyRanges: ["Sheet1!A1:A100"] }

Step 7: POST-TOOL NAVIGATION
─────────────────────────────
adapter.onToolResult() fires:
  → Parses _dirtyRanges from JSON result
  → Calls navigateToRange("Sheet1!A1:A100")
  → Excel scrolls/selects the modified range

Step 8: FINAL RESPONSE
──────────────────────
LLM sends final text: "Done! I've formatted column A as currency ($#,##0.00)."
  → handleAgentEvent("text") updates UI
  → handleAgentEvent("finish") marks message complete
  → deriveStats() calculates token usage
  → State persisted to IndexedDB via storage service

Step 9: PERSISTENCE
───────────────────
  → Full message history saved to IndexedDB
  → Session metadata updated
  → VFS state synced if files were modified
```

---

## 4. How Each Excel Tool Works

| Tool | What It Does | Office.js API Used |
|------|-------------|-------------------|
| `getCellRanges` | Reads values, formulas, styles from ranges. Default limit: 2000 cells | `range.load("values,formulas,format")` + `context.sync()` |
| `getRangeAsCsv` | Returns range data as CSV string (more token-efficient) | `range.load("values")` + `context.sync()` |
| `setCellRange` | Writes values/formulas/styles to cells. Has overwrite protection | `range.values = [...]`, `range.format.fill.color = ...` |
| `clearCellRange` | Clears cell contents, formats, or both | `range.clear(clearType)` |
| `searchData` | Searches all cells for text/regex. Max 500 results, supports offset | Iterates `usedRange.values` array |
| `screenshotRange` | Captures range as PNG with row/col headers composited via Canvas | `range.getImage()` + Canvas API |
| `copyTo` | Copies a range to another location | `range.copyFrom(source)` |
| `modifySheetStructure` | Add/delete/rename/reorder sheets | `worksheets.add()`, `.delete()`, `.name = ...` |
| `modifyWorkbookStructure` | Workbook-level operations (named ranges, etc.) | Various workbook APIs |
| `resizeRange` | Insert/delete rows/columns | `range.insert()`, `range.delete()` |
| `getAllObjects` | Lists charts, tables, pivot tables, shapes | `sheet.charts`, `sheet.tables`, etc. |
| `modifyObject` | Edit chart/table properties | Object-specific APIs |
| `evalOfficeJs` | Execute arbitrary Office.js code (escape hatch) | `Excel.run()` with user code |
| `bashTool` | Run shell commands in VFS sandbox | SES compartment execution |
| `readTool` | Read uploaded files from VFS | VFS.readFile() |

---

## 5. How Each PowerPoint Tool Works

| Tool | What It Does |
|------|-------------|
| `screenshotSlide` | Captures slide as image for visual inspection |
| `listSlideShapes` | Lists all shapes on a slide with geometric properties |
| `readSlideText` | Extracts all text content from slide shapes |
| `verifySlides` | Validates slide structure and content |
| `editText` | Modifies text in specific shapes |
| `editSlideXml` | Direct OOXML manipulation for advanced edits |
| `editChart` | Modifies chart data and properties |
| `editMaster` | Edits slide master/layout templates |
| `duplicateSlide` | Copies slides within the presentation |
| `evalOfficeJs` | Execute arbitrary Office.js PowerPoint code |

---

## 6. How the Provider System Works

```
User selects provider in Settings UI
         │
         ▼
┌─────────────────────────────────────────┐
│         provider-config.ts               │
│                                          │
│  ProviderConfig {                        │
│    apiType: "anthropic-messages"         │
│    apiKey: "sk-ant-..."                  │
│    modelId: "claude-sonnet-4-20250514"        │
│    thinkingLevel: "medium"              │
│    proxyEnabled: false                   │
│    followMode: true                      │
│  }                                       │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  buildCustomModel(config) → Model        │
│                                          │
│  Sets: contextWindow (128K default)      │
│        maxTokens (32K default)           │
│        API endpoint URL                  │
│        Auth headers                      │
└─────────────┬───────────────────────────┘
              │
              ▼
   Passed to AgentRuntime → pi-ai library
   handles actual API calls + streaming
```

**Supported providers**: OpenAI (Completions + Responses API), Anthropic Messages, Google Generative AI, Google Vertex AI, Azure OpenAI, OpenAI Codex, Gemini CLI

**Auth methods**: Direct API key OR OAuth 2.0 with PKCE (Anthropic, OpenAI, Google)

---

## 7. How Storage & Persistence Works

```
┌──────────────────────────────┐
│       IndexedDB               │
│                               │
│  sessions store               │
│    ├─ id, title, createdAt    │
│    └─ lastMessageAt           │
│                               │
│  messages store               │
│    ├─ id, sessionId, role     │
│    ├─ content (parts[])       │
│    └─ timestamp, usage        │
│                               │
│  files store                  │
│    ├─ sessionId, path         │
│    ├─ content (binary)        │
│    └─ mimeType, size          │
│                               │
│  skills store                 │
│    ├─ name, source (markdown) │
│    └─ metadata, prompt        │
│                               │
│  config store                 │
│    └─ provider settings       │
└──────────────────────────────┘
```

- **Sessions**: Created on first message, persisted with full history
- **Messages**: Stored per-session, restored on session switch
- **Files**: VFS contents persisted, restored on session load
- **Config**: Provider settings saved to localStorage (separate from IndexedDB)

---

## 8. How the Security Sandbox Works

```
┌─────────────────────────────────────────┐
│  lockdown.ts — SES Initialization        │
│                                          │
│  1. saveFunctionProperties()             │
│     → Captures Function.prototype props  │
│     → Before SES freezes them            │
│                                          │
│  2. lockdown({                           │
│       errorTaming: 'unsafe',             │
│       overrideTaming: 'severe'           │
│     })                                   │
│     → Freezes all primordials            │
│     → Blocks: Function(), eval(),        │
│       Reflect, Proxy, import()           │
│                                          │
│  3. restoreFunctionProperties()          │
│     → Uses Proxy wrapper to restore      │
│       essential Function properties      │
│       while keeping SES protections      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  sandbox.ts — Code Execution             │
│                                          │
│  new Compartment({                       │
│    globals: {                            │
│      console, Math, Date,               │
│      atob, btoa,                         │
│      readFile, writeFile,                │
│      // NO: fetch, XMLHttpRequest,       │
│      //     Function, Reflect, Proxy     │
│    }                                     │
│  })                                      │
│                                          │
│  Restrictions:                           │
│  ✗ No network access                     │
│  ✗ No external runtimes (Node, Python)   │
│  ✓ Pipes, redirections, command chaining │
│  ✓ Output truncation: 100 lines / 256KB │
└─────────────────────────────────────────┘
```

---

## 9. How the Build & Dev System Works

| Tool | Purpose |
|------|---------|
| **pnpm** | Package manager with workspace support |
| **Vite 6.3** | Dev server + bundler for each add-in |
| **Svelte 5** | UI framework (compiles to vanilla JS) |
| **TypeScript 5.4** | Type checking |
| **Biome 2.3** | Linting + formatting (replaced ESLint + Prettier) |
| **Vitest** | Test framework |
| **Wrangler** | Cloudflare Pages deployment |

**Dev workflow**:
```bash
pnpm install                    # Install all deps
pnpm run dev-server:excel       # Start Excel add-in dev server (port 3000)
pnpm run dev-server:ppt         # Start PPT add-in dev server (port 3001)
pnpm run dev-server:word        # Start Word add-in dev server (port 3002)
pnpm run bridge                 # Start debug bridge
```

**Production**: Each add-in is deployed to Cloudflare Pages, loaded by Office via manifest URL.
