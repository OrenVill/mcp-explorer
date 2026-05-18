// src/lib/discovery/strategies/paginatedList.ts

import type { DiscoveredTool, JsonSchema, ToolResult } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

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
