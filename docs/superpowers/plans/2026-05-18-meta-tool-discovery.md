# Meta-Tool Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect MCP "meta-tools" (tools whose purpose is to discover other tools — `list_tools`, `search_tools`, `invoke_tool`, etc.) and let the user run them to populate the explorer's catalog with the full set of discovered tools.

**Architecture:** Pure client-side TypeScript. Three layers under `src/lib/discovery/`: detection (classifies tools at connect time), strategies (one per meta-tool pattern, yielding `DiscoveredTool` batches), orchestrator (wraps strategies with limits and cancellation). UI surfaces: a `DiscoveryHeader` strip on a meta-tool's detail pane, and a collapsible `Discovered (N)` section in the tool list. Invocation of discovered tools routes through `invokeMaybeDiscovered`, which detects when a call must go through a proxy meta-tool.

**Tech Stack:** TypeScript, React 19, vitest, `@modelcontextprotocol/sdk` Client (already used in `lib/mcpClient.ts`), Tailwind CSS v4.

**Reference:** [`docs/superpowers/specs/2026-05-18-meta-tool-discovery-design.md`](../specs/2026-05-18-meta-tool-discovery-design.md)

---

## Conventions used in this plan

- **TDD:** every task starts with a failing test, then a minimal implementation, then verification.
- **Tests use vitest** in the project's existing style (see `src/lib/vault/crypto.test.ts`).
- **Commits per task** — frequent commits, conventional-commits style (`feat(discovery):`, `test(discovery):`, etc.).
- **Run `npm test` and `npm run build`** in the verification step of every code-touching task.
- **Lint:** the project runs `npm run lint`; run it before each commit only if your task touched components or many files. For pure logic files it's optional, but the final task runs it everywhere.

---

## File layout (built up across tasks)

```
src/
├── types.ts                                  # Task 1: add 4 new exported types
├── lib/
│   ├── mcpClient.ts                          # Task 17: add tools/list_changed subscription helper
│   └── discovery/
│       ├── constants.ts                      # Task 2
│       ├── strategy.ts                       # Task 3: shared types (DiscoveryStrategy, DiscoveryContext, ProbeEvent)
│       ├── parse.ts                          # Task 4
│       ├── parse.test.ts                     # Task 4
│       ├── detect.ts                         # Task 5
│       ├── detect.test.ts                    # Task 5
│       ├── orchestrator.ts                   # Task 14
│       ├── orchestrator.test.ts              # Task 14
│       ├── invoke.ts                         # Task 15
│       ├── invoke.test.ts                    # Task 15
│       └── strategies/
│           ├── bulkList.ts                   # Task 6
│           ├── bulkList.test.ts              # Task 6
│           ├── paginatedList.ts              # Task 7
│           ├── paginatedList.test.ts         # Task 7
│           ├── search.ts                     # Task 8
│           ├── search.test.ts                # Task 8
│           ├── hybrid.ts                     # Task 9
│           ├── hybrid.test.ts                # Task 9
│           ├── category.ts                   # Task 10
│           ├── category.test.ts              # Task 10
│           ├── enableCapability.ts           # Task 11
│           ├── enableCapability.test.ts      # Task 11
│           ├── manifest.ts                   # Task 12
│           ├── manifest.test.ts              # Task 12
│           └── proxy.ts                      # Task 13
└── components/
    ├── DiscoveryProgress.tsx                 # Task 16
    ├── DiscoveryHeader.tsx                   # Task 16
    ├── DiscoveredToolsSection.tsx            # Task 16
    ├── ToolDetail.tsx                        # Task 18: render DiscoveryHeader, switch to invokeMaybeDiscovered
    └── ToolList.tsx                          # Task 19: render DiscoveredToolsSection
```

---

## Task 1: Add types to `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Append the new types to the end of `src/types.ts`**

```ts
// --- Meta-tool discovery ---

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
  confidence: number;
  /** Name of a paired meta-tool, e.g. hybrid_index ↔ hybrid_describe, category_index ↔ category_list. */
  pairedWith?: string;
}

export interface DiscoveredTool extends ToolDef {
  source: {
    via: string;
    kind: MetaToolKind;
    /** For proxy_invoke routing: which input field receives the inner tool's args. */
    proxyArgKey?: string;
    /** For proxy_invoke routing: which input field receives the inner tool's name. */
    proxyNameKey?: string;
  };
}

export type DiscoveryStatus = 'idle' | 'running' | 'done' | 'partial' | 'error';

export interface DiscoveryRun {
  status: DiscoveryStatus;
  startedAt?: number;
  finishedAt?: number;
  probesAttempted: number;
  callsMade: number;
  toolsFound: number;
  error?: string;
}
```

- [ ] **Step 2: Extend `ServerEntry` with three optional fields**

Inside the existing `ServerEntry` interface (around line 17-28), add these three fields just after the existing `tools?: ToolDef[];` line:

```ts
  metaTools?: MetaToolBinding[];
  /** Discovered tools, in-memory, reset on reconnect. */
  discovered?: DiscoveredTool[];
  /** Per-meta-tool discovery run state, keyed by meta-tool name. */
  discoveryRuns?: Record<string, DiscoveryRun>;
```

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(discovery): add MetaToolKind, MetaToolBinding, DiscoveredTool, DiscoveryRun types"
```

---

## Task 2: Constants

**Files:**
- Create: `src/lib/discovery/constants.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/discovery/constants.ts

export const MAX_CALLS = 20;
export const MAX_CALLS_WITH_SWEEP = 60;
export const MAX_CONCURRENCY = 5;
export const MAX_TOOLS = 500;
export const TOTAL_TIMEOUT_MS = 30_000;
export const PER_CALL_TIMEOUT_MS = 10_000;
export const CONSECUTIVE_ERROR_LIMIT = 3;

/** Stops the search probe loop once this many consecutive probes add 0 new tools. */
export const SEARCH_STABILITY_PROBES = 2;

/** Probe inputs tried for `search` meta-tools, in priority order. */
export const SEARCH_PROBE_SEQUENCE: readonly string[] = [
  '', '*', '%', ' ', '.', 'a', 'e', 'o', 'the', 'tool',
];

/** Appended after SEARCH_PROBE_SEQUENCE when the user opts into the alphabet sweep. */
export const ALPHABET_SWEEP: readonly string[] = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split(''),
];
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/discovery/constants.ts
git commit -m "feat(discovery): add limits and probe-sequence constants"
```

---

## Task 3: Shared strategy types

**Files:**
- Create: `src/lib/discovery/strategy.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/discovery/strategy.ts

import type { DiscoveredTool, MetaToolBinding, MetaToolKind, ToolResult } from '../../types';

export interface DiscoveryLimits {
  maxCalls: number;
  maxConcurrency: number;
  maxTools: number;
  totalTimeoutMs: number;
  perCallTimeoutMs: number;
  consecutiveErrorLimit: number;
}

export interface ProbeEvent {
  /** Human-readable probe label, e.g. `query="*"`, `page=2`, `category=github`. */
  probe: string;
  callsMade: number;
  newToolsThisProbe: number;
  totalToolsSoFar: number;
}

