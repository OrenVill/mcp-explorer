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
