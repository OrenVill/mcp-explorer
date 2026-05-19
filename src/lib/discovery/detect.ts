import type { JsonSchema, MetaToolBinding, MetaToolKind, ToolDef } from '../../types';

// Allow `_` or `-` between verb and noun (real-world MCP servers use both).
const SEP = '[_-]';
// Aggregator-ecosystem nouns. Kept narrow on purpose — content nouns like "library/model/dataset"
// are excluded because those servers search content, not invocable tools, and our parser expects tool defs.
const NOUN = '(tool|tools|action|actions|function|functions|capability|capabilities|skill|skills|actor|actors|server|servers|agent|agents|mcp|mcps)';

const NAME_PATTERNS: Array<[RegExp, MetaToolKind]> = [
  [new RegExp(`^(list|browse|index|get_all)${SEP}${NOUN}$`), 'bulk_list'],
  [new RegExp(`^(search|find|query)${SEP}${NOUN}$`), 'search'],
  [new RegExp(`^describe${SEP}(tool|action|function|actor|server|agent)$`), 'hybrid_describe'],
  [new RegExp(`^get${SEP}(tool|actor|server|agent)(${SEP}(info|schema|details|definition))?$`), 'hybrid_describe'],
  [new RegExp(`^(fetch)${SEP}(tool|actor|server|agent)${SEP}(info|schema|details|definition)$`), 'hybrid_describe'],
  [new RegExp(`^(invoke|call|run|use|execute)${SEP}(tool|action|function|actor|server|agent)$`), 'proxy_invoke'],
  [new RegExp(`^(list|get)${SEP}(category|categories|namespace|namespaces)$`), 'category_index'],
  [new RegExp(`^(list${SEP}tools${SEP}in|tools${SEP}in)${SEP}.+$`), 'category_list'],
  [new RegExp(`^(enable|add)${SEP}(capability|tool|feature|actor|server|agent)$`), 'enable_capability'],
  [new RegExp(`^(get|export)${SEP}(manifest|openapi|schema|catalog)$`), 'manifest'],
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
    proxyArgKey: s.proxyArgKey,
    proxyNameKey: s.proxyNameKey,
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

  // hybrid_describe: single required arg that names a tool
  if (required.size === 1) {
    const only = [...required][0];
    if (only && ['name', 'tool_name', 'tool'].includes(only)) {
      return { kind: 'hybrid_describe' };
    }
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

  // bulk_list: no required inputs AND no extraneous non-paging properties
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