export interface DiscoveryContext {
  serverId: string;
  metaTool: MetaToolBinding;
  /** Paired meta-tool, when relevant: hybrid_describe for hybrid_index, category_list for category_index, etc. */
  paired?: MetaToolBinding;
  /** All meta-tools detected on the server — used by strategies that delegate (e.g. proxy_invoke). */
  allMetaTools: MetaToolBinding[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  signal: AbortSignal;
  limits: DiscoveryLimits;
  options: { alphabetSweep?: boolean };
  onProbe: (event: ProbeEvent) => void;
}

export interface DiscoveryStrategy {
  kind: MetaToolKind;
  run(ctx: DiscoveryContext): AsyncIterable<DiscoveredTool[]>;
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/discovery/strategy.ts
git commit -m "feat(discovery): define DiscoveryStrategy interface and supporting types"
```

---

## Task 4: Result parser (`parse.ts`)

**Files:**
- Create: `src/lib/discovery/parse.ts`
- Test: `src/lib/discovery/parse.test.ts`

`extractToolDefs(result: ToolResult)` reads structured or text MCP results, recognizes the common catalog shapes, and returns normalized tool entries.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/parse.test.ts

import { describe, expect, test } from 'vitest';
import { extractToolDefs } from './parse';
import type { ToolResult } from '../../types';

function textResult(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('extractToolDefs', () => {
  test('reads structuredContent.tools when present', () => {
    const r = {
      content: [],
      structuredContent: { tools: [{ name: 'foo', description: 'd' }] },
    } as unknown as ToolResult;
    expect(extractToolDefs(r)).toEqual([{ name: 'foo', description: 'd', inputSchema: { type: 'object' } }]);
  });

  test('parses { tools: [...] } from text', () => {
    const r = textResult({ tools: [{ name: 'a' }, { name: 'b' }] });
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['a', 'b']);
  });

  test('parses a top-level array from text', () => {
    const r = textResult([{ name: 'x' }]);
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['x']);
  });

  test('parses { items: [...] }', () => {
    const r = textResult({ items: [{ name: 'i1' }] });
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['i1']);
  });

  test('parses { data: [...] }', () => {
    const r = textResult({ data: [{ name: 'd1' }] });
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['d1']);
  });

  test('parses OpenAPI paths', () => {
    const r = textResult({
      openapi: '3.0.0',
      paths: {
        '/users': { get: { operationId: 'listUsers', summary: 'List users' } },
        '/users/{id}': { post: { operationId: 'createUser' } },
      },
    });
    const names = extractToolDefs(r).map((t) => t.name).sort();
    expect(names).toEqual(['createUser', 'listUsers']);
  });

  test('returns empty for malformed JSON without throwing', () => {
    const r: ToolResult = { content: [{ type: 'text', text: '{ not json' }] };
    expect(extractToolDefs(r)).toEqual([]);
  });

  test('returns empty for empty content', () => {
    const r: ToolResult = { content: [] };
    expect(extractToolDefs(r)).toEqual([]);
  });

  test('passes inputSchema through when present', () => {
    const schema = { type: 'object', properties: { x: { type: 'string' } } };
    const r = textResult({ tools: [{ name: 'a', inputSchema: schema }] });
    expect(extractToolDefs(r)[0].inputSchema).toEqual(schema);
  });

  test('accepts `parameters` as an alias for inputSchema', () => {
    const schema = { type: 'object', properties: { y: { type: 'number' } } };
    const r = textResult({ tools: [{ name: 'a', parameters: schema }] });
    expect(extractToolDefs(r)[0].inputSchema).toEqual(schema);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/parse.test.ts`
Expected: FAIL with "Cannot find module './parse'".

- [ ] **Step 3: Implement `parse.ts`**

```ts
// src/lib/discovery/parse.ts

import type { JsonSchema, ToolResult } from '../../types';

interface RawTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  parameters?: JsonSchema;
}

export interface ParsedTool {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

const DEFAULT_SCHEMA: JsonSchema = { type: 'object' };

export function extractToolDefs(result: ToolResult): ParsedTool[] {
  const payload = readPayload(result);
  if (payload === undefined) return [];

  const candidates = extractCandidates(payload);
  return candidates
    .filter((c): c is RawTool => typeof c?.name === 'string' && c.name.length > 0)
    .map(normalize);
}

function readPayload(result: ToolResult): unknown {
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  if (structured !== undefined) return structured;
  const text = result.content?.[0]?.text;
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractCandidates(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['tools', 'items', 'data', 'results', 'actions', 'functions']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
    if (obj.paths && typeof obj.paths === 'object') {
      return openapiPathsToCandidates(obj.paths as Record<string, unknown>);
    }
  }
  return [];
}

function openapiPathsToCandidates(paths: Record<string, unknown>): RawTool[] {
  const out: RawTool[] = [];
  for (const [path, ops] of Object.entries(paths)) {
    if (!ops || typeof ops !== 'object') continue;
    for (const [method, op] of Object.entries(ops as Record<string, unknown>)) {
      if (!op || typeof op !== 'object') continue;
      const o = op as Record<string, unknown>;
      const name = typeof o.operationId === 'string' ? o.operationId : `${method}_${path}`;
      const description = typeof o.summary === 'string' ? o.summary : (typeof o.description === 'string' ? o.description : undefined);
      out.push({ name, description });
    }
  }
  return out;
}

function normalize(raw: RawTool): ParsedTool {
  return {
    name: raw.name,
    description: raw.description,
    inputSchema: raw.inputSchema ?? raw.parameters ?? DEFAULT_SCHEMA,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/parse.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/parse.ts src/lib/discovery/parse.test.ts
git commit -m "feat(discovery): parser for common catalog response shapes"
```

---

## Task 5: Detection (`detect.ts`)

**Files:**
- Create: `src/lib/discovery/detect.ts`
- Test: `src/lib/discovery/detect.test.ts`

`detectMetaTools(tools)` classifies each tool and returns a list of `MetaToolBinding`. Threshold 0.5. Includes a pairing pass.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/detect.test.ts

import { describe, expect, test } from 'vitest';
import { detectMetaTools } from './detect';
import type { ToolDef } from '../../types';

function tool(name: string, schema: Record<string, unknown> = { type: 'object' }, description?: string): ToolDef {
  return { name, description, inputSchema: schema as ToolDef['inputSchema'] };
}

describe('detectMetaTools', () => {
  test('detects bulk_list by name', () => {
    const b = detectMetaTools([tool('list_tools')]);
    expect(b).toHaveLength(1);
    expect(b[0].kind).toBe('bulk_list');
    expect(b[0].toolName).toBe('list_tools');
  });

  test('detects search by name + required query', () => {
    const b = detectMetaTools([
      tool('search_tools', { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }),
    ]);
    expect(b[0].kind).toBe('search');
  });

  test('detects proxy_invoke and captures arg/name keys', () => {
    const schema = {
      type: 'object',
      properties: { tool_name: { type: 'string' }, arguments: { type: 'object' } },
      required: ['tool_name', 'arguments'],
    };
    const b = detectMetaTools([tool('invoke_tool', schema)]);
    expect(b[0].kind).toBe('proxy_invoke');
    expect(b[0].toolName).toBe('invoke_tool');
  });

  test('detects manifest', () => {
    const b = detectMetaTools([tool('get_manifest')]);
    expect(b[0].kind).toBe('manifest');
  });

  test('detects category_index', () => {
    const b = detectMetaTools([tool('list_categories')]);
    expect(b[0].kind).toBe('category_index');
  });

  test('detects enable_capability', () => {
    const b = detectMetaTools([tool('enable_capability')]);
    expect(b[0].kind).toBe('enable_capability');
  });

  test('detects hybrid_describe by name', () => {
    const b = detectMetaTools([tool('describe_tool', { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })]);
    expect(b[0].kind).toBe('hybrid_describe');
  });

  test('description keyword alone is below threshold', () => {
    // Tool has an unrelated required arg so the schema-shape signal does NOT fire.
    const b = detectMetaTools([tool(
      'foobar',
      { type: 'object', properties: { thing: { type: 'string' } }, required: ['thing'] },
      'discover all tools',
    )]);
    expect(b).toHaveLength(0);
  });

  test('output-schema bonus tips a borderline tool over the threshold (defaulting to bulk_list)', () => {
    // outputSchema bonus (+0.4) combined with a description keyword (+0.2) reaches 0.6 — above threshold.
    // The name doesn't match any pattern, and the input has an unrelated required field so the schema-shape signal is silent.
    const t = {
      name: 'inventory',
      description: 'discover all tools',
      inputSchema: { type: 'object', properties: { thing: { type: 'string' } }, required: ['thing'] },
      outputSchema: { type: 'array', items: { properties: { name: { type: 'string' }, description: {} } } },
    } as unknown as ToolDef;
    const b = detectMetaTools([t]);
    expect(b).toHaveLength(1);
    expect(b[0].kind).toBe('bulk_list');
  });

  test('pairs hybrid_index with hybrid_describe', () => {
    const list: ToolDef = { name: 'list_tools', inputSchema: { type: 'object' } };
    const describe: ToolDef = { name: 'describe_tool', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } };
    const b = detectMetaTools([list, describe]);
    const idx = b.find((x) => x.toolName === 'list_tools')!;
    const desc = b.find((x) => x.toolName === 'describe_tool')!;
    expect(idx.kind).toBe('hybrid_index');
    expect(idx.pairedWith).toBe('describe_tool');
    expect(desc.pairedWith).toBe('list_tools');
  });

  test('pairs category_index with category_list', () => {
    const cat: ToolDef = { name: 'list_categories', inputSchema: { type: 'object' } };
    const inCat: ToolDef = { name: 'list_tools_in_category', inputSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] } };
    const b = detectMetaTools([cat, inCat]);
    const catB = b.find((x) => x.toolName === 'list_categories')!;
    const inB = b.find((x) => x.toolName === 'list_tools_in_category')!;
    expect(catB.kind).toBe('category_index');
    expect(catB.pairedWith).toBe('list_tools_in_category');
    expect(inB.kind).toBe('category_list');
    expect(inB.pairedWith).toBe('list_categories');
  });

