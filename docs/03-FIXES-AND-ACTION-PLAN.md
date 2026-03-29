# Office-Agents: What Needs to Be Fixed — Action Plan

> **Goal**: Reduce typical agent turn time from **4-12 seconds → 2-4 seconds**
> **Approach**: Fix in priority order — Critical first, then High, then Medium

---

## Phase 1: Critical Fixes (Week 1) — Target: 3-5x speedup

### FIX-01: Batch Office.js API Calls via Context Queue

**Bug**: BUG-01 | **File**: New `packages/excel/src/lib/context-queue.ts` + modify all tools

**What to build**: A shared context queue that collects Office.js operations within a 50ms window and executes them all in a single `Excel.run()` / `context.sync()`.

**Implementation**:
1. Create `OfficeContextQueue` class with `enqueue()` method
2. Each tool calls `excelQueue.enqueue((context) => { ... })` instead of `Excel.run()`
3. Queue auto-flushes after 50ms or when a result is awaited
4. Single `context.sync()` for all batched operations

**Files to modify**:
- NEW: `packages/excel/src/lib/context-queue.ts`
- MODIFY: Every file in `packages/excel/src/lib/tools/` — replace `Excel.run()` with queue
- NEW: `packages/powerpoint/src/lib/context-queue.ts` (same pattern)
- MODIFY: Every file in `packages/powerpoint/src/lib/tools/`

**Effort**: 2-3 days | **Impact**: Reduces N round-trips to 1

---

### FIX-02: Cache Document Metadata with TTL

**Bug**: BUG-02 | **File**: `packages/excel/src/lib/adapter.ts`

**What to build**: A simple TTL cache (5 seconds) for `getDocumentMetadata()`. Invalidate when any write tool executes.

**Implementation**:
1. Add `MetadataCache` class (Map-based, with timestamp per entry)
2. Wrap `getDocumentMetadata()` with cache lookup
3. On tool result with `_dirtyRanges`, call `cache.invalidate()`

**Files to modify**:
- MODIFY: `packages/excel/src/lib/adapter.ts`
- MODIFY: `packages/powerpoint/src/lib/adapter.ts`

**Effort**: 0.5 day | **Impact**: Eliminates 100-300ms per message

---

### FIX-03: Parallel Execution for Read-Only Tools

**Bug**: BUG-03 | **File**: `packages/sdk/src/runtime.ts`

**What to build**: Classify tools as read-only or mutating. Execute all read-only tool calls concurrently with `Promise.all()`. Execute writes sequentially.

**Implementation**:
1. Add `readonly: true` flag to tool definitions for: getCellRanges, getRangeAsCsv, searchData, screenshotRange, getAllObjects, readSlideText, listSlideShapes, screenshotSlide, verifySlides, readTool
2. In the tool execution handler, separate concurrent reads from sequential writes
3. Use `Promise.all()` for reads, sequential `for` loop for writes

**Files to modify**:
- MODIFY: `packages/sdk/src/runtime.ts` (tool execution section)
- MODIFY: Tool definition types to include `readonly` flag

**Effort**: 1 day | **Impact**: N parallel reads run in time of 1

---

### FIX-04: Move Image Resize to Web Worker

**Bug**: BUG-04 | **File**: `packages/sdk/src/image-resize.ts`

**What to build**: Offload image resize to a Web Worker using `OffscreenCanvas`. Also optimize encoding order (JPEG first).

**Implementation**:
1. Create `image-worker.ts` with resize logic
2. Main thread posts image Blob to worker, receives compressed Blob back
3. In worker: try JPEG first (quality 0.85), only try PNG if JPEG > size limit
4. Fallback to main-thread Canvas for browsers without OffscreenCanvas

**Files to modify**:
- MODIFY: `packages/sdk/src/image-resize.ts`
- NEW: `packages/sdk/src/image-worker.ts`

**Effort**: 1 day | **Impact**: UI no longer freezes during image processing

---

### FIX-05: Lazy PDF Loading with Worker Enabled

**Bug**: BUG-05 | **File**: `packages/sdk/src/pdf.ts`

**What to build**: Enable pdf.js worker mode and implement page-level lazy loading.

**Implementation**:
1. Set `useWorkerFetch: true`, `disableAutoFetch: true`, `disableStream: false`
2. Don't extract all pages upfront — load pages on demand via `pdf.getPage(n)`
3. Remove the `slice()` copy of input data (unnecessary memory duplication)

**Files to modify**:
- MODIFY: `packages/sdk/src/pdf.ts`

