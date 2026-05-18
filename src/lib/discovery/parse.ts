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
    .filter((c): c is RawTool => !!c && typeof (c as RawTool).name === 'string' && (c as RawTool).name.length > 0)
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
      const description = typeof o.summary === 'string'
        ? o.summary
        : (typeof o.description === 'string' ? o.description : undefined);
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