  test('ignores ordinary tools', () => {
    const b = detectMetaTools([tool('github_create_issue'), tool('post_message')]);
    expect(b).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/detect.test.ts`
Expected: FAIL with "Cannot find module './detect'".

- [ ] **Step 3: Implement `detect.ts`**

```ts
// src/lib/discovery/detect.ts

import type { JsonSchema, MetaToolBinding, MetaToolKind, ToolDef } from '../../types';

const NOUN = '(tool|tools|action|actions|function|functions|capability|capabilities|skill|skills)';

const NAME_PATTERNS: Array<[RegExp, MetaToolKind]> = [
  [new RegExp(`^(list|browse|index|get_all)_${NOUN}$`), 'bulk_list'],
  [new RegExp(`^(search|find|query)_${NOUN}$`), 'search'],
  [/^describe_(tool|action|function)$/, 'hybrid_describe'],
  [/^get_tool(_info|_schema)?$/, 'hybrid_describe'],
  [/^(invoke|call|run|use|execute)_(tool|action|function)$/, 'proxy_invoke'],
  [/^(list|get)_(category|categories|namespace|namespaces)$/, 'category_index'],
  [/^(list_tools_in|tools_in)_.+$/, 'category_list'],
  [/^enable_(capability|tool|feature)$/, 'enable_capability'],
  [/^(get|export)_(manifest|openapi|schema|catalog)$/, 'manifest'],
];

const DESC_KEYWORDS = ['discover', 'list available', 'browse tools', 'search for tools', 'search for actions', 'all tools'];

const PAGING_KEYS = new Set(['cursor', 'nextcursor', 'next_cursor', 'page', 'offset', 'limit', 'next_page_token']);

interface Score {
  toolName: string;
  kind: MetaToolKind | null;
  score: number;
  proxyArgKey?: string;
  proxyNameKey?: string;
}

export function detectMetaTools(tools: ToolDef[]): MetaToolBinding[] {
  const scored = tools.map(scoreTool);
  const passing = scored.filter((s): s is Score & { kind: MetaToolKind } => s.kind !== null && s.score >= 0.5);

  const bindings: MetaToolBinding[] = passing.map((s) => ({
    toolName: s.toolName,
    kind: s.kind,
    confidence: Math.min(s.score, 1),
  }));

  applyPairing(bindings);
  return bindings;
}

function scoreTool(t: ToolDef): Score {
  let kind: MetaToolKind | null = null;
  let score = 0;
  let proxyArgKey: string | undefined;
  let proxyNameKey: string | undefined;

  // Signal 1: name pattern (0.5)
  for (const [re, k] of NAME_PATTERNS) {
    if (re.test(t.name)) {
      kind = k;
      score += 0.5;
      break;
    }
  }

  // Signal 2: description keywords (0.2)
  const desc = (t.description ?? '').toLowerCase();
  if (DESC_KEYWORDS.some((kw) => desc.includes(kw))) score += 0.2;

  // Signal 3: schema shape (0.3) — only assign a kind if name didn't already
  const shapeKind = inferKindFromSchema(t.inputSchema);
  if (shapeKind) {
    if (kind === null) kind = shapeKind.kind;
    score += 0.3;
    if (shapeKind.proxyArgKey) proxyArgKey = shapeKind.proxyArgKey;
    if (shapeKind.proxyNameKey) proxyNameKey = shapeKind.proxyNameKey;
  }

  // For proxy_invoke specifically we also want to capture the keys when name signaled it.
  if (kind === 'proxy_invoke' && (!proxyArgKey || !proxyNameKey)) {
    const keys = pickProxyKeys(t.inputSchema);
    proxyArgKey = proxyArgKey ?? keys.argKey;
    proxyNameKey = proxyNameKey ?? keys.nameKey;
  }

  // outputSchema bonus (+0.4)
  if (hasToolCatalogOutputSchema(t)) {
    score += 0.4;
    if (kind === null) kind = 'bulk_list';
  }

  return { toolName: t.name, kind, score, proxyArgKey, proxyNameKey };
}

function inferKindFromSchema(schema: JsonSchema | undefined): { kind: MetaToolKind; proxyArgKey?: string; proxyNameKey?: string } | null {
  if (!schema || typeof schema !== 'object') return null;
  const props = (schema.properties ?? {}) as Record<string, { type?: string | string[] }>;
  const required = new Set(schema.required ?? []);
  const propNames = Object.keys(props);

  // proxy_invoke: tool_name/name + arguments/args
  const nameKey = ['tool_name', 'name', 'tool'].find((k) => required.has(k) && isStringProp(props[k]));
  const argKey = ['arguments', 'args', 'params', 'parameters'].find((k) => required.has(k) && isObjectProp(props[k]));
  if (nameKey && argKey) return { kind: 'proxy_invoke', proxyArgKey: argKey, proxyNameKey: nameKey };

  // hybrid_describe: name only, no other required args
  if (required.size === 1 && [...required][0] && ['name', 'tool_name', 'tool'].includes([...required][0])) {
    return { kind: 'hybrid_describe' };
  }

  // search: required query/q/keywords
  if (['query', 'q', 'keywords'].some((k) => required.has(k) && isStringProp(props[k]))) {
    return { kind: 'search' };
  }

  // category_list: required category/namespace
  if (['category', 'namespace'].some((k) => required.has(k) && isStringProp(props[k]))) {
    return { kind: 'category_list' };
  }

  // paginated_list: only paging-ish properties
  if (propNames.length > 0 && propNames.every((p) => PAGING_KEYS.has(p.toLowerCase()))) {
    return { kind: 'paginated_list' };
  }

  // bulk_list: no required inputs
  if (required.size === 0 && propNames.every((p) => PAGING_KEYS.has(p.toLowerCase()))) {
    return { kind: 'bulk_list' };
  }

  return null;
}

function isStringProp(p: { type?: string | string[] } | undefined): boolean {
  if (!p) return false;
  if (p.type === 'string') return true;
  return Array.isArray(p.type) && p.type.includes('string');
}

function isObjectProp(p: { type?: string | string[] } | undefined): boolean {
  if (!p) return false;
  if (p.type === 'object') return true;
  return Array.isArray(p.type) && p.type.includes('object');
}

function pickProxyKeys(schema: JsonSchema | undefined): { argKey?: string; nameKey?: string } {
  const props = (schema?.properties ?? {}) as Record<string, { type?: string | string[] }>;
  const required = new Set(schema?.required ?? []);
  const nameKey = ['tool_name', 'name', 'tool'].find((k) => required.has(k) && isStringProp(props[k]));
  const argKey = ['arguments', 'args', 'params', 'parameters'].find((k) => required.has(k) && isObjectProp(props[k]));
  return { argKey, nameKey };
}

function hasToolCatalogOutputSchema(t: ToolDef): boolean {
  const out = (t as unknown as { outputSchema?: unknown }).outputSchema;
  if (!out || typeof out !== 'object') return false;
  const o = out as { type?: string; items?: { properties?: Record<string, unknown> } };
  if (o.type !== 'array') return false;
  const props = o.items?.properties ?? {};
  return 'name' in props && 'description' in props;
}

function applyPairing(bindings: MetaToolBinding[]): void {
  // hybrid_index pairing: a bulk_list paired with a hybrid_describe on the same server is upgraded.
  const describe = bindings.find((b) => b.kind === 'hybrid_describe');
  const bulk = bindings.find((b) => b.kind === 'bulk_list');
  if (describe && bulk) {
    bulk.kind = 'hybrid_index';
    bulk.pairedWith = describe.toolName;
    describe.pairedWith = bulk.toolName;
  }

  // category_index ↔ category_list mutual pairing
  const catIdx = bindings.find((b) => b.kind === 'category_index');
  const catList = bindings.find((b) => b.kind === 'category_list');
  if (catIdx && catList) {
    catIdx.pairedWith = catList.toolName;
    catList.pairedWith = catIdx.toolName;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/detect.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/detect.ts src/lib/discovery/detect.test.ts
git commit -m "feat(discovery): meta-tool detection with pairing pass"
```

---

## Task 6: Strategy — `bulk_list`

**Files:**
- Create: `src/lib/discovery/strategies/bulkList.ts`
- Test: `src/lib/discovery/strategies/bulkList.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/bulkList.test.ts

import { describe, expect, test, vi } from 'vitest';
import { bulkListStrategy } from './bulkList';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.8 },
    allMetaTools: [{ toolName: 'list_tools', kind: 'bulk_list', confidence: 0.8 }],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

function textResult(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('bulkListStrategy', () => {
  test('calls meta-tool with empty args and yields parsed batch', async () => {
    const callTool = vi.fn(async () => textResult({ tools: [{ name: 'a' }, { name: 'b' }] }));
    const out = await collect(bulkListStrategy.run(makeCtx(callTool)));
    expect(callTool).toHaveBeenCalledWith('list_tools', {});
    expect(out.map((t) => t.name)).toEqual(['a', 'b']);
  });

  test('tags discovered tools with source.via and source.kind', async () => {
    const callTool = vi.fn(async () => textResult({ tools: [{ name: 'a' }] }));
    const out = await collect(bulkListStrategy.run(makeCtx(callTool)));
    expect(out[0].source).toEqual({ via: 'list_tools', kind: 'bulk_list' });
  });

  test('emits a probe event', async () => {
    const onProbe = vi.fn();
    const callTool = async () => textResult({ tools: [{ name: 'a' }] });
    const ctx = { ...makeCtx(callTool), onProbe };
    await collect(bulkListStrategy.run(ctx));
    expect(onProbe).toHaveBeenCalledTimes(1);
    expect(onProbe.mock.calls[0][0]).toMatchObject({ callsMade: 1, totalToolsSoFar: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/bulkList.test.ts`
Expected: FAIL with "Cannot find module './bulkList'".

- [ ] **Step 3: Implement `bulkList.ts`**

```ts
// src/lib/discovery/strategies/bulkList.ts

import type { DiscoveredTool } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const bulkListStrategy: DiscoveryStrategy = {
  kind: 'bulk_list',
  async *run(ctx) {
    const result = await ctx.callTool(ctx.metaTool.toolName, {});
    const parsed = extractToolDefs(result);
    const discovered: DiscoveredTool[] = parsed.map((p) => ({
      ...p,
      source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
    }));
    ctx.onProbe({
      probe: 'bulk_list',
      callsMade: 1,
      newToolsThisProbe: discovered.length,
      totalToolsSoFar: discovered.length,
    });
    yield discovered;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/bulkList.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/bulkList.ts src/lib/discovery/strategies/bulkList.test.ts
git commit -m "feat(discovery): bulk_list strategy"
```

---

## Task 7: Strategy — `paginated_list`

**Files:**
- Create: `src/lib/discovery/strategies/paginatedList.ts`
- Test: `src/lib/discovery/strategies/paginatedList.test.ts`

Walks cursor/page until exhausted.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/paginatedList.test.ts

import { describe, expect, test, vi } from 'vitest';
import { paginatedListStrategy } from './paginatedList';
import type { DiscoveryContext } from '../strategy';
import type { JsonSchema, ToolResult } from '../../../types';

function ctx(callTool: DiscoveryContext['callTool'], schema: JsonSchema): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'list_tools', kind: 'paginated_list', confidence: 0.9 },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
    // Schema is read off the meta-tool binding via the host's tool registry in production;
    // for testing, the strategy receives it through an injected `pagingSchema` field via a typed augment.
  } as DiscoveryContext;
}

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('paginatedListStrategy', () => {
  test('follows nextCursor until empty', async () => {
    const responses: ToolResult[] = [
      text({ tools: [{ name: 'a' }], nextCursor: 'c1' }),
      text({ tools: [{ name: 'b' }], nextCursor: 'c2' }),
      text({ tools: [{ name: 'c' }] }),
    ];
    const callTool = vi.fn(async () => responses.shift()!);
    const schema: JsonSchema = { type: 'object', properties: { cursor: { type: 'string' } } };
    const c = ctx(callTool, schema);
    c.metaTool = { ...c.metaTool };
    (c.metaTool as unknown as { inputSchema: JsonSchema }).inputSchema = schema;
    const out = await collect(paginatedListStrategy.run(c));
    expect(out.map((t) => t.name)).toEqual(['a', 'b', 'c']);
    expect(callTool).toHaveBeenCalledTimes(3);
    expect(callTool).toHaveBeenNthCalledWith(1, 'list_tools', {});
    expect(callTool).toHaveBeenNthCalledWith(2, 'list_tools', { cursor: 'c1' });
    expect(callTool).toHaveBeenNthCalledWith(3, 'list_tools', { cursor: 'c2' });
  });

  test('stops at maxCalls', async () => {
    const callTool = vi.fn(async () => text({ tools: [{ name: 'x' }], nextCursor: 'next' }));
    const schema: JsonSchema = { type: 'object', properties: { cursor: { type: 'string' } } };
    const c = ctx(callTool, schema);
    (c.metaTool as unknown as { inputSchema: JsonSchema }).inputSchema = schema;
    c.limits = { ...c.limits, maxCalls: 3 };
    await collect(paginatedListStrategy.run(c));
    expect(callTool).toHaveBeenCalledTimes(3);
  });

  test('uses page index when no cursor field present', async () => {
    const responses: ToolResult[] = [
      text({ tools: [{ name: 'a' }, { name: 'b' }] }),
      text({ tools: [] }),
    ];
    const callTool = vi.fn(async () => responses.shift()!);
    const schema: JsonSchema = { type: 'object', properties: { page: { type: 'number' } } };
    const c = ctx(callTool, schema);
    (c.metaTool as unknown as { inputSchema: JsonSchema }).inputSchema = schema;
    const out = await collect(paginatedListStrategy.run(c));
    expect(out.map((t) => t.name)).toEqual(['a', 'b']);
    expect(callTool).toHaveBeenNthCalledWith(1, 'list_tools', {});
    expect(callTool).toHaveBeenNthCalledWith(2, 'list_tools', { page: 2 });
  });
});
```

Note: the test injects `inputSchema` onto the `metaTool` binding so the strategy can read the paging field. To support this cleanly, extend `MetaToolBinding` with an optional `inputSchema?: JsonSchema` field below — modify the type in `src/types.ts`.

- [ ] **Step 2: Extend `MetaToolBinding` in `src/types.ts`**

In the existing `MetaToolBinding` interface, add:

```ts
  /** Cached input schema, used by strategies that need to inspect param shapes (e.g., paginated_list). */
  inputSchema?: JsonSchema;
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/paginatedList.test.ts`
Expected: FAIL with "Cannot find module './paginatedList'".

- [ ] **Step 4: Implement `paginatedList.ts`**

```ts
// src/lib/discovery/strategies/paginatedList.ts

import type { DiscoveredTool, JsonSchema, ToolResult } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryContext, DiscoveryStrategy } from '../strategy';

const CURSOR_FIELDS = ['cursor', 'nextCursor', 'next_cursor', 'next_page_token'];
const OFFSET_FIELDS = ['offset'];
const PAGE_FIELDS = ['page'];

type Mode = { kind: 'cursor'; field: string } | { kind: 'page'; field: string; index: number } | { kind: 'offset'; field: string; offset: number };

export const paginatedListStrategy: DiscoveryStrategy = {
  kind: 'paginated_list',
  async *run(ctx) {
    const schema = ctx.metaTool.inputSchema;
    const mode = pickMode(schema);
    let calls = 0;
    let cursor: string | undefined;
    let pageMode = mode;
    let totalSoFar = 0;

    while (calls < ctx.limits.maxCalls) {
      const args = nextArgs(pageMode, cursor);
      const result = await ctx.callTool(ctx.metaTool.toolName, args);
      calls++;
      const parsed = extractToolDefs(result);
      const discovered: DiscoveredTool[] = parsed.map((p) => ({
        ...p,
        source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
      }));
      totalSoFar += discovered.length;
      ctx.onProbe({
        probe: pageMode.kind === 'cursor' ? `cursor=${cursor ?? '∅'}` : `${pageMode.field}=${argValue(pageMode)}`,
        callsMade: calls,
        newToolsThisProbe: discovered.length,
        totalToolsSoFar: totalSoFar,
      });
      if (discovered.length > 0) yield discovered;

      const nextCursor = readNextCursor(result, pageMode);
      if (pageMode.kind === 'cursor') {
        if (!nextCursor) return;
        cursor = nextCursor;
      } else if (pageMode.kind === 'page') {
        if (discovered.length === 0) return;
        pageMode = { ...pageMode, index: pageMode.index + 1 };
      } else {
        if (discovered.length === 0) return;
        pageMode = { ...pageMode, offset: pageMode.offset + discovered.length };
      }
    }
  },
};

function pickMode(schema: JsonSchema | undefined): Mode {
  const props = Object.keys(schema?.properties ?? {});
  const cursorField = props.find((p) => CURSOR_FIELDS.includes(p));
  if (cursorField) return { kind: 'cursor', field: cursorField };
  const pageField = props.find((p) => PAGE_FIELDS.includes(p));
  if (pageField) return { kind: 'page', field: pageField, index: 1 };
  const offsetField = props.find((p) => OFFSET_FIELDS.includes(p));
  if (offsetField) return { kind: 'offset', field: offsetField, offset: 0 };
  return { kind: 'cursor', field: 'cursor' };
}

function nextArgs(mode: Mode, cursor: string | undefined): Record<string, unknown> {
  if (mode.kind === 'cursor') return cursor ? { [mode.field]: cursor } : {};
  if (mode.kind === 'page') return mode.index === 1 ? {} : { [mode.field]: mode.index };
  return mode.offset === 0 ? {} : { [mode.field]: mode.offset };
}

function argValue(mode: Mode): string | number {
  if (mode.kind === 'page') return mode.index;
  if (mode.kind === 'offset') return mode.offset;
  return '';
}

function readNextCursor(result: ToolResult, mode: Mode): string | undefined {
  if (mode.kind !== 'cursor') return undefined;
  const text = result.content?.[0]?.text;
  if (typeof text !== 'string') return undefined;
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === 'object') {
      for (const k of CURSOR_FIELDS) {
        const v = (obj as Record<string, unknown>)[k];
        if (typeof v === 'string' && v.length > 0) return v;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/paginatedList.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/discovery/strategies/paginatedList.ts src/lib/discovery/strategies/paginatedList.test.ts src/types.ts
git commit -m "feat(discovery): paginated_list strategy with cursor/page/offset support"
```

---

## Task 8: Strategy — `search` (with optional alphabet sweep)

**Files:**
- Create: `src/lib/discovery/strategies/search.ts`
- Test: `src/lib/discovery/strategies/search.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/search.test.ts

import { describe, expect, test, vi } from 'vitest';
import { searchStrategy } from './search';
import type { DiscoveryContext } from '../strategy';
import type { JsonSchema, ToolResult } from '../../../types';
import { SEARCH_PROBE_SEQUENCE } from '../constants';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool'], opts: Partial<DiscoveryContext> = {}): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'search_tools', kind: 'search', confidence: 0.9, inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 60, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
    ...opts,
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('searchStrategy', () => {
  test('returns first probe that yields results', async () => {
    const calls: string[] = [];
    const callTool = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      calls.push(String(args.query));
      if (args.query === '') return text({ tools: [{ name: 'a' }, { name: 'b' }] });
      return text({ tools: [] });
    });
    const out = await collect(searchStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name).sort()).toEqual(['a', 'b']);
    // Stops after 2 consecutive zero-adds after the productive probe.
    expect(calls.slice(0, 3)).toEqual(['', '*', '%']);
  });

  test('unions results across probes (dedup by name)', async () => {
    const callTool = vi.fn(async (_n: string, args: Record<string, unknown>) => {
      if (args.query === '') return text({ tools: [{ name: 'a' }] });
      if (args.query === '*') return text({ tools: [{ name: 'a' }, { name: 'b' }] });
      return text({ tools: [] });
    });
    const out = await collect(searchStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name).sort()).toEqual(['a', 'b']);
  });

  test('skips probes that violate minLength', async () => {
    const calls: string[] = [];
    const callTool = vi.fn(async (_n: string, args: Record<string, unknown>) => {
      calls.push(String(args.query));
      return text({ tools: [] });
    });
    const schema = {
      type: 'object',
      properties: { query: { type: 'string', minLength: 2 } },
      required: ['query'],
    } as unknown as JsonSchema;
    const ctx = makeCtx(callTool, { metaTool: { toolName: 'search_tools', kind: 'search', confidence: 0.9, inputSchema: schema } });
    await collect(searchStrategy.run(ctx));
    // single-char probes ('', '*', '%', ' ', '.', 'a', 'e', 'o') should all be skipped; only 'the' and 'tool' attempted
    expect(calls).toEqual(['the', 'tool']);
  });

  test('alphabet sweep extends beyond the standard probe sequence', async () => {
    const calls: string[] = [];
    const callTool = vi.fn(async (_n: string, args: Record<string, unknown>) => {
      calls.push(String(args.query));
      // Return a new tool every probe so stability never triggers via zero-adds.
      return text({ tools: [{ name: `t_${calls.length}` }] });
    });
    const ctx = makeCtx(callTool, { options: { alphabetSweep: true } });
    await collect(searchStrategy.run(ctx));
    // Standard sequence is 10 probes. With sweep enabled and constant new-tool yield,
    // the run should continue past the standard sequence.
    expect(calls[0]).toBe(SEARCH_PROBE_SEQUENCE[0]);
    expect(calls.length).toBeGreaterThan(SEARCH_PROBE_SEQUENCE.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/search.test.ts`
Expected: FAIL with "Cannot find module './search'".

- [ ] **Step 3: Implement `search.ts`**

```ts
// src/lib/discovery/strategies/search.ts

import type { DiscoveredTool, JsonSchema } from '../../../types';
import { ALPHABET_SWEEP, SEARCH_PROBE_SEQUENCE, SEARCH_STABILITY_PROBES } from '../constants';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const searchStrategy: DiscoveryStrategy = {
  kind: 'search',
  async *run(ctx) {
    const schema = ctx.metaTool.inputSchema;
    const queryField = pickQueryField(schema) ?? 'query';
    const constraints = readConstraints(schema, queryField);

    const probes = ctx.options.alphabetSweep
      ? [...SEARCH_PROBE_SEQUENCE, ...ALPHABET_SWEEP]
      : SEARCH_PROBE_SEQUENCE;

    const seen = new Map<string, DiscoveredTool>();
    let consecutiveZeroes = 0;
    let calls = 0;

    for (const probe of probes) {
      if (calls >= ctx.limits.maxCalls) break;
      if (seen.size >= ctx.limits.maxTools) break;
      if (!probeAllowed(probe, constraints)) continue;

      let parsed;
      try {
        const result = await ctx.callTool(ctx.metaTool.toolName, { [queryField]: probe });
        calls++;
        parsed = extractToolDefs(result);
      } catch {
        calls++;
        continue;
      }

      let newCount = 0;
      const batch: DiscoveredTool[] = [];
      for (const p of parsed) {
        if (seen.has(p.name)) continue;
        const d: DiscoveredTool = { ...p, source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind } };
        seen.set(p.name, d);
        batch.push(d);
        newCount++;
      }
      ctx.onProbe({
        probe: `${queryField}="${probe}"`,
        callsMade: calls,
        newToolsThisProbe: newCount,
        totalToolsSoFar: seen.size,
      });
      if (batch.length > 0) yield batch;
      consecutiveZeroes = newCount === 0 ? consecutiveZeroes + 1 : 0;
      if (consecutiveZeroes >= SEARCH_STABILITY_PROBES) break;
    }
  },
};

interface Constraints { minLength?: number; maxLength?: number; enumValues?: string[] }

function pickQueryField(schema: JsonSchema | undefined): string | undefined {
  const props = Object.keys(schema?.properties ?? {});
  return ['query', 'q', 'keywords'].find((f) => props.includes(f));
}

function readConstraints(schema: JsonSchema | undefined, field: string): Constraints {
  const prop = (schema?.properties as Record<string, unknown> | undefined)?.[field];
  if (!prop || typeof prop !== 'object') return {};
  const p = prop as { minLength?: number; maxLength?: number; enum?: unknown[] };
  return {
    minLength: p.minLength,
    maxLength: p.maxLength,
    enumValues: Array.isArray(p.enum) ? p.enum.filter((v): v is string => typeof v === 'string') : undefined,
  };
}

function probeAllowed(probe: string, c: Constraints): boolean {
  if (c.minLength !== undefined && probe.length < c.minLength) return false;
  if (c.maxLength !== undefined && probe.length > c.maxLength) return false;
  if (c.enumValues && !c.enumValues.includes(probe)) return false;
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/search.ts src/lib/discovery/strategies/search.test.ts
git commit -m "feat(discovery): search strategy with probe sequence and alphabet sweep"
```

---

## Task 9: Strategy — `hybrid_index → describe`

**Files:**
- Create: `src/lib/discovery/strategies/hybrid.ts`
- Test: `src/lib/discovery/strategies/hybrid.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/hybrid.test.ts

import { describe, expect, test, vi } from 'vitest';
import { hybridStrategy } from './hybrid';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'list_tools', kind: 'hybrid_index', confidence: 0.9, pairedWith: 'describe_tool' },
    paired: { toolName: 'describe_tool', kind: 'hybrid_describe', confidence: 0.9 },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 2, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('hybridStrategy', () => {
  test('lists then describes each tool, merging inputSchema', async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_tools') return text({ tools: [{ name: 'a' }, { name: 'b' }] });
      if (name === 'describe_tool' && args.name === 'a') return text({ name: 'a', inputSchema: { type: 'object', properties: { x: { type: 'string' } } } });
      if (name === 'describe_tool' && args.name === 'b') return text({ name: 'b', inputSchema: { type: 'object', properties: { y: { type: 'number' } } } });
      throw new Error('unexpected call');
    });
    const out = await collect(hybridStrategy.run(makeCtx(callTool)));
    const byName = Object.fromEntries(out.map((t) => [t.name, t]));
    expect(byName.a.inputSchema).toMatchObject({ properties: { x: { type: 'string' } } });
    expect(byName.b.inputSchema).toMatchObject({ properties: { y: { type: 'number' } } });
  });

  test('does not exceed maxConcurrency simultaneous describes', async () => {
    let inflight = 0;
    let peak = 0;
    const callTool = vi.fn(async (name: string) => {
      if (name === 'list_tools') {
        return text({ tools: Array.from({ length: 6 }, (_, i) => ({ name: `t${i}` })) });
      }
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight--;
      return text({ name: 't0', inputSchema: { type: 'object' } });
    });
    await collect(hybridStrategy.run(makeCtx(callTool)));
    expect(peak).toBeLessThanOrEqual(2);
  });

  test('describe failure on one tool doesn’t abort run; falls back to default schema', async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_tools') return text({ tools: [{ name: 'a' }, { name: 'b' }] });
      if (name === 'describe_tool' && args.name === 'a') throw new Error('boom');
      return text({ name: 'b', inputSchema: { type: 'object', properties: { y: {} } } });
    });
    const out = await collect(hybridStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name).sort()).toEqual(['a', 'b']);
    const a = out.find((t) => t.name === 'a')!;
    expect(a.inputSchema).toEqual({ type: 'object' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/hybrid.test.ts`
Expected: FAIL with "Cannot find module './hybrid'".

- [ ] **Step 3: Implement `hybrid.ts`**

```ts
// src/lib/discovery/strategies/hybrid.ts

import type { DiscoveredTool, JsonSchema } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryContext, DiscoveryStrategy } from '../strategy';

export const hybridStrategy: DiscoveryStrategy = {
  kind: 'hybrid_index',
  async *run(ctx) {
    if (!ctx.paired) {
      // No describe tool — fall back to whatever the index call gave us.
      const result = await ctx.callTool(ctx.metaTool.toolName, {});
      yield extractToolDefs(result).map((p) => ({
        ...p,
        source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
      }));
      return;
    }

    const indexResult = await ctx.callTool(ctx.metaTool.toolName, {});
    const index = extractToolDefs(indexResult);
    ctx.onProbe({ probe: 'index', callsMade: 1, newToolsThisProbe: index.length, totalToolsSoFar: index.length });

    const describeName = ctx.paired.toolName;
    const concurrency = Math.max(1, ctx.limits.maxConcurrency);
    const queue = [...index];
    const out: DiscoveredTool[] = [];
    let describeCalls = 0;

    async function worker(): Promise<DiscoveredTool[]> {
      const local: DiscoveredTool[] = [];
      while (queue.length > 0) {
        if (describeCalls >= ctx.limits.maxCalls - 1) break;
        const next = queue.shift();
        if (!next) break;
        describeCalls++;
        let schema: JsonSchema = next.inputSchema;
        try {
          const r = await ctx.callTool(describeName, { name: next.name });
          const detail = extractToolDefs(r);
          const first = detail[0];
          if (first?.inputSchema) schema = first.inputSchema;
        } catch {
          /* keep default schema */
        }
        local.push({
          name: next.name,
          description: next.description,
          inputSchema: schema,
          source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
        });
      }
      return local;
    }

    const workers = Array.from({ length: Math.min(concurrency, index.length || 1) }, () => worker());
    const settled = await Promise.all(workers);
    for (const batch of settled) out.push(...batch);
    ctx.onProbe({ probe: 'describe-all', callsMade: 1 + describeCalls, newToolsThisProbe: out.length, totalToolsSoFar: out.length });
    yield out;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/hybrid.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/hybrid.ts src/lib/discovery/strategies/hybrid.test.ts
git commit -m "feat(discovery): hybrid_index strategy (list + per-tool describe fan-out)"
```

---

## Task 10: Strategy — `category_index → category_list`

**Files:**
- Create: `src/lib/discovery/strategies/category.ts`
- Test: `src/lib/discovery/strategies/category.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/category.test.ts

import { describe, expect, test, vi } from 'vitest';
import { categoryStrategy } from './category';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'list_categories', kind: 'category_index', confidence: 0.9, pairedWith: 'list_tools_in_category' },
    paired: { toolName: 'list_tools_in_category', kind: 'category_list', confidence: 0.9 },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 3, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('categoryStrategy', () => {
  test('lists categories then fans out per-category listings', async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_categories') return text({ categories: ['github', 'slack'] });
      if (args.category === 'github') return text({ tools: [{ name: 'gh_a' }, { name: 'gh_b' }] });
      if (args.category === 'slack') return text({ tools: [{ name: 'sl_a' }] });
      return text({ tools: [] });
    });
    const out = await collect(categoryStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name).sort()).toEqual(['gh_a', 'gh_b', 'sl_a']);
  });

  test('also accepts categories under tools/items/data keys', async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_categories') return text({ items: [{ name: 'x' }] });
      if (args.category === 'x') return text({ tools: [{ name: 'x_one' }] });
      return text({ tools: [] });
    });
    const out = await collect(categoryStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name)).toEqual(['x_one']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/category.test.ts`
Expected: FAIL with "Cannot find module './category'".

- [ ] **Step 3: Implement `category.ts`**

```ts
// src/lib/discovery/strategies/category.ts

import type { DiscoveredTool, ToolResult } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const categoryStrategy: DiscoveryStrategy = {
  kind: 'category_index',
  async *run(ctx) {
    if (!ctx.paired) return;

    const idxResult = await ctx.callTool(ctx.metaTool.toolName, {});
    const categories = extractCategories(idxResult);
    ctx.onProbe({ probe: 'categories', callsMade: 1, newToolsThisProbe: 0, totalToolsSoFar: 0 });

    const listName = ctx.paired.toolName;
    const concurrency = Math.max(1, ctx.limits.maxConcurrency);
    const queue = [...categories];
    const out: DiscoveredTool[] = [];
    let calls = 1;

    async function worker(): Promise<DiscoveredTool[]> {
      const local: DiscoveredTool[] = [];
      while (queue.length > 0 && calls < ctx.limits.maxCalls) {
        const cat = queue.shift();
        if (!cat) break;
        calls++;
        try {
          const r = await ctx.callTool(listName, { category: cat });
          const parsed = extractToolDefs(r);
          for (const p of parsed) {
            local.push({ ...p, source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind } });
          }
        } catch {
          /* skip category on error */
        }
      }
      return local;
    }

    const workers = Array.from({ length: Math.min(concurrency, categories.length || 1) }, () => worker());
    const settled = await Promise.all(workers);
    for (const b of settled) out.push(...b);
    ctx.onProbe({ probe: 'category-fanout', callsMade: calls, newToolsThisProbe: out.length, totalToolsSoFar: out.length });
    yield out;
  },
};

function extractCategories(result: ToolResult): string[] {
  const text = result.content?.[0]?.text;
  if (typeof text !== 'string') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed.map(asCategoryName).filter((s): s is string => !!s);
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['categories', 'namespaces', 'tools', 'items', 'data']) {
      const v = obj[key];
      if (Array.isArray(v)) return v.map(asCategoryName).filter((s): s is string => !!s);
    }
  }
  return [];
}

function asCategoryName(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string') return (v as { name: string }).name;
  return undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/category.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/category.ts src/lib/discovery/strategies/category.test.ts
git commit -m "feat(discovery): category_index strategy with per-category fan-out"
```

---

## Task 11: Strategy — `enable_capability`

**Files:**
- Create: `src/lib/discovery/strategies/enableCapability.ts`
- Test: `src/lib/discovery/strategies/enableCapability.test.ts`

If the capability arg has an `enum`, iterate it; otherwise this strategy is a no-op (the UI directs the user to fill the form manually).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/enableCapability.test.ts

import { describe, expect, test, vi } from 'vitest';
import { enableCapabilityStrategy } from './enableCapability';
import type { DiscoveryContext } from '../strategy';
import type { JsonSchema, ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool'], schema: JsonSchema): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'enable_capability', kind: 'enable_capability', confidence: 0.9, inputSchema: schema },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('enableCapabilityStrategy', () => {
  test('yields nothing when capability arg has no enum', async () => {
    const schema: JsonSchema = { type: 'object', properties: { capability: { type: 'string' } }, required: ['capability'] };
    const callTool = vi.fn();
    const out = await collect(enableCapabilityStrategy.run(makeCtx(callTool, schema)));
    expect(out).toEqual([]);
    expect(callTool).not.toHaveBeenCalled();
  });

  test('iterates enum values and unions returned tools', async () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { capability: { type: 'string', enum: ['github', 'slack'] } },
      required: ['capability'],
    };
    const callTool = vi.fn(async (_n: string, args: Record<string, unknown>) => {
      if (args.capability === 'github') return text({ tools: [{ name: 'gh' }] });
      if (args.capability === 'slack') return text({ tools: [{ name: 'sl' }] });
      return text({ tools: [] });
    });
    const out = await collect(enableCapabilityStrategy.run(makeCtx(callTool, schema)));
    expect(out.map((t) => t.name).sort()).toEqual(['gh', 'sl']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/enableCapability.test.ts`
Expected: FAIL with "Cannot find module './enableCapability'".

- [ ] **Step 3: Implement `enableCapability.ts`**

```ts
// src/lib/discovery/strategies/enableCapability.ts

import type { DiscoveredTool, JsonSchema } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const enableCapabilityStrategy: DiscoveryStrategy = {
  kind: 'enable_capability',
  async *run(ctx) {
    const schema = ctx.metaTool.inputSchema;
    const { field, enumValues } = findCapabilityField(schema);
    if (!field || !enumValues || enumValues.length === 0) return;

    let calls = 0;
    for (const value of enumValues) {
      if (calls >= ctx.limits.maxCalls) break;
      calls++;
      let parsed;
      try {
        const r = await ctx.callTool(ctx.metaTool.toolName, { [field]: value });
        parsed = extractToolDefs(r);
      } catch {
        continue;
      }
      const batch: DiscoveredTool[] = parsed.map((p) => ({
        ...p,
        source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
      }));
      ctx.onProbe({
        probe: `${field}=${value}`,
        callsMade: calls,
        newToolsThisProbe: batch.length,
        totalToolsSoFar: batch.length,
      });
      if (batch.length > 0) yield batch;
    }
  },
};

function findCapabilityField(schema: JsonSchema | undefined): { field?: string; enumValues?: string[] } {
  const props = (schema?.properties ?? {}) as Record<string, { type?: string | string[]; enum?: unknown[] }>;
  for (const key of ['capability', 'tool', 'feature', 'name']) {
    const p = props[key];
    if (p?.enum && Array.isArray(p.enum)) {
      return { field: key, enumValues: p.enum.filter((v): v is string => typeof v === 'string') };
    }
  }
  return {};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/enableCapability.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/enableCapability.ts src/lib/discovery/strategies/enableCapability.test.ts
git commit -m "feat(discovery): enable_capability strategy (enum-driven)"
```

---

## Task 12: Strategy — `manifest`

**Files:**
- Create: `src/lib/discovery/strategies/manifest.ts`
- Test: `src/lib/discovery/strategies/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/strategies/manifest.test.ts

import { describe, expect, test, vi } from 'vitest';
import { manifestStrategy } from './manifest';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'get_manifest', kind: 'manifest', confidence: 0.9 },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('manifestStrategy', () => {
  test('parses an OpenAPI manifest into tools', async () => {
    const manifest = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'getA' } },
        '/b': { post: { operationId: 'postB' } },
      },
    };
    const out = await collect(manifestStrategy.run(makeCtx(async () => text(manifest))));
    expect(out.map((t) => t.name).sort()).toEqual(['getA', 'postB']);
  });

  test('parses an MCP-nested-array manifest', async () => {
    const manifest = { tools: [{ name: 'x' }, { name: 'y' }] };
    const out = await collect(manifestStrategy.run(makeCtx(async () => text(manifest))));
    expect(out.map((t) => t.name)).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/strategies/manifest.test.ts`
Expected: FAIL with "Cannot find module './manifest'".

- [ ] **Step 3: Implement `manifest.ts`**

```ts
// src/lib/discovery/strategies/manifest.ts

import type { DiscoveredTool } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const manifestStrategy: DiscoveryStrategy = {
  kind: 'manifest',
  async *run(ctx) {
    const result = await ctx.callTool(ctx.metaTool.toolName, {});
    const parsed = extractToolDefs(result);
    const out: DiscoveredTool[] = parsed.map((p) => ({
      ...p,
      source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
    }));
    ctx.onProbe({ probe: 'manifest', callsMade: 1, newToolsThisProbe: out.length, totalToolsSoFar: out.length });
    yield out;
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/strategies/manifest.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/manifest.ts src/lib/discovery/strategies/manifest.test.ts
git commit -m "feat(discovery): manifest strategy (multi-shape parser)"
```

---

## Task 13: Strategy — `proxy_invoke` (tagger)

**Files:**
- Create: `src/lib/discovery/strategies/proxy.ts`

The proxy strategy doesn't discover by itself — it identifies a co-located listing meta-tool, delegates discovery, and tags every returned tool with proxy routing metadata so `invokeMaybeDiscovered` knows how to route the call.

- [ ] **Step 1: Create the file**

```ts
// src/lib/discovery/strategies/proxy.ts

import type { DiscoveredTool, MetaToolBinding } from '../../../types';
import { bulkListStrategy } from './bulkList';
import { paginatedListStrategy } from './paginatedList';
import { searchStrategy } from './search';
import { hybridStrategy } from './hybrid';
import { manifestStrategy } from './manifest';
import type { DiscoveryContext, DiscoveryStrategy } from '../strategy';

const DELEGATE_ORDER = ['bulk_list', 'hybrid_index', 'paginated_list', 'manifest', 'search'] as const;

const DELEGATES: Record<typeof DELEGATE_ORDER[number], DiscoveryStrategy> = {
  bulk_list: bulkListStrategy,
  hybrid_index: hybridStrategy,
  paginated_list: paginatedListStrategy,
  manifest: manifestStrategy,
  search: searchStrategy,
};

export const proxyStrategy: DiscoveryStrategy = {
  kind: 'proxy_invoke',
  async *run(ctx) {
    const proxyMeta = ctx.metaTool;
    const proxyArgKey = readMetaProxyKey(proxyMeta, 'proxyArgKey') ?? 'arguments';
    const proxyNameKey = readMetaProxyKey(proxyMeta, 'proxyNameKey') ?? 'tool_name';

    const delegateBinding = pickDelegate(ctx.allMetaTools, proxyMeta.toolName);
    if (!delegateBinding) return;
    const delegate = DELEGATES[delegateBinding.kind as typeof DELEGATE_ORDER[number]];
    if (!delegate) return;

    const subCtx: DiscoveryContext = { ...ctx, metaTool: delegateBinding, paired: findPair(ctx.allMetaTools, delegateBinding) };
    for await (const batch of delegate.run(subCtx)) {
      const tagged: DiscoveredTool[] = batch.map((d) => ({
        ...d,
        source: { ...d.source, via: proxyMeta.toolName, kind: 'proxy_invoke', proxyArgKey, proxyNameKey },
      }));
      yield tagged;
    }
  },
};

function readMetaProxyKey(meta: MetaToolBinding, key: 'proxyArgKey' | 'proxyNameKey'): string | undefined {
  return (meta as unknown as Record<string, unknown>)[key] as string | undefined;
}

function pickDelegate(all: MetaToolBinding[], excludeName: string): MetaToolBinding | undefined {
  for (const k of DELEGATE_ORDER) {
    const found = all.find((m) => m.kind === k && m.toolName !== excludeName);
    if (found) return found;
  }
  return undefined;
}

function findPair(all: MetaToolBinding[], target: MetaToolBinding): MetaToolBinding | undefined {
  if (!target.pairedWith) return undefined;
  return all.find((m) => m.toolName === target.pairedWith);
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Augment `MetaToolBinding` with proxy keys so the detector can carry them through**

In `src/types.ts`, extend the `MetaToolBinding` interface with:

```ts
  /** For proxy_invoke: which input field carries the inner tool's args. */
  proxyArgKey?: string;
  /** For proxy_invoke: which input field carries the inner tool's name. */
  proxyNameKey?: string;
```

Then update `detect.ts` to populate them — in the `bindings.map(...)` block in `detectMetaTools`, change the mapper to:

```ts
const bindings: MetaToolBinding[] = passing.map((s) => ({
  toolName: s.toolName,
  kind: s.kind,
  confidence: Math.min(s.score, 1),
  proxyArgKey: s.proxyArgKey,
  proxyNameKey: s.proxyNameKey,
}));
```

- [ ] **Step 4: Re-run the detection tests**

Run: `npm test -- src/lib/discovery/detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/strategies/proxy.ts src/types.ts src/lib/discovery/detect.ts
git commit -m "feat(discovery): proxy_invoke strategy (delegates + tags routing metadata)"
```

---

## Task 14: Orchestrator

**Files:**
- Create: `src/lib/discovery/orchestrator.ts`
- Test: `src/lib/discovery/orchestrator.test.ts`

The orchestrator picks the right strategy, wires the AbortController, enforces totalTimeout, accumulates results, and reports progress.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/orchestrator.test.ts

import { describe, expect, test, vi } from 'vitest';
import { runDiscovery } from './orchestrator';
import type { MetaToolBinding, ToolResult } from '../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('runDiscovery', () => {
  test('picks bulk_list strategy and accumulates tools', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const callTool = vi.fn(async () => text({ tools: [{ name: 'a' }, { name: 'b' }] }));
    const events: string[] = [];
    const out = await runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool,
      onProbe: (e) => events.push(e.probe),
    });
    expect(out.status).toBe('done');
    expect(out.tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(events).toContain('bulk_list');
  });

  test('reports partial when maxTools cap is hit', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const big = { tools: Array.from({ length: 800 }, (_, i) => ({ name: `t${i}` })) };
    const out = await runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool: async () => text(big),
      onProbe: () => {},
      limits: { maxTools: 100 },
    });
    expect(out.status).toBe('partial');
    expect(out.tools).toHaveLength(100);
  });

  test('marks error when strategy throws', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const out = await runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool: async () => { throw new Error('oops'); },
      onProbe: () => {},
    });
    expect(out.status).toBe('error');
    expect(out.error).toContain('oops');
  });

  test('aborts when signal fires', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const controller = new AbortController();
    let resolveCall: (v: ToolResult) => void = () => {};
    const callTool = () => new Promise<ToolResult>((r) => { resolveCall = r; });
    const promise = runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool,
      onProbe: () => {},
      signal: controller.signal,
    });
    controller.abort();
    resolveCall(text({ tools: [] }));
    const out = await promise;
    expect(out.status).toBe('partial');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/orchestrator.test.ts`
Expected: FAIL with "Cannot find module './orchestrator'".

- [ ] **Step 3: Implement `orchestrator.ts`**

```ts
// src/lib/discovery/orchestrator.ts

import type { DiscoveredTool, DiscoveryRun, DiscoveryStatus, MetaToolBinding, MetaToolKind, ToolResult } from '../../types';
import * as C from './constants';
import { bulkListStrategy } from './strategies/bulkList';
import { categoryStrategy } from './strategies/category';
import { enableCapabilityStrategy } from './strategies/enableCapability';
import { hybridStrategy } from './strategies/hybrid';
import { manifestStrategy } from './strategies/manifest';
import { paginatedListStrategy } from './strategies/paginatedList';
import { proxyStrategy } from './strategies/proxy';
import { searchStrategy } from './strategies/search';
import type { DiscoveryContext, DiscoveryLimits, DiscoveryStrategy, ProbeEvent } from './strategy';

const STRATEGIES: Partial<Record<MetaToolKind, DiscoveryStrategy>> = {
  bulk_list: bulkListStrategy,
  paginated_list: paginatedListStrategy,
  search: searchStrategy,
  hybrid_index: hybridStrategy,
  category_index: categoryStrategy,
  enable_capability: enableCapabilityStrategy,
  manifest: manifestStrategy,
  proxy_invoke: proxyStrategy,
};

export interface RunInput {
  serverId: string;
  metaTool: MetaToolBinding;
  allMetaTools: MetaToolBinding[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  onProbe: (event: ProbeEvent) => void;
  signal?: AbortSignal;
  limits?: Partial<DiscoveryLimits>;
  options?: { alphabetSweep?: boolean };
}

export interface RunOutput {
  status: DiscoveryStatus;
  tools: DiscoveredTool[];
  run: DiscoveryRun;
  error?: string;
}

export async function runDiscovery(input: RunInput): Promise<RunOutput> {
  const startedAt = Date.now();
  const limits: DiscoveryLimits = {
    maxCalls: input.options?.alphabetSweep ? C.MAX_CALLS_WITH_SWEEP : C.MAX_CALLS,
    maxConcurrency: C.MAX_CONCURRENCY,
    maxTools: C.MAX_TOOLS,
    totalTimeoutMs: C.TOTAL_TIMEOUT_MS,
    perCallTimeoutMs: C.PER_CALL_TIMEOUT_MS,
    consecutiveErrorLimit: C.CONSECUTIVE_ERROR_LIMIT,
    ...input.limits,
  };

  const strategy = STRATEGIES[input.metaTool.kind];
  if (!strategy) {
    return finish('error', [], startedAt, 0, 0, 0, `No strategy for kind: ${input.metaTool.kind}`);
  }

  const internalController = new AbortController();
  const timeout = setTimeout(() => internalController.abort(), limits.totalTimeoutMs);
  const externalSignal = input.signal;
  if (externalSignal) {
    if (externalSignal.aborted) internalController.abort();
    else externalSignal.addEventListener('abort', () => internalController.abort(), { once: true });
  }

  const accumulated: DiscoveredTool[] = [];
  const seen = new Set<string>();
  let calls = 0;
  let probes = 0;
  let lastError: string | undefined;
  let hitCap = false;

  const ctx: DiscoveryContext = {
    serverId: input.serverId,
    metaTool: input.metaTool,
    paired: findPair(input.allMetaTools, input.metaTool),
    allMetaTools: input.allMetaTools,
    callTool: input.callTool,
    signal: internalController.signal,
    limits,
    options: input.options ?? {},
    onProbe: (e) => {
      probes++;
      calls = Math.max(calls, e.callsMade);
      input.onProbe(e);
    },
  };

  try {
    for await (const batch of strategy.run(ctx)) {
      if (internalController.signal.aborted) break;
      for (const t of batch) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        accumulated.push(t);
        if (accumulated.length >= limits.maxTools) {
          hitCap = true;
          internalController.abort();
          break;
        }
      }
      if (hitCap) break;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeout);
  }

  let status: DiscoveryStatus;
  if (lastError) status = 'error';
  else if (hitCap || internalController.signal.aborted) status = 'partial';
  else status = 'done';

  return finish(status, accumulated, startedAt, probes, calls, accumulated.length, lastError);
}

function finish(
  status: DiscoveryStatus,
  tools: DiscoveredTool[],
  startedAt: number,
  probes: number,
  calls: number,
  toolsFound: number,
  error?: string,
): RunOutput {
  const run: DiscoveryRun = {
    status,
    startedAt,
    finishedAt: Date.now(),
    probesAttempted: probes,
    callsMade: calls,
    toolsFound,
    error,
  };
  return { status, tools, run, error };
}

function findPair(all: MetaToolBinding[], target: MetaToolBinding): MetaToolBinding | undefined {
  if (!target.pairedWith) return undefined;
  return all.find((m) => m.toolName === target.pairedWith);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/orchestrator.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run all discovery tests together to catch cross-file regressions**

Run: `npm test -- src/lib/discovery`
Expected: PASS for every discovery test file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/discovery/orchestrator.ts src/lib/discovery/orchestrator.test.ts
git commit -m "feat(discovery): orchestrator with limits, abort, and accumulation"
```

---

## Task 15: Invocation routing (`invoke.ts`)

**Files:**
- Create: `src/lib/discovery/invoke.ts`
- Test: `src/lib/discovery/invoke.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/discovery/invoke.test.ts

import { describe, expect, test, vi } from 'vitest';
import { invokeMaybeDiscovered } from './invoke';
import type { DiscoveredTool, MetaToolBinding, ToolDef, ToolResult } from '../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('invokeMaybeDiscovered', () => {
  test('routes native tools through callTool directly', async () => {
    const callTool = vi.fn(async () => text({ ok: true }));
    const t: ToolDef = { name: 'native', inputSchema: { type: 'object' } };
    await invokeMaybeDiscovered({ callTool, tool: t, args: { x: 1 }, metaTools: [] });
    expect(callTool).toHaveBeenCalledWith('native', { x: 1 });
  });

  test('routes proxy-discovered tools through the proxy meta-tool', async () => {
    const callTool = vi.fn(async () => text({ ok: true }));
    const t: DiscoveredTool = {
      name: 'gh_create',
      inputSchema: { type: 'object' },
      source: { via: 'invoke_tool', kind: 'proxy_invoke', proxyNameKey: 'tool_name', proxyArgKey: 'arguments' },
    };
    await invokeMaybeDiscovered({ callTool, tool: t, args: { title: 'hi' }, metaTools: [] });
    expect(callTool).toHaveBeenCalledWith('invoke_tool', { tool_name: 'gh_create', arguments: { title: 'hi' } });
  });

  test('search-discovered: tries direct first; on not-found, falls back to proxy', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (name === 'searched') throw new Error('Tool not found');
      return text({ ok: true });
    });
    const t: DiscoveredTool = {
      name: 'searched',
      inputSchema: { type: 'object' },
      source: { via: 'search_tools', kind: 'search' },
    };
    const proxy: MetaToolBinding = {
      toolName: 'invoke_tool',
      kind: 'proxy_invoke',
      confidence: 0.9,
      proxyNameKey: 'tool_name',
      proxyArgKey: 'arguments',
    };
    const out = await invokeMaybeDiscovered({ callTool, tool: t, args: { v: 1 }, metaTools: [proxy] });
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toBe('searched');
    expect(calls[1][0]).toBe('invoke_tool');
    expect(out).toBeDefined();
  });

  test('direct-discovered (bulk_list source) does NOT fall back to proxy on error', async () => {
    const callTool = vi.fn(async () => { throw new Error('Tool not found'); });
    const t: DiscoveredTool = {
      name: 'direct',
      inputSchema: { type: 'object' },
      source: { via: 'list_tools', kind: 'bulk_list' },
    };
    const proxy: MetaToolBinding = {
      toolName: 'invoke_tool',
      kind: 'proxy_invoke',
      confidence: 0.9,
      proxyNameKey: 'tool_name',
      proxyArgKey: 'arguments',
    };
    await expect(
      invokeMaybeDiscovered({ callTool, tool: t, args: {}, metaTools: [proxy] }),
    ).rejects.toThrow('Tool not found');
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/discovery/invoke.test.ts`
Expected: FAIL with "Cannot find module './invoke'".

- [ ] **Step 3: Implement `invoke.ts`**

```ts
// src/lib/discovery/invoke.ts

import type { DiscoveredTool, MetaToolBinding, ToolDef, ToolResult } from '../../types';

export interface InvokeInput {
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  tool: ToolDef | DiscoveredTool;
  args: Record<string, unknown>;
  metaTools: MetaToolBinding[];
}

const DIRECT_KINDS = new Set([
  'bulk_list', 'paginated_list', 'hybrid_index', 'category_list',
  'manifest', 'enable_capability',
]);

export async function invokeMaybeDiscovered(input: InvokeInput): Promise<ToolResult> {
  const { tool, args, callTool, metaTools } = input;
  const source = (tool as DiscoveredTool).source;

  if (!source) return callTool(tool.name, args);

  if (source.kind === 'proxy_invoke') {
    return callProxy(callTool, tool.name, args, source);
  }

  if (DIRECT_KINDS.has(source.kind)) {
    return callTool(tool.name, args);
  }

  // Search-discovered: direct first, proxy fallback on not-found.
  try {
    return await callTool(tool.name, args);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    const proxy = metaTools.find((m) => m.kind === 'proxy_invoke');
    if (!proxy) throw err;
    return callTool(proxy.toolName, {
      [proxy.proxyNameKey ?? 'tool_name']: tool.name,
      [proxy.proxyArgKey ?? 'arguments']: args,
    });
  }
}

function callProxy(
  callTool: InvokeInput['callTool'],
  innerName: string,
  args: Record<string, unknown>,
  source: NonNullable<DiscoveredTool['source']>,
): Promise<ToolResult> {
  const nameKey = source.proxyNameKey ?? 'tool_name';
  const argKey = source.proxyArgKey ?? 'arguments';
  return callTool(source.via, { [nameKey]: innerName, [argKey]: args });
}

function isNotFound(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /tool not found|unknown tool|no such tool/i.test(m);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/discovery/invoke.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery/invoke.ts src/lib/discovery/invoke.test.ts
git commit -m "feat(discovery): invocation routing (direct/proxy/fallback)"
```

---

## Task 16: UI components

**Files:**
- Create: `src/components/DiscoveryProgress.tsx`
- Create: `src/components/DiscoveryHeader.tsx`
- Create: `src/components/DiscoveredToolsSection.tsx`

Three pure presentational components — state lives in App.tsx (passed in via props).

- [ ] **Step 1: Create `DiscoveryProgress.tsx`**

```tsx
// src/components/DiscoveryProgress.tsx

import type { DiscoveryRun } from '../types';

interface Props {
  run: DiscoveryRun;
}

export function DiscoveryProgress({ run }: Props) {
  if (run.status === 'idle') return null;
  const elapsed = run.startedAt ? ((run.finishedAt ?? Date.now()) - run.startedAt) / 1000 : 0;
  const summary = `${run.callsMade} call${run.callsMade === 1 ? '' : 's'} · ${run.toolsFound} tool${run.toolsFound === 1 ? '' : 's'} · ${elapsed.toFixed(1)}s`;
  return (
    <code className="text-[11px] font-mono text-zinc-500 truncate">
      {summary}
    </code>
  );
}
```

- [ ] **Step 2: Create `DiscoveryHeader.tsx`**

```tsx
// src/components/DiscoveryHeader.tsx

import type { DiscoveryRun, MetaToolBinding } from '../types';
import { DiscoveryProgress } from './DiscoveryProgress';

interface Props {
  meta: MetaToolBinding;
  run: DiscoveryRun;
  onDiscover: (opts?: { alphabetSweep?: boolean }) => void;
  onStop: () => void;
}

const LABEL: Record<MetaToolBinding['kind'], string> = {
  bulk_list: 'discovery tool (list)',
  paginated_list: 'discovery tool (paginated list)',
  search: 'discovery tool (search)',
  hybrid_index: 'discovery tool (list + describe)',
  hybrid_describe: 'tool descriptor',
  category_index: 'discovery tool (categories)',
  category_list: 'category listing tool',
  enable_capability: 'capability enabler',
  proxy_invoke: 'proxy invoker',
  manifest: 'discovery tool (manifest)',
};

export function DiscoveryHeader({ meta, run, onDiscover, onStop }: Props) {
  const tint =
    run.status === 'error' ? 'border-red-900/60 bg-red-950/20' :
    run.status === 'partial' ? 'border-amber-900/60 bg-amber-950/20' :
    'border-zinc-800/80 bg-zinc-900/40';

  return (
    <div className={`rounded-xl border ${tint} px-4 py-3 flex items-center gap-3`}>
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-violet-400 shrink-0" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-xs text-zinc-300">This is a {LABEL[meta.kind]}.</span>
      <div className="flex-1" />
      <DiscoveryProgress run={run} />
      {renderActions(meta, run, onDiscover, onStop)}
    </div>
  );
}

function renderActions(
  meta: MetaToolBinding,
  run: DiscoveryRun,
  onDiscover: Props['onDiscover'],
  onStop: Props['onStop'],
) {
  if (run.status === 'running') {
    return (
      <button
        type="button"
        onClick={onStop}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-900/40 hover:bg-red-900/60 border border-red-900/60 text-red-200"
      >
        Stop
      </button>
    );
  }

  if (run.status === 'partial' && meta.kind === 'search') {
    return (
      <>
        <button
          type="button"
          onClick={() => onDiscover()}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200"
        >
          Re-discover
        </button>
        <button
          type="button"
          onClick={() => onDiscover({ alphabetSweep: true })}
          className="text-xs text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline"
        >
          Try harder
        </button>
      </>
    );
  }

  if (run.status === 'done' || run.status === 'partial' || run.status === 'error') {
    return (
      <button
        type="button"
        onClick={() => onDiscover()}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200"
      >
        {run.status === 'error' ? 'Retry' : 'Re-discover'}
      </button>
    );
  }

  // idle
  if (meta.kind === 'enable_capability') {
    return (
      <span className="text-[11px] text-zinc-500">Fill the form below and submit to enable.</span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onDiscover()}
      className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
    >
      Discover all tools
    </button>
  );
}
```

- [ ] **Step 3: Create `DiscoveredToolsSection.tsx`**

```tsx
// src/components/DiscoveredToolsSection.tsx

import { useState } from 'react';
import type { DiscoveredTool } from '../types';

interface Props {
  tools: DiscoveredTool[];
  nativeNames: Set<string>;
  selectedToolName: string | null;
  onSelect: (name: string) => void;
}

export function DiscoveredToolsSection({ tools, nativeNames, selectedToolName, onSelect }: Props) {
  const visible = tools.filter((t) => !nativeNames.has(t.name));
  const [open, setOpen] = useState(visible.length <= 50);
  if (visible.length === 0) return null;

  return (
    <li className="mt-2 border-t border-zinc-800/60 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 flex items-center justify-between text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 hover:text-zinc-200"
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden>
            <path d="M5.5 3l5 5-5 5V3z" />
          </svg>
          Discovered
        </span>
        <span>{visible.length}</span>
      </button>
      {open && (
        <ul>
          {visible.map((t) => {
            const isSelected = t.name === selectedToolName;
            const desc = (t.description ?? '').split('\n').filter(Boolean)[0];
            return (
              <li
                key={t.name}
                onClick={() => onSelect(t.name)}
                className={[
                  'group relative mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all',
                  isSelected
                    ? 'bg-zinc-900/90 border border-zinc-700/70'
                    : 'border border-transparent hover:bg-zinc-900/50 hover:border-zinc-800/80',
                ].join(' ')}
              >
                {isSelected && (
                  <span className="absolute left-0 top-2 bottom-2 w-0.5 -translate-x-1.5 bg-violet-500 rounded-full" />
                )}
                <div className="font-mono text-xs text-zinc-100 truncate">{t.name}</div>
                {desc && (
                  <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2 leading-snug">{desc}</div>
                )}
                <div className="text-[10px] text-zinc-600 mt-0.5 font-mono truncate">via {t.source.via}</div>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoveryProgress.tsx src/components/DiscoveryHeader.tsx src/components/DiscoveredToolsSection.tsx
git commit -m "feat(discovery): UI components — header, progress, discovered section"
```

---

## Task 17: `mcpClient` — expose `callTool` curry + tools-changed subscription

**Files:**
- Modify: `src/lib/mcpClient.ts`

We need (a) a way to subscribe to `tools/list_changed` notifications, (b) a way to re-fetch the tool list after a notification or `enable_capability`.

- [ ] **Step 1: Add an import at the top of `src/lib/mcpClient.ts`**

Add the schema import alongside the existing SDK imports:

```ts
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
```

- [ ] **Step 2: Append two helpers after the existing `callTool` function**

```ts
/**
 * Re-fetch the tool list for an already-connected server.
 * Returns an empty array if the server is disconnected.
 */
export async function refetchTools(serverId: string): Promise<ToolDef[]> {
  const client = clients.get(serverId);
  if (!client) return [];
  const list = await client.listTools();
  return list.tools as unknown as ToolDef[];
}

/**
 * Subscribe to `notifications/tools/list_changed` for a connected server.
 * Returns an unsubscribe function. No-op if disconnected.
 */
export function onToolsChanged(serverId: string, handler: () => void): () => void {
  const client = clients.get(serverId);
  if (!client) return () => {};
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    handler();
  });
  return () => {
    // Best-effort: replace with a noop handler.
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {});
  };
}
```

If the `ToolListChangedNotificationSchema` import path differs in the installed SDK version, check the published `@modelcontextprotocol/sdk` types — search for `tools/list_changed` under `node_modules/@modelcontextprotocol/sdk/types.d.ts` and adjust. Task 20 verifies this explicitly.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors. If the schema name differs, fix the import.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcpClient.ts
git commit -m "feat(discovery): refetchTools and onToolsChanged helpers"
```

---

## Task 18: Wire `ToolDetail.tsx` (render header, switch to `invokeMaybeDiscovered`)

**Files:**
- Modify: `src/components/ToolDetail.tsx`

- [ ] **Step 1: Update `ToolDetail.tsx` props and imports**

Change the `Props` interface and imports near the top:

```tsx
import { useState } from 'react';
import { SchemaForm } from './SchemaForm';
import { ResultPane } from './ResultPane';
import { DiscoveryHeader } from './DiscoveryHeader';
import { invokeMaybeDiscovered } from '../lib/discovery/invoke';
import { callTool } from '../lib/mcpClient';
import type { DiscoveryRun, MetaToolBinding, ServerEntry, ToolDef, ToolResult } from '../types';

interface Props {
  server: ServerEntry | null;
  tool: ToolDef | null;
  metaBinding: MetaToolBinding | null;
  discoveryRun: DiscoveryRun | null;
  onDiscover: (metaToolName: string, opts?: { alphabetSweep?: boolean }) => void;
  onStop: (metaToolName: string) => void;
}
```

Update both `ToolDetail` and `ToolDetailSession` signatures to accept the new props (forward them through):

```tsx
export function ToolDetail({ server, tool, metaBinding, discoveryRun, onDiscover, onStop }: Props) {
  const sessionKey = `${server?.id ?? 'none'}:${tool?.name ?? 'none'}`;
  return <ToolDetailSession key={sessionKey} server={server} tool={tool} metaBinding={metaBinding} discoveryRun={discoveryRun} onDiscover={onDiscover} onStop={onStop} />;
}

function ToolDetailSession({ server, tool, metaBinding, discoveryRun, onDiscover, onStop }: Props) {
```

- [ ] **Step 2: Render `DiscoveryHeader` above the existing `<header>` when `metaBinding` is present**

Replace this block at the top of the `<main>`:

```tsx
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <header className="space-y-2">
```

With:

```tsx
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        {metaBinding && discoveryRun && (
          <DiscoveryHeader
            meta={metaBinding}
            run={discoveryRun}
            onDiscover={(opts) => onDiscover(metaBinding.toolName, opts)}
            onStop={() => onStop(metaBinding.toolName)}
          />
        )}
        <header className="space-y-2">
```

- [ ] **Step 3: Switch the `run()` body to use `invokeMaybeDiscovered`**

Replace:

```tsx
      const r = await callTool(server.id, tool.name, cleanedArgs);
```

With:

```tsx
      const r = await invokeMaybeDiscovered({
        callTool: (n, a) => callTool(server.id, n, a),
        tool,
        args: cleanedArgs,
        metaTools: server.metaTools ?? [],
      });
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors. (Compilation will fail until Task 21 because App.tsx hasn't been updated yet — that's expected; complete this commit and continue.)

- [ ] **Step 5: Commit (compilation will be temporarily broken at the call site in App.tsx; fix in Task 21)**

```bash
git add src/components/ToolDetail.tsx
git commit -m "feat(discovery): wire DiscoveryHeader and invocation routing into ToolDetail"
```

---

## Task 19: Wire `ToolList.tsx` (render `DiscoveredToolsSection`)

**Files:**
- Modify: `src/components/ToolList.tsx`

- [ ] **Step 1: Add import**

At the top of `src/components/ToolList.tsx`, alongside the existing import:

```tsx
import { DiscoveredToolsSection } from './DiscoveredToolsSection';
```

- [ ] **Step 2: Render `DiscoveredToolsSection` inside the `<ul>` after the existing `tools.map(...)` block**

Locate the closing `</ul>` near line 71 and insert the section just before it:

```tsx
        <DiscoveredToolsSection
          tools={server.discovered ?? []}
          nativeNames={new Set(tools.map((t) => t.name))}
          selectedToolName={selectedToolName}
          onSelect={onSelect}
        />
      </ul>
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: still failing on the `ToolDetail` prop mismatch from Task 18, but `ToolList` itself compiles.

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolList.tsx
git commit -m "feat(discovery): render DiscoveredToolsSection in ToolList"
```

---

## Task 20: SDK schema import sanity-check

**Files:**
- Read-only inspection: `node_modules/@modelcontextprotocol/sdk/`

- [ ] **Step 1: Confirm `ToolListChangedNotificationSchema` exists where Task 17 imports it from**

Run: `grep -r "ToolListChanged" node_modules/@modelcontextprotocol/sdk/dist/types* 2>/dev/null | head -5`
Expected: a hit in `types.d.ts` (path varies by SDK version).

If the symbol is missing, locate the actual schema name (search for `tools/list_changed`) and update the import in `src/lib/mcpClient.ts` accordingly. Re-run `npx tsc --noEmit -p tsconfig.app.json` to confirm.

- [ ] **Step 2: If you had to change the import, commit the fix**

```bash
git add src/lib/mcpClient.ts
git commit -m "fix(discovery): correct SDK schema import for tools/list_changed"
```

If no change was needed, skip this commit.

---

## Task 21: Wire `App.tsx` (run detection on connect, manage discovery state)

**Files:**
- Modify: `src/App.tsx`

This is the largest UI task. It plumbs detection into the connect flow, runs `runDiscovery` from the header, stores the resulting tools on the server entry, and subscribes to `tools/list_changed`.

- [ ] **Step 1: Add imports near the top of `src/App.tsx`**

Add to the existing imports block:

```tsx
import { detectMetaTools } from './lib/discovery/detect';
import { runDiscovery } from './lib/discovery/orchestrator';
import { callTool as mcpCallTool, onToolsChanged, refetchTools } from './lib/mcpClient';
import type { DiscoveryRun, MetaToolBinding } from './types';
```

- [ ] **Step 2: Detect meta-tools after a successful connect**

In `handleConnect`, replace the success branch:

```tsx
      const tools = await connect(id, url, auth);
      updateServer(id, { status: 'connected', tools, error: undefined });
```

With:

```tsx
      const tools = await connect(id, url, auth);
      const metaTools = detectMetaTools(tools);
      updateServer(id, {
        status: 'connected',
        tools,
        metaTools,
        discovered: undefined,
        discoveryRuns: {},
        error: undefined,
      });
      // Subscribe to tools/list_changed for this server.
      onToolsChanged(id, () => {
        void refetchTools(id).then((next) => {
          const nextMeta = detectMetaTools(next);
          updateServer(id, { tools: next, metaTools: nextMeta });
        });
      });
```

- [ ] **Step 3: Clear discovery state on disconnect**

In `handleDisconnect`, change:

```tsx
    updateServer(id, { status: 'disconnected', tools: undefined });
```

To:

```tsx
    updateServer(id, {
      status: 'disconnected',
      tools: undefined,
      metaTools: undefined,
      discovered: undefined,
      discoveryRuns: undefined,
    });
```

- [ ] **Step 4: Add a `discoveryControllers` ref for cancellation**

After the existing `serversRef` declaration, add:

```tsx
const discoveryControllersRef = useRef<Map<string, AbortController>>(new Map());
```

- [ ] **Step 5: Add `handleDiscover` and `handleDiscoveryStop` handlers**

Place these inside `App`, near the other handlers (e.g., right after `handleDisconnect`):

```tsx
async function handleDiscover(
  serverId: string,
  metaToolName: string,
  opts?: { alphabetSweep?: boolean },
) {
  const server = serversRef.current.find((s) => s.id === serverId);
  if (!server) return;
  const meta = server.metaTools?.find((m) => m.toolName === metaToolName);
  if (!meta) return;

  const key = `${serverId}:${metaToolName}`;
  discoveryControllersRef.current.get(key)?.abort();
  const controller = new AbortController();
  discoveryControllersRef.current.set(key, controller);

  const runningRun: DiscoveryRun = {
    status: 'running',
    startedAt: Date.now(),
    probesAttempted: 0,
    callsMade: 0,
    toolsFound: 0,
  };
  updateServer(serverId, {
    discoveryRuns: { ...(server.discoveryRuns ?? {}), [metaToolName]: runningRun },
  });

  // Capture meta tool schema from the live tools list before running.
  const fullMeta: MetaToolBinding = { ...meta, inputSchema: server.tools?.find((t) => t.name === meta.toolName)?.inputSchema };
  const allWithSchema: MetaToolBinding[] = (server.metaTools ?? []).map((m) => ({
    ...m,
    inputSchema: server.tools?.find((t) => t.name === m.toolName)?.inputSchema,
  }));

  const result = await runDiscovery({
    serverId,
    metaTool: fullMeta,
    allMetaTools: allWithSchema,
    callTool: (n, a) => mcpCallTool(serverId, n, a),
    onProbe: (event) => {
      const current = serversRef.current.find((s) => s.id === serverId);
      const prevRun = current?.discoveryRuns?.[metaToolName];
      if (!prevRun) return;
      updateServer(serverId, {
        discoveryRuns: {
          ...(current?.discoveryRuns ?? {}),
          [metaToolName]: {
            ...prevRun,
            callsMade: event.callsMade,
            toolsFound: event.totalToolsSoFar,
            probesAttempted: prevRun.probesAttempted + 1,
          },
        },
      });
    },
    signal: controller.signal,
    options: opts,
  });

  // Merge discovered tools into the server entry (dedup by name across multiple meta-tools).
  const latest = serversRef.current.find((s) => s.id === serverId);
  if (!latest) return;
  const existing = latest.discovered ?? [];
  const byName = new Map(existing.map((t) => [t.name, t]));
  for (const t of result.tools) if (!byName.has(t.name)) byName.set(t.name, t);
  updateServer(serverId, {
    discovered: Array.from(byName.values()),
    discoveryRuns: {
      ...(latest.discoveryRuns ?? {}),
      [metaToolName]: result.run,
    },
  });
  discoveryControllersRef.current.delete(key);
}

function handleDiscoveryStop(serverId: string, metaToolName: string) {
  const key = `${serverId}:${metaToolName}`;
  discoveryControllersRef.current.get(key)?.abort();
}
```

- [ ] **Step 6: Compute `selectedTool`, `selectedMeta`, and `selectedRun` for the open tool**

Replace the existing `selectedTool` `useMemo` block:

```tsx
  const selectedTool = useMemo(() => {
    if (!selectedServer || !selectedToolName) return null;
    return selectedServer.tools?.find((t) => t.name === selectedToolName) ?? null;
  }, [selectedServer, selectedToolName]);
```

With:

```tsx
  const selectedTool = useMemo(() => {
    if (!selectedServer || !selectedToolName) return null;
    const native = selectedServer.tools?.find((t) => t.name === selectedToolName);
    if (native) return native;
    return selectedServer.discovered?.find((t) => t.name === selectedToolName) ?? null;
  }, [selectedServer, selectedToolName]);

  const selectedMeta = useMemo(() => {
    if (!selectedServer || !selectedToolName) return null;
    return selectedServer.metaTools?.find((m) => m.toolName === selectedToolName) ?? null;
  }, [selectedServer, selectedToolName]);

  const selectedRun = useMemo<DiscoveryRun>(() => {
    const existing = selectedServer && selectedToolName ? selectedServer.discoveryRuns?.[selectedToolName] : undefined;
    return existing ?? { status: 'idle', probesAttempted: 0, callsMade: 0, toolsFound: 0 };
  }, [selectedServer, selectedToolName]);
```

- [ ] **Step 7: Pass the new props to `<ToolDetail>`**

Replace:

```tsx
        <ToolDetail server={selectedServer} tool={selectedTool} />
```

With:

```tsx
        <ToolDetail
          server={selectedServer}
          tool={selectedTool}
          metaBinding={selectedMeta}
          discoveryRun={selectedRun}
          onDiscover={(metaToolName, opts) => void handleDiscover(selectedServer!.id, metaToolName, opts)}
          onStop={(metaToolName) => handleDiscoveryStop(selectedServer!.id, metaToolName)}
        />
```

- [ ] **Step 8: Verify the whole project compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: PASS for every test file.

- [ ] **Step 10: Build the project**

Run: `npm run build`
Expected: exits 0; `dist/` is produced.

- [ ] **Step 11: Commit**

```bash
git add src/App.tsx
git commit -m "feat(discovery): wire detection, orchestrator, and routing into App"
```

---

## Task 22: Lint, manual smoke check, README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the linter**

Run: `npm run lint`
Expected: no errors. Fix anything that comes up (most likely import order or unused-var nits).

- [ ] **Step 2: Smoke test against a real server**

Run: `npm run dev`
Open the printed URL. Add an MCP server that exposes a meta-tool (any of: a server with `list_tools` / `search_tools` / Smithery Toolbox / Pipedream / similar). For each meta-tool, click "Discover all tools" in the detail pane and verify:

1. The header shows `running` → `done` (or `partial`) with sensible counts.
2. Discovered tools appear in the `Discovered (N)` section in the left list.
3. A tool whose name matches a native tool is NOT in the discovered section.
4. Selecting a discovered tool shows the SchemaForm; submitting it calls through correctly (direct or proxy-routed depending on the source).
5. The "Stop" button aborts a running discovery.
6. For `search`-kind meta-tools that hit limits, the "Try harder" link appears and triggers the alphabet sweep.

If a server has no meta-tools, the header strip should not appear and the discovered section should stay hidden.

- [ ] **Step 3: Add a short README section**

In `README.md`, after the existing "Features" section, append:

```md
### Meta-tool discovery

When a connected server exposes a tool whose purpose is to discover *other* tools — patterns like `list_tools`, `search_tools`, `invoke_tool`, `get_manifest` — the explorer detects it automatically. Opening that tool reveals a **Discover all tools** button; running it populates a collapsible **Discovered** section in the left list with the full catalog. Discovered tools can be invoked directly (or routed through a proxy meta-tool when the server requires it).
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(discovery): add README section for meta-tool discovery"
```

- [ ] **Step 5: Final verification**

Run, in order:

```bash
npm run lint
npm test
npm run build
```

All three must exit 0.

---

## Done

Total commits: ~22. The feature is end-to-end functional: detection on connect, per-meta-tool discovery via a single button, deduped catalog merge into the tool list, direct/proxy-routed invocation, and a "Try harder" path for stubborn search-only servers.