**Effort**: 0.5 day | **Impact**: 10x faster for large PDFs, no UI freeze

---

## Phase 2: High-Priority Fixes (Week 2) — Target: polish specific workflows

### FIX-06: Optimize searchData with Used Range + Early Exit

**Bug**: BUG-06 | **File**: `packages/excel/src/lib/tools/search-data.ts`

**What to change**:
1. Use `sheet.getUsedRange(true)` to skip empty regions
2. Add `break` when `results.length >= maxResults` (early termination)
3. For regex: pre-compile the pattern once outside the loop

**Effort**: 0.5 day | **Impact**: 5-10x faster on large sheets

---

### FIX-07: Optimize screenshotRange — Skip Headers for Large Ranges

**Bug**: BUG-07 | **File**: `packages/excel/src/lib/tools/screenshot-range.ts`

**What to change**:
1. If range > 50 cols or > 100 rows, return raw image without header compositing
2. Use `OffscreenCanvas` when available
3. Batch the column-width and row-height API calls into one `context.sync()`

**Effort**: 0.5 day | **Impact**: 50-70% faster screenshots

---

### FIX-08: Throttle State Emissions During Streaming

**Bug**: BUG-08 | **File**: `packages/sdk/src/runtime.ts`

**What to change**:
1. During streaming (text/thinking events), throttle `emit()` to max 10 calls/second
2. On completion/error events, emit immediately (no throttle)
3. Use a simple `requestAnimationFrame` or `setTimeout` throttle

**Effort**: 0.5 day | **Impact**: 3-5x fewer re-renders during streaming

---

### FIX-09: Debounce Dirty Range Navigation

**Bug**: BUG-09 | **File**: `packages/excel/src/lib/adapter.ts`

**What to change**:
1. Collect dirty ranges in a buffer
2. After 300ms of no new ranges, navigate to the last one
3. Use `clearTimeout` / `setTimeout` pattern

**Effort**: 2 hours | **Impact**: No more flickering during multi-tool turns

---

### FIX-10: Fix O(n²) truncateTail

**Bug**: BUG-10 | **File**: `packages/sdk/src/truncate.ts`

**What to change**:
Replace `unshift()` loop with `push()` + `reverse()`:
```
Before: for each line → result.unshift(line)  // O(n²)
After:  for each line (reverse) → result.push(line); result.reverse()  // O(n)
```

**Effort**: 1 hour | **Impact**: Large file truncation goes from ~200ms to <5ms

---

### FIX-11: Add IndexedDB Compound Indexes

**Bug**: BUG-11 | **File**: `packages/sdk/src/storage/db.ts`

**What to change**:
In the IndexedDB upgrade handler, add:
- `files` store: index on `["sessionId", "path"]`
- `skills` store: index on `["skillName", "path"]`
- `messages` store: index on `["sessionId", "timestamp"]`

**Effort**: 1 hour | **Impact**: Session restore goes from O(n) scan to O(1) lookup

---

### FIX-12: Add VFS Metadata Cache + Lazy Content Loading

**Bug**: BUG-12 | **File**: `packages/sdk/src/vfs/index.ts`

**What to change**:
1. Cache file metadata (size, mimeType, lastModified) in a Map
2. On session restore, load metadata only from IndexedDB — defer content to first `readFile()`
3. Cache MIME type detection result per file path

**Effort**: 1 day | **Impact**: Faster session restore, no redundant reads

---

## Phase 3: Medium-Priority Fixes (Week 3) — Target: token efficiency + edge cases

### FIX-13: Default includeStyles to false

**Bug**: BUG-13 | **File**: `packages/excel/src/lib/tools/get-cell-ranges.ts`

**What to change**: One line — change `params.includeStyles ?? true` to `params.includeStyles ?? false`

**Effort**: 5 minutes | **Impact**: 30-50% fewer tokens per cell read

---

### FIX-14: Implement Message Compaction

**Bug**: BUG-14 | **File**: `packages/sdk/src/runtime.ts` + new `compaction.ts`

**What to build**:
1. Before sending messages to LLM, estimate total tokens
2. If > 80% of context window: summarize old messages (keep last 4 turns intact)
3. Replace old messages with summary message
4. Use a cheap/fast model for summarization (e.g., GPT-4o-mini, Haiku)

**Effort**: 2-3 days | **Impact**: Prevents degradation over long sessions

---

### FIX-15: Lazy SES Lockdown

**Bug**: BUG-15 | **File**: `packages/sdk/src/lockdown.ts`

