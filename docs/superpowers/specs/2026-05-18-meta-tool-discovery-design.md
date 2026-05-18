# Meta-Tool Discovery — Design Spec

**Status:** Approved for planning
**Date:** 2026-05-18
**Audience:** Future implementer (and reviewers)

## Problem

Some MCP servers expose a small native tool list whose real purpose is to *discover* a much larger catalog: `list_tools`, `search_tools`, `describe_tool`, `invoke_tool`, etc. Today the explorer treats these as ordinary tools — the user can call them manually and read the JSON, but the results don't feed back into the UI.

Goal: detect these "meta-tools" automatically at connect time and, when the user opens one, surface a button that — on click — runs the appropriate discovery strategy and merges the resulting tools into the visible catalog. Detection is automatic; discovery execution is always user-triggered.

## Goals

- Recognize the common meta-tool patterns automatically (high precision, acceptable recall).
- For every recognized pattern, provide a one-click strategy that aims to discover the **full** catalog — falling back to wildcards, alphabet sweeps, or pagination where needed.
- Display discovered tools in the existing tool list, deduped against native tools.
- Allow invocation of discovered tools, routing through a proxy meta-tool when the pattern requires it.
- Stay client-only; no backend, no persistence.

## Non-goals

- Persisting discovered catalogs across page reloads or reconnects (v1 is in-memory).
- Auto-running discovery on connect (user-triggered only).
- Browsing MCP resources or prompts — only tools.
- Multi-server discovery merging (each server's catalog stays scoped to that server).
- A UI to manually override detection / mark a tool as meta-tool by hand (deferred to v2).

## Meta-tool patterns (taxonomy)

The 8 patterns the explorer needs to handle:

| Kind | Shape | Coverage strategy |
|---|---|---|
| `bulk_list` | No required inputs, returns full array | One call |
| `paginated_list` | bulk_list + `cursor`/`page`/`offset` | Walk pages until empty |
| `search` | Required `query`/`q`/`keywords` | Probe sequence; optional alphabet sweep |
| `hybrid_index` | Shallow listing paired with `hybrid_describe` | List, then fan-out describe |
| `hybrid_describe` | `describe_tool(name)` — paired with index | (invoked by hybrid_index) |
| `category_index` | Lists categories, paired with `category_list` | List, fan-out per-category |
| `category_list` | `list_tools_in(category)` | (invoked by category_index) |
| `enable_capability` | `enable(capability)` — mutates server state | Enum-driven enable + `tools/list_changed` refresh; otherwise manual |
| `proxy_invoke` | `invoke_tool(name, args)` aggregator | Listing delegated to another meta-tool; tagged for invocation routing |
| `manifest` | Single blob (OpenAPI / catalog) | One call, multi-shape parser |

## Architecture

Pure client-side, three layers:

1. **Detection** (`lib/discovery/detect.ts`) — runs once after `client.listTools()`, classifies tools into `MetaToolBinding`s.
2. **Strategies** (`lib/discovery/strategies/*`) — one module per `MetaToolKind`, conforming to a `DiscoveryStrategy` interface. Yields batches of `DiscoveredTool`s.
3. **Orchestrator** (`lib/discovery/orchestrator.ts`) — wraps a strategy with limits, cancellation, accumulation, and progress reporting.

UI consumes the orchestrator via React state; results live on the `ServerEntry` and reset on reconnect.

## Data model

```ts
// types.ts additions

export type MetaToolKind =
  | 'bulk_list'
  | 'paginated_list'
  | 'search'
  | 'hybrid_index'
  | 'hybrid_describe'
  | 'category_index'
  | 'category_list'
  | 'enable_capability'
  | 'proxy_invoke'
  | 'manifest';

export interface MetaToolBinding {
  toolName: string;
  kind: MetaToolKind;
  confidence: number;          // 0..1
  pairedWith?: string;         // for hybrid_index ↔ hybrid_describe, category_index ↔ category_list
}

export interface DiscoveredTool extends ToolDef {
  source: {
    via: string;               // meta-tool name that produced this
    kind: MetaToolKind;
    proxyArgKey?: string;      // for proxy routing
    proxyNameKey?: string;
  };
}

export interface DiscoveryRun {
  status: 'idle' | 'running' | 'done' | 'partial' | 'error';
  startedAt?: number;
  finishedAt?: number;
  probesAttempted: number;
  callsMade: number;
  toolsFound: number;
  error?: string;
}

// ServerEntry additions
metaTools?: MetaToolBinding[];
discovered?: DiscoveredTool[];
discoveryRuns?: Record<string, DiscoveryRun>;   // keyed by meta-tool name
```

Dedup rule when rendering: a discovered tool with the same `name` as a native tool is omitted from the discovered section.

## Detection

Single function `detectMetaTools(tools: ToolDef[]): MetaToolBinding[]`. Computes an additive confidence score per tool from three signals; threshold 0.5.

**Signal 1 — Name pattern (weight 0.5):** regex against tool name.
Let `NOUN = (tool|tools|action|actions|function|functions|capability|capabilities|skill|skills)`.

- `^(list|browse|index|get_all)_NOUN$` → `bulk_list`
- `^(search|find|query)_NOUN$` → `search`
- `^describe_(tool|action|function)$` or `^get_tool(_info|_schema)?$` → `hybrid_describe`
- `^(invoke|call|run|use|execute)_(tool|action|function)$` → `proxy_invoke`
- `^(list|get)_(category|categories|namespace|namespaces)$` → `category_index`
- `^(list_tools_in|tools_in)_.+$` → `category_list` (also assigned during the pairing pass — see below)
- `^enable_(capability|tool|feature)$` → `enable_capability`
- `^(get|export)_(manifest|openapi|schema|catalog)$` → `manifest`

**Signal 2 — Description keywords (weight 0.2):** lowercased substring match for "discover", "list available", "browse tools", "search for tools/actions", "all tools".

**Signal 3 — Schema shape (weight 0.3):**
- No required inputs OR only `{cursor?, limit?, page?, offset?}` → bulk/paginated
- Required `query`/`q`/`keywords` of type string → search
- Required `name`/`tool_name` of type string, no other args → hybrid_describe
- Required `tool_name`/`name` + `arguments`/`args` of type object → proxy_invoke (auto-tags `proxyArgKey`/`proxyNameKey`)
- Required `category`/`namespace` of type string → category_list

**Output-schema bonus (+0.4):** if `outputSchema` is present and matches `{ type: 'array', items: { properties: { name, description, ... } } }`, the tool is almost certainly discovery-related. The bonus is added to whichever `MetaToolKind` the name/schema signals already chose; if none of those signals fired, default the kind to `bulk_list`.

**Pairing pass:** after individual classification, pair up:
- A `bulk_list` whose output entries lack `inputSchema` AND a `hybrid_describe` exists on the same server → re-classify the bulk_list as `hybrid_index`, set `pairedWith`.
- A `category_index` and a `category_list` on the same server → mutual pairing.

Detection is conservative — false negatives are acceptable (user can still call the tool manually); false positives are worse (the "Discover" button would do something unexpected).

## Strategies

Shared interface:

```ts
interface DiscoveryStrategy {
  kind: MetaToolKind;
  run(ctx: DiscoveryContext): AsyncIterable<DiscoveredTool[]>;
}

interface DiscoveryContext {
  serverId: string;
  metaTool: MetaToolBinding;
  paired?: MetaToolBinding;
  callTool: (name: string, args: object) => Promise<ToolResult>;
  signal: AbortSignal;
  limits: DiscoveryLimits;
  options: { alphabetSweep?: boolean };
  onProbe: (probe: ProbeEvent) => void;
}

interface ProbeEvent {
  probe: string;             // human-readable label, e.g. 'query="*"', 'page=2', 'category=github'
  callsMade: number;         // running total for this run
  newToolsThisProbe: number;
  totalToolsSoFar: number;
}
```

**`bulk_list`** — one call with `{}`, yield the parsed batch.

**`paginated_list`** — inspect schema to identify the cursor/page field (`cursor`, `nextCursor`, `next_page_token`, `page`, `offset`). Loop until response yields no new tools, an empty cursor, or limits hit. Yield each page.

**`search`** — probe sequence in order: `""`, `"*"`, `"%"`, `" "`, `"."`, `"a"`, `"e"`, `"o"`, `"the"`, `"tool"`. Skip probes that violate the schema's `minLength`/`enum` constraints. Stop when two consecutive probes add 0 new tools or one returns ≥`maxTools`. Union results across probes (dedup by name). If `options.alphabetSweep` is true, append `a..z` + `0..9` as additional probes.

**`hybrid_index → describe`** — run the paired bulk-list call, then fan-out `describe_tool(name)` calls with `maxConcurrency = 5`. Merge each describe result's `inputSchema` into the corresponding entry. Yield in batches as schemas arrive.

**`category_index → category_list`** — run the paired category-index call, then fan-out `category_list(category)` per category with `maxConcurrency = 5`. Yield per-category batches.

**`enable_capability`** — if the meta-tool's input has an `enum` on the capability arg, enable each in sequence; after each, re-call `tools/list` and yield any new tools. If no enum, the strategy refuses to auto-run; the UI shows "manual capability needed" and lets the user submit the form normally. The MCP SDK's `tools/list_changed` notification handler (registered once at connect) handles tool-list refresh.

**`manifest`** — call with `{}`, run output through `parseManifest()` (tries OpenAPI → MCP-nested-array → flat-dict). Yield all parsed tools at once.

**`proxy_invoke`** — discovery is delegated to a co-located listing meta-tool on the same server. The proxy strategy's contribution is tagging results with `source.proxyArgKey` / `source.proxyNameKey` so invocation routes through this proxy.

### Result parser

`extractToolDefs(result: ToolResult): Partial<ToolDef>[]` lives in `lib/discovery/parse.ts`:
- Reads `result.structuredContent` first when present.
- Falls back to parsing `result.content[0].text` as JSON.
- Recognizes shapes: `{tools: [...]}`, plain array, `{items: [...]}`, `{data: [...]}`, OpenAPI `paths` (one tool per `{path, method}` pair, name derived from `operationId`).
- Each candidate normalized to `{ name, description?, inputSchema? }`. Missing schema defaults to `{ type: 'object' }`; `SchemaForm`'s existing JSON-textarea fallback handles it.

## Orchestrator

Wraps a strategy with:
- AbortController, exposed to UI for cancellation
- Per-call timeout (10s) via `Promise.race`
- Total timeout (30s) via `setTimeout` + abort
- Call counter that aborts at `maxCalls`
- Result accumulator that aborts at `maxTools`
- Error policy: 3 consecutive errors aborts the run as `error`; isolated errors are logged in the `DiscoveryRun` but don't stop progress
- Emits `DiscoveryRun` updates as it runs (consumed by React state)

## Invocation routing

`lib/discovery/invoke.ts` exposes:

```ts
invokeMaybeDiscovered(serverId: string, tool: ToolDef | DiscoveredTool, args: object): Promise<ToolResult>
```

Routing rule:

| Source kind | Route |
|---|---|
| (native, no `source` field) | Direct |
| `bulk_list`, `paginated_list`, `hybrid_index`, `category_list`, `manifest`, `enable_capability` | Direct |
| `proxy_invoke` | Proxied — `callTool(proxyToolName, { [proxyNameKey]: tool.name, [proxyArgKey]: args })` |
| `search` | Direct first; on "not found" error, retry through any `proxy_invoke` meta-tool on the same server. Cache successful route per-tool. |

`ToolDetail.tsx`'s submit handler switches from `mcpClient.callTool` to this wrapper. Native invocations pass through unchanged.

## UI

**`ToolDetail.tsx`** — when the open tool has a `MetaToolBinding`, render `DiscoveryHeader` above the existing form. Header states: idle, running, done, partial, error.
- idle: "Discover all tools" button
- running: "Stop" + inline progress
- done: "Re-discover" + summary
- partial: yellow tint; "Discovery hit limits — N/M tools" + "Try harder" (alphabet sweep, search kind only)
- error: red tint + "Retry"
- `enable_capability` with no enum: no button; "Manual capability needed — fill the form below and submit."

**`ToolList.tsx`** — below the native list, render `DiscoveredToolsSection` (collapsible) when `server.discovered` is non-empty. Rows use the same style as native; each shows a "via {meta-tool-name}" subtitle. Section header shows count. Collapsed by default if >50 tools.

**New components** in `src/components/`:
- `DiscoveryHeader.tsx` — owns its run state, calls orchestrator, renders progress
- `DiscoveredToolsSection.tsx` — collapsible block in the tool list
- `DiscoveryProgress.tsx` — single-line monospace progress widget, reusable

**Visual rules:**
- "Try harder" is a text link, not a primary button — keeps the alphabet sweep deliberate
- Progress text is single-line, no spinners — consistent with the zinc/violet aesthetic
- Source attribution uses zinc-600 subtitle (matches existing description treatment)

## Limits

Defaults in `src/lib/discovery/constants.ts`:

```ts
MAX_CALLS = 20
MAX_CALLS_WITH_SWEEP = 60   // search + alphabet sweep
MAX_CONCURRENCY = 5
MAX_TOOLS = 500
TOTAL_TIMEOUT_MS = 30_000
PER_CALL_TIMEOUT_MS = 10_000
CONSECUTIVE_ERROR_LIMIT = 3
```

## Error handling

- Per-call errors logged in the `DiscoveryRun`; run continues unless 3 consecutive
- 3 consecutive errors → run marked `error`, stop
- Total timeout → run marked `partial`, surface what was collected
- `MAX_TOOLS` hit → run marked `partial`, suggest narrower search; no truncation of already-collected data
- Proxy meta-tool disconnected at invocation time → surface "Proxy tool unavailable; re-run discovery"
- Direct-call "tool not found" on search-discovered tool → auto-fall-back to proxy if available

## Testing

Vitest, matching the existing pattern in `lib/vault/*.test.ts`:

- **`detect.test.ts`** — table-driven, one representative case per `MetaToolKind`, plus edge cases (low/high confidence, pairing).
- **`parse.test.ts`** — `extractToolDefs` against fixtures: nested `tools[]`, OpenAPI doc, plain array, `{items: [...]}`, malformed JSON, `structuredContent`.
- **`strategies/*.test.ts`** — each strategy against a mocked `callTool`. Verify:
  - search probe sequence stops at stability
  - paginated walk follows cursor and stops on empty page
  - hybrid fan-out respects concurrency cap
  - cancellation: `signal.abort()` mid-run halts gracefully
- **`invoke.test.ts`** — routing matrix (direct, proxy, fallback).

No live-server integration tests in v1.

## File layout

```
src/
├── types.ts                              # +MetaToolKind, MetaToolBinding, DiscoveredTool, DiscoveryRun
├── lib/
│   ├── mcpClient.ts                      # (unchanged)
│   └── discovery/
│       ├── constants.ts
│       ├── detect.ts
│       ├── detect.test.ts
│       ├── parse.ts
│       ├── parse.test.ts
│       ├── invoke.ts
│       ├── invoke.test.ts
│       ├── orchestrator.ts
│       └── strategies/
│           ├── bulkList.ts
│           ├── bulkList.test.ts
│           ├── paginatedList.ts
│           ├── paginatedList.test.ts
│           ├── search.ts
│           ├── search.test.ts
│           ├── hybrid.ts
│           ├── hybrid.test.ts
│           ├── category.ts
│           ├── category.test.ts
│           ├── enableCapability.ts
│           ├── enableCapability.test.ts
│           ├── manifest.ts
│           ├── manifest.test.ts
│           └── proxy.ts
└── components/
    ├── DiscoveryHeader.tsx
    ├── DiscoveredToolsSection.tsx
    ├── DiscoveryProgress.tsx
    ├── ToolDetail.tsx                    # +DiscoveryHeader rendering
    └── ToolList.tsx                      # +DiscoveredToolsSection rendering
```

## Out of scope (deferred)

- Persisting discovered catalogs across reloads
- Manual override UI for marking a tool as a meta-tool
- Auto-discovery on connect
- Browsing MCP resources/prompts in addition to tools
- Telemetry / usage analytics
- Live-server integration tests
