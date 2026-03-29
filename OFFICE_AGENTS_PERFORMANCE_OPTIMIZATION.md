# Office-Agents Performance Optimization Plan

> **Context**: After thorough analysis of [hewliyang/office-agents](https://github.com/hewliyang/office-agents) — a TypeScript monorepo providing AI-powered agents for Excel, PowerPoint, and Word — we identified **12 critical performance bottlenecks** causing slow response times during beta testing. This document provides actionable fixes organized by impact.

---

## Executive Summary

The primary slowness comes from **3 root causes**:
1. **Unbatched Office.js API calls** — each tool makes individual `context.sync()` round-trips instead of batching
2. **No caching layer** — document metadata, sheet structures, and tool results are re-fetched on every call
3. **Sequential tool execution** — the agent processes tools one-at-a-time when many could run in parallel

Fixing these alone should yield a **3-5x speedup** for typical Excel/PowerPoint operations.

---

## 1. CRITICAL: Batch Office.js API Calls (Expected: 2-3x speedup)

### Problem
Every Excel/PowerPoint tool triggers its own `Excel.run()` or `PowerPoint.run()` context, each with its own `context.sync()`. When the agent calls 5-6 tools in sequence (e.g., read range → search → set cells → format → screenshot), each sync is a round-trip to the Office host process (~50-200ms each).

### Current Pattern (Slow)
```typescript
// Each tool creates its own context — 6 tools = 6 round-trips
// set-cell-range.ts
async execute(params) {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);
    const range = sheet.getRange(address);
    range.values = values;
    await context.sync(); // Round-trip #1
  });
}

// get-cell-ranges.ts
async execute(params) {
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getItem(sheetName);
    const range = sheet.getRange(address);
    range.load("values,formulas,format");
    await context.sync(); // Round-trip #2
  });
}
```

### Fix: Shared Context Queue
```typescript
// packages/excel/src/lib/context-queue.ts
class OfficeContextQueue {
  private queue: Array<(context: Excel.RequestContext) => Promise<any>> = [];
  private flushTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_WINDOW_MS = 50; // Collect operations for 50ms

  enqueue<T>(operation: (context: Excel.RequestContext) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async (context) => {
        try { resolve(await operation(context)); }
        catch (e) { reject(e); }
      });
      this.scheduleFlush();
    });
  }

  private scheduleFlush() {
    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), this.BATCH_WINDOW_MS);
    }
  }

  private async flush() {
    this.flushTimeout = null;
    const batch = this.queue.splice(0);
    if (batch.length === 0) return;

    await Excel.run(async (context) => {
      // Execute ALL queued operations in a single context
      await Promise.all(batch.map(op => op(context)));
      await context.sync(); // Single round-trip for all operations
    });
  }
}

export const excelQueue = new OfficeContextQueue();
```

**Impact**: Reduces N round-trips to 1 for consecutive tool calls within the batch window.

---

## 2. CRITICAL: Cache Document Metadata (Expected: 40-60% reduction in repeated calls)

### Problem
`getDocumentMetadata()` in `adapter.ts` is called on every `sendMessage()`. It fetches all sheet names, structures, and properties each time, even though the document rarely changes between messages.

### Fix: TTL-based Metadata Cache
```typescript
// packages/excel/src/lib/metadata-cache.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string; // Content hash for invalidation
}

class MetadataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly TTL_MS = 5000; // 5-second TTL

  async get<T>(key: string, fetcher: () => Promise<T>, hashFn?: () => Promise<string>): Promise<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry && (now - entry.timestamp) < this.TTL_MS) {
      // If hash function provided, validate staleness
      if (hashFn) {
        const currentHash = await hashFn();
        if (currentHash === entry.hash) return entry.data;
      } else {
        return entry.data;
      }
    }

    const data = await fetcher();
    const hash = hashFn ? await hashFn() : '';
    this.cache.set(key, { data, timestamp: now, hash });
    return data;
  }

  invalidate(key?: string) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}

export const metadataCache = new MetadataCache();
```

### Usage in adapter.ts
```typescript
// Before (every message triggers full fetch):
async getDocumentMetadata() {
  return await fetchAllSheetMetadata(); // ~100-300ms
}

// After (cached with 5s TTL):
async getDocumentMetadata() {
  return metadataCache.get('doc-metadata', () => fetchAllSheetMetadata());
}
```

**Invalidate on write**: When `setCellRangeTool` or `modifySheetStructureTool` executes, call `metadataCache.invalidate()`.

---

## 3. CRITICAL: Parallel Tool Execution (Expected: 2-4x speedup for multi-tool responses)

### Problem
The `AgentRuntime` in `runtime.ts` processes tool calls sequentially via `handleAgentEvent`. When the LLM returns multiple tool calls (e.g., "read Sheet1!A1:A100" AND "read Sheet2!B1:B50"), they execute one after another.

### Fix: Concurrent Tool Dispatch
```typescript
// In runtime.ts handleAgentEvent or the tool execution layer:
async function executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  // Classify tools as read-only or mutating
  const readOnly = ['getCellRanges', 'getRangeAsCsv', 'searchData',
                     'screenshotRange', 'getAllObjects', 'readSlideText',
                     'listSlideShapes', 'screenshotSlide', 'verifySlides'];

  const reads = toolCalls.filter(tc => readOnly.includes(tc.name));
  const writes = toolCalls.filter(tc => !readOnly.includes(tc.name));

  // Execute all reads in parallel
  const readResults = await Promise.all(reads.map(tc => executeTool(tc)));

  // Execute writes sequentially (order matters)
  const writeResults: ToolResult[] = [];
  for (const tc of writes) {
    writeResults.push(await executeTool(tc));
  }

  // Merge results maintaining original order
  return toolCalls.map(tc => {
    const idx = reads.indexOf(tc);
    return idx >= 0 ? readResults[idx] : writeResults[writes.indexOf(tc)];
  });
}
```

**Impact**: When the LLM issues 3 read tool calls simultaneously, they complete in the time of 1 instead of 3.

---

## 4. HIGH: Optimize `searchData` Tool (Expected: 5-10x for large sheets)

### Problem
`searchData` likely iterates all cells linearly. On a 10,000-row spreadsheet, this is extremely slow. The default limit is 500 results with no early termination optimization.

### Fix: Range-scoped search with early termination
```typescript
// packages/excel/src/lib/tools/search-data.ts — improved implementation
async function searchDataOptimized(
  context: Excel.RequestContext,
  params: SearchParams
): Promise<SearchResult[]> {
  const sheet = context.workbook.worksheets.getItem(params.sheetName);

  // 1. Get used range only (skip empty cells)
  const usedRange = sheet.getUsedRange(true /* valuesOnly */);
  usedRange.load("address,values,rowCount,columnCount");
  await context.sync();

  if (!usedRange.address) return [];

  const results: SearchResult[] = [];
  const regex = params.useRegex
    ? new RegExp(params.query, params.caseSensitive ? '' : 'i')
    : null;
  const searchStr = params.caseSensitive ? params.query : params.query.toLowerCase();
  const maxResults = params.maxResults ?? 500;
  const values = usedRange.values;

  // 2. Early termination — stop as soon as we hit maxResults
  outer:
  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      const cellValue = String(values[row][col] ?? '');
      const match = regex
        ? regex.test(cellValue)
        : (params.caseSensitive ? cellValue : cellValue.toLowerCase()).includes(searchStr);

      if (match) {
        results.push({ row, col, value: cellValue, address: toA1(row, col) });
        if (results.length >= maxResults) break outer; // EARLY EXIT
      }
    }
  }

  return results;
}
```

**Key changes**: Use `getUsedRange(true)` to skip empty areas, add early termination, avoid loading formulas/styles unless needed.

---

## 5. HIGH: Debounce Navigation and State Emissions (Expected: smoother UI, fewer re-renders)

### Problem
In `adapter.ts`, `onToolResult` parses dirty ranges and immediately navigates to each one. If the agent modifies 5 ranges rapidly, there are 5 navigation calls causing UI thrashing. Similarly, `AgentRuntime.emit()` fires on every streaming token, causing excessive Svelte re-renders.

### Fix A: Debounce dirty range navigation
```typescript
// packages/excel/src/lib/adapter.ts
let navigationTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingRanges: string[] = [];

function debouncedNavigate(ranges: string[]) {
  pendingRanges = ranges; // Keep latest
  if (navigationTimeout) clearTimeout(navigationTimeout);
  navigationTimeout = setTimeout(() => {
    // Navigate to the last dirty range only
    const lastRange = pendingRanges[pendingRanges.length - 1];
    if (lastRange) navigateToRange(lastRange);
    pendingRanges = [];
  }, 300); // 300ms debounce
}
```

### Fix B: Throttle runtime state emissions
```typescript
// packages/sdk/src/runtime.ts
private emitThrottled = throttle((state: RuntimeState) => {
  for (const listener of this.listeners) {
    listener(state);
  }
}, 100); // Max 10 updates/second during streaming

// Use emitThrottled() for streaming token events
// Use emit() (immediate) for final/complete events
```

---

## 6. HIGH: Optimize Screenshot Tool (Expected: 50-70% faster screenshots)

### Problem
`screenshotRangeTool` captures the range image, then composites row/column headers using the Canvas API. This involves:
- Loading column widths and row heights (separate API calls)
- Creating a full canvas, drawing headers, compositing the image
- Converting to PNG

### Fix: Offscreen Canvas + Skip Headers for Large Ranges
```typescript
// packages/excel/src/lib/tools/screenshot-range.ts
async function optimizedScreenshot(params: ScreenshotParams): Promise<string> {
  const { range, includeHeaders = true } = params;

  // 1. Capture range image directly
  const imageBase64 = await captureRangeImage(range);

  // 2. For ranges > 50 columns or > 100 rows, skip header compositing
  //    (headers become unreadable at that scale anyway)
  const [rows, cols] = getRangeDimensions(range);
  if (!includeHeaders || rows > 100 || cols > 50) {
    return imageBase64; // Return raw image — skip expensive compositing
  }

  // 3. Use OffscreenCanvas if available (doesn't block main thread)
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(width, height)
    : document.createElement('canvas');

  // ... compositing logic with headers ...
}
```

---

## 7. HIGH: Implement Tool Result Caching (Expected: avoid redundant API calls)

### Problem
The LLM often reads the same range multiple times within a conversation (e.g., reads A1:A100, processes it, then reads it again to verify). Each call hits the Office API.

### Fix: Short-lived read cache
```typescript
// packages/sdk/src/tool-cache.ts
class ToolResultCache {
  private cache = new Map<string, { result: any; timestamp: number }>();
  private readonly TTL_MS = 10_000; // 10s cache for reads

  private makeKey(toolName: string, params: Record<string, any>): string {
    return `${toolName}:${JSON.stringify(params)}`;
  }

  get(toolName: string, params: Record<string, any>): any | null {
    const key = this.makeKey(toolName, params);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  set(toolName: string, params: Record<string, any>, result: any) {
    const key = this.makeKey(toolName, params);
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  // Invalidate all caches when a write tool executes
  invalidateAll() {
    this.cache.clear();
  }
}
```

**Integration**: Wrap read tools with cache lookup; invalidate on any write tool execution.

---

## 8. MEDIUM: Reduce LLM Token Consumption (Expected: 30-50% fewer tokens per turn)

### Problem
Large cell ranges sent as tool results consume massive token counts, slowing the LLM's processing time (which is proportional to input + output tokens). A 2000-cell read returns all values, formulas, AND styles — even when the agent only needs values.

### Fix A: Default `includeStyles: false`
```typescript
// packages/excel/src/lib/tools/get-cell-ranges.ts
// Change default from true to false
const includeStyles = params.includeStyles ?? false; // Was: true
```
The agent can explicitly request styles when needed. For 90% of operations, values + formulas suffice.

### Fix B: Compress tool results
```typescript
// packages/sdk/src/tool-result-compressor.ts
function compressToolResult(result: string, maxTokens: number = 4000): string {
  // Estimate token count (~4 chars per token)
  const estimatedTokens = result.length / 4;

  if (estimatedTokens <= maxTokens) return result;

  // For large results, truncate with summary
  const truncated = result.slice(0, maxTokens * 4);
  return `${truncated}\n\n... [Truncated: ${estimatedTokens.toFixed(0)} tokens total. ` +
    `Use a narrower range or increase cellLimit to see more.]`;
}
```

### Fix C: Use CSV format for large reads
```typescript
// When cellCount > 500, auto-switch to CSV format (much more token-efficient)
async function smartGetCellRanges(params) {
  const cellCount = estimateCellCount(params.ranges);
  if (cellCount > 500) {
    // Redirect to getRangeAsCsv which is ~60% more token-efficient
    return getRangeAsCsv({ ...params, includeStyles: false });
  }
  return getCellRanges(params);
}
```

---

## 9. MEDIUM: Lazy-Load SES Lockdown (Expected: 200-500ms faster startup)

### Problem
`lockdown.ts` runs `saveFunctionProperties()` and creates Proxy wrappers during module initialization. This blocks the add-in's startup.

### Fix: Defer lockdown to first sandbox use
```typescript
// packages/sdk/src/lockdown.ts
let isLocked = false;

export function ensureLockdown() {
  if (isLocked) return;
  saveFunctionProperties();
  lockdown({ errorTaming: 'unsafe', overrideTaming: 'severe' });
  restoreFunctionProperties();
  isLocked = true;
}

// packages/sdk/src/sandbox.ts
async function evaluate(code: string) {
  ensureLockdown(); // Lazy init on first use
  // ... existing sandbox logic
}
```

---

## 10. MEDIUM: Implement Message Compaction (Expected: prevents slowdown over long sessions)

### Problem
As conversations grow, the entire message history is sent to the LLM on every turn. After 20+ turns with large tool results, the context window fills up, causing:
- Slower LLM inference (time ∝ token count)
- Higher API costs
- Eventually hitting context limits

### Fix: Sliding window with summarization
```typescript
// packages/sdk/src/compaction.ts
interface CompactionConfig {
  maxContextTokens: number;    // e.g., 100_000 for Claude
  compactionThreshold: number; // e.g., 0.80 (80% full)
  keepRecentTurns: number;     // e.g., 4 most recent turns untouched
}

async function compactMessages(
  messages: AgentMessage[],
  config: CompactionConfig,
  summarizer: (msgs: AgentMessage[]) => Promise<string>
): Promise<AgentMessage[]> {
  const totalTokens = estimateTokens(messages);

  if (totalTokens < config.maxContextTokens * config.compactionThreshold) {
    return messages; // No compaction needed
  }

  // Keep system message + recent turns
  const systemMsg = messages[0];
  const recentTurns = messages.slice(-config.keepRecentTurns * 2);
  const oldMessages = messages.slice(1, -config.keepRecentTurns * 2);

  // Summarize old messages
  const summary = await summarizer(oldMessages);

  return [
    systemMsg,
    { role: 'assistant', content: `[Previous conversation summary]\n${summary}` },
    ...recentTurns,
  ];
}
```

---

## 11. MEDIUM: Optimize PowerPoint Theme Detection (Expected: eliminates 200-400ms on first load)

### Problem
`detectThemeDefault()` in the PowerPoint adapter compares presentation colors against Microsoft's entire palette with confidence scoring. This runs on every metadata fetch.

### Fix: Cache theme detection result per document
```typescript
// packages/powerpoint/src/lib/adapter.ts
let cachedTheme: { docId: string; theme: ThemeResult } | null = null;

async function detectThemeCached(docId: string): Promise<ThemeResult> {
  if (cachedTheme && cachedTheme.docId === docId) {
    return cachedTheme.theme;
  }
  const theme = await detectThemeDefault();
  cachedTheme = { docId, theme };
  return theme;
}
```

---

## 12. LOW: Web Search & Fetch Optimizations

### Problem
Web search tools (DuckDuckGo, Brave, Serper, Exa) and `fetch` make blocking HTTP requests without timeout or caching.

### Fix
```typescript
// packages/sdk/src/web.ts improvements
const fetchCache = new Map<string, { html: string; ts: number }>();
const FETCH_CACHE_TTL = 60_000; // 1 minute

async function cachedFetch(url: string): Promise<string> {
  const cached = fetchCache.get(url);
  if (cached && Date.now() - cached.ts < FETCH_CACHE_TTL) return cached.html;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    const html = await res.text();
    fetchCache.set(url, { html, ts: Date.now() });
    return html;
  } finally {
    clearTimeout(timeout);
  }
}
```

---

## Implementation Priority Matrix

| # | Optimization | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Batch Office.js API calls | 🔴 Very High | Medium | **P0** |
| 2 | Cache document metadata | 🔴 Very High | Low | **P0** |
| 3 | Parallel tool execution | 🔴 Very High | Medium | **P0** |
| 4 | Optimize searchData | 🟠 High | Low | **P1** |
| 5 | Debounce navigation/emissions | 🟠 High | Low | **P1** |
| 6 | Optimize screenshots | 🟠 High | Low | **P1** |
| 7 | Tool result caching | 🟠 High | Medium | **P1** |
| 8 | Reduce LLM token usage | 🟡 Medium | Low | **P2** |
| 9 | Lazy SES lockdown | 🟡 Medium | Low | **P2** |
| 10 | Message compaction | 🟡 Medium | High | **P2** |
| 11 | Cache theme detection | 🟡 Medium | Low | **P2** |
| 12 | Web fetch optimizations | 🟢 Low | Low | **P3** |

---

## Estimated Overall Impact

| Scenario | Before (est.) | After (est.) | Speedup |
|----------|--------------|-------------|---------|
| Simple cell read | 1-2s | 0.3-0.5s | ~3-4x |
| Multi-range write + format | 5-8s | 1.5-2.5s | ~3x |
| Search 10K rows | 8-15s | 1-3s | ~5-8x |
| 20-turn conversation | 10-15s/turn | 3-5s/turn | ~3x |
| PowerPoint slide edit | 3-5s | 1-2s | ~2-3x |
| Add-in startup | 2-4s | 1-2s | ~2x |

---

## Quick Wins (Can implement in < 1 day)

1. **Set `includeStyles: false` as default** in `getCellRangesTool` — single line change, saves ~30% tokens
2. **Add metadata cache** with 5s TTL in `adapter.ts` — ~50 lines of code
3. **Debounce dirty range navigation** — ~15 lines of code
4. **Early termination in searchData** — ~5 lines added to loop
5. **Lazy lockdown initialization** — move existing code behind a flag
6. **Cache theme detection** — ~10 lines of code

These 6 changes alone should noticeably improve responsiveness during beta testing.

---

## Additional SDK-Level Bottlenecks (Deep Dive Findings)

The following bottlenecks were found in the SDK core (`packages/sdk/src/`) and affect all Office apps equally.

### 13. CRITICAL: Image Resize Blocks Main Thread

**File**: `packages/sdk/src/image-resize.ts`

The `resizeImage()` function performs CPU-intensive canvas rendering **synchronously on the main thread**. It tries both PNG and JPEG formats via `tryBothFormats()` — encoding the image twice just to compare sizes — then progressively reduces quality (0.85 → 0.4) and dimensions (100% → 25%) in a sequential loop.

**Fix**: Move to a Web Worker + try JPEG first (skip PNG if under size limit):
```typescript
// web-worker approach
const worker = new Worker(new URL('./image-worker.ts', import.meta.url));

async function resizeImageAsync(blob: Blob, maxBytes: number): Promise<Blob> {
  return new Promise((resolve) => {
    worker.postMessage({ blob, maxBytes });
    worker.onmessage = (e) => resolve(e.data.result);
  });
}

// Smarter format selection — avoid double-encoding
async function smartEncode(canvas: OffscreenCanvas, maxBytes: number): Promise<Blob> {
  // Try JPEG first (almost always smaller)
  const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  if (jpeg.size <= maxBytes) return jpeg;
  // Only try PNG if JPEG fails (rare for photos)
  const png = await canvas.convertToBlob({ type: 'image/png' });
  return png.size < jpeg.size ? png : jpeg;
}
```

### 14. CRITICAL: PDF Loading Buffers Entire Document

**File**: `packages/sdk/src/pdf.ts`

`loadPdfDocument()` copies the entire PDF into memory with `slice()` and disables the PDF.js worker (`useWorkerFetch: false`), forcing synchronous parsing.

**Fix**: Enable worker fetch and implement page-level lazy loading:
```typescript
async function loadPdfDocument(data: ArrayBuffer) {
  const pdf = await pdfjsLib.getDocument({
    data,
    useWorkerFetch: true,  // Enable async worker parsing
    disableAutoFetch: true, // Don't preload all pages
    disableStream: false,   // Enable streaming
  }).promise;
  return pdf;
}

// Load pages on demand, not all at once
async function getPageText(pdf: PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();
  return content.items.map(item => item.str).join(' ');
}
```

### 15. HIGH: `truncateTail()` Uses O(n²) Array Pattern

**File**: `packages/sdk/src/truncate.ts`

`truncateTail()` uses `unshift()` to prepend each line, which is O(n) per call (shifts entire array). Over 2000 lines, this becomes O(n²).

**Fix**: Collect in reverse with `push()`, then `reverse()` once:
```typescript
// Before (O(n²)):
for (const line of lines) {
  result.unshift(line); // O(n) each time
}

// After (O(n)):
const result: string[] = [];
for (let i = lines.length - 1; i >= 0; i--) {
  if (byteCount + lines[i].length > maxBytes) break;
  byteCount += lines[i].length;
  result.push(lines[i]); // O(1)
}
result.reverse(); // O(n) once
```

### 16. HIGH: IndexedDB Missing Compound Indexes

**File**: `packages/sdk/src/storage/db.ts`

Session and file queries lack proper compound indexes, causing full table scans for lookups like "get all files for session X."

**Fix**: Add compound indexes:
```typescript
// In IndexedDB schema upgrade
const fileStore = db.createObjectStore('files', { keyPath: 'id' });
fileStore.createIndex('sessionPath', ['sessionId', 'path'], { unique: true });
fileStore.createIndex('sessionId', 'sessionId', { unique: false });

const skillStore = db.createObjectStore('skills', { keyPath: 'id' });
skillStore.createIndex('skillPath', ['skillName', 'path'], { unique: true });
```

### 17. HIGH: VFS Has No File Metadata Cache

**File**: `packages/sdk/src/vfs/index.ts`

`readFile()`, `fileExists()`, and `detectImageMimeType()` have no caching. MIME detection reads file headers every access. Session restore reads all files from IndexedDB eagerly.

**Fix**: Cache metadata + lazy content loading:
```typescript
class CachedVFS {
  private metadataCache = new Map<string, { size: number; mimeType: string; modified: number }>();

  async getMetadata(path: string) {
    if (this.metadataCache.has(path)) return this.metadataCache.get(path)!;
    const meta = await this.computeMetadata(path);
    this.metadataCache.set(path, meta);
    return meta;
  }

  // On session restore: load metadata only, defer content to first read
  async restoreSession(sessionId: string) {
    const entries = await this.db.getAllMetadata(sessionId); // New: metadata-only query
    for (const entry of entries) {
      this.metadataCache.set(entry.path, entry);
    }
    // File contents loaded lazily on first readFile() call
  }
}
```

### 18. MEDIUM: OAuth Token Refresh Race Condition

**File**: `packages/sdk/src/oauth/index.ts`

Multiple concurrent API calls can trigger simultaneous `refreshOAuthToken()` calls with no mutex.

**Fix**: Deduplicate with a shared promise:
```typescript
let refreshPromise: Promise<OAuthTokens> | null = null;

async function refreshOAuthTokenSafe(provider: string): Promise<OAuthTokens> {
  if (refreshPromise) return refreshPromise; // Reuse in-flight refresh

  refreshPromise = (async () => {
    try {
      return await refreshOAuthToken(provider);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
```

### 19. MEDIUM: Web Search Results Not Cached

**File**: `packages/sdk/src/web/search.ts`

The fallback chain (DuckDuckGo → Brave → Serper → Exa) retries on failure without caching successful results. HTML-to-Markdown conversion via Readability + TurndownService runs on every fetch.

**Fix**: Add 1-hour result cache + memoize conversions:
```typescript
const searchCache = new Map<string, { results: SearchResult[]; ts: number }>();
const SEARCH_CACHE_TTL = 3_600_000; // 1 hour

async function cachedSearch(query: string, provider: string): Promise<SearchResult[]> {
  const key = `${provider}:${query}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL) return cached.results;

  const results = await executeSearch(query, provider);
  searchCache.set(key, { results, ts: Date.now() });
  return results;
}
```

---

## Updated Priority Matrix (All 19 Optimizations)

| # | Optimization | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Batch Office.js API calls | 🔴 Very High | Medium | **P0** |
| 2 | Cache document metadata | 🔴 Very High | Low | **P0** |
| 3 | Parallel tool execution | 🔴 Very High | Medium | **P0** |
| 13 | Move image resize to Web Worker | 🔴 Very High | Medium | **P0** |
| 14 | Lazy PDF page loading + enable worker | 🔴 Very High | Low | **P0** |
| 4 | Optimize searchData | 🟠 High | Low | **P1** |
| 5 | Debounce navigation/emissions | 🟠 High | Low | **P1** |
| 6 | Optimize screenshots | 🟠 High | Low | **P1** |
| 7 | Tool result caching | 🟠 High | Medium | **P1** |
| 15 | Fix O(n²) truncateTail | 🟠 High | Low | **P1** |
| 16 | Add IndexedDB compound indexes | 🟠 High | Low | **P1** |
| 17 | VFS metadata cache + lazy restore | 🟠 High | Medium | **P1** |
| 8 | Reduce LLM token usage | 🟡 Medium | Low | **P2** |
| 9 | Lazy SES lockdown | 🟡 Medium | Low | **P2** |
| 10 | Message compaction | 🟡 Medium | High | **P2** |
| 11 | Cache theme detection | 🟡 Medium | Low | **P2** |
| 18 | OAuth token refresh mutex | 🟡 Medium | Low | **P2** |
| 19 | Web search result caching | 🟡 Medium | Low | **P2** |
| 12 | Web fetch optimizations | 🟢 Low | Low | **P3** |