**What to change**: Wrap lockdown in a lazy `ensureLockdown()` function. Call it from `sandbox.ts` on first use instead of at module load.

**Effort**: 1 hour | **Impact**: 200-500ms faster startup

---

### FIX-16: OAuth Token Refresh Mutex

**Bug**: BUG-16 | **File**: `packages/sdk/src/oauth/index.ts`

**What to change**: Store the in-flight refresh Promise. If a second refresh is requested while one is in progress, return the existing Promise instead of starting a new one.

**Effort**: 1 hour | **Impact**: No more auth race conditions

---

### FIX-17: Cache Web Search Results

**Bug**: BUG-17 | **File**: `packages/sdk/src/web/search.ts`

**What to change**: Add a Map-based cache keyed by `(provider, query)` with 1-hour TTL. Also cache HTML-to-Markdown conversions by URL.

**Effort**: 2 hours | **Impact**: No duplicate API calls for same query

---

## Phase 4: Low-Priority Fixes (When Convenient)

### FIX-18: Cache PowerPoint Theme Detection

**Bug**: BUG-18 | Cache `detectThemeDefault()` result per document ID.

**Effort**: 30 minutes

### FIX-19: Bound Bridge Event Accumulation

**Bug**: BUG-19 | Add a circular buffer (max 1000 events) to session state.

**Effort**: 30 minutes

---

## Implementation Checklist

### Week 1 — Critical Path
- [ ] FIX-01: Build `OfficeContextQueue` and migrate all Excel tools
- [ ] FIX-01b: Build equivalent for PowerPoint tools
- [ ] FIX-02: Add metadata cache to Excel adapter
- [ ] FIX-02b: Add metadata cache to PowerPoint adapter
- [ ] FIX-03: Add parallel read tool execution in runtime.ts
- [ ] FIX-04: Move image resize to Web Worker
- [ ] FIX-05: Enable PDF.js worker + lazy page loading
- [ ] Run beta tests — measure before/after times

### Week 2 — High Priority
- [ ] FIX-06: Optimize searchData (usedRange + early exit)
- [ ] FIX-07: Optimize screenshotRange (skip headers for large ranges)
- [ ] FIX-08: Throttle state emissions during streaming
- [ ] FIX-09: Debounce dirty range navigation
- [ ] FIX-10: Fix O(n²) truncateTail
- [ ] FIX-11: Add IndexedDB compound indexes
- [ ] FIX-12: VFS metadata cache + lazy content loading
- [ ] Run beta tests — measure improvement

### Week 3 — Medium Priority
- [ ] FIX-13: Default includeStyles to false (5-minute change)
- [ ] FIX-14: Implement message compaction system
- [ ] FIX-15: Lazy SES lockdown
- [ ] FIX-16: OAuth token refresh mutex
- [ ] FIX-17: Cache web search results
- [ ] FIX-18: Cache PPT theme detection
- [ ] FIX-19: Bound bridge events

---

## Expected Results After All Fixes

| Metric | Before | After Phase 1 | After All Phases |
|--------|--------|---------------|-----------------|
| Simple cell read | 1-2s | 0.3-0.5s | 0.2-0.4s |
| Multi-range write + format | 5-8s | 1.5-2.5s | 1-2s |
| Search 10K rows | 8-15s | 3-5s | 1-3s |
| 20-turn conversation | 10-15s/turn | 4-6s/turn | 2-4s/turn |
| PPT slide edit | 3-5s | 1.5-2.5s | 1-2s |
| Add-in startup | 2-4s | 1.5-3s | 1-2s |
| UI smoothness during streaming | Janky | Smooth | Smooth |
| Image upload freeze | 0.5-2s | 0ms | 0ms |
| Long session degradation | Severe after 20 turns | Moderate | None (compaction) |

---

## How to Measure (Before You Start Fixing)

Add these timing markers to establish a baseline:

```typescript
// In runtime.ts — wrap tool execution
const start = performance.now();
const result = await executeTool(toolCall);
const elapsed = performance.now() - start;
console.log(`[perf] ${toolCall.name}: ${elapsed.toFixed(0)}ms`);

// In adapter.ts — wrap metadata fetch
const start = performance.now();
const metadata = await getDocumentMetadata();
console.log(`[perf] metadata: ${(performance.now() - start).toFixed(0)}ms`);

// In runtime.ts — wrap full turn
const turnStart = performance.now();
// ... entire sendMessage flow ...
console.log(`[perf] full turn: ${(performance.now() - turnStart).toFixed(0)}ms`);
```

Run 10 representative tasks, record times, then fix and re-measure.
