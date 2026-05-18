// src/lib/discovery/strategies/hybrid.ts

import type { DiscoveredTool, JsonSchema, ToolResult } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

function readSingleToolSchema(result: ToolResult): JsonSchema | undefined {
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  let payload: unknown = structured;
  if (payload === undefined) {
    const text = result.content?.[0]?.text;
    if (typeof text !== 'string') return undefined;
    try {
      payload = JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    const schema = obj.inputSchema ?? obj.parameters;
    if (schema && typeof schema === 'object') return schema as JsonSchema;
  }
  return undefined;
}

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
          if (first?.inputSchema) {
            schema = first.inputSchema;
          } else {
            // Fall back: describe responses are often a single tool object
            // (not wrapped in `tools: [...]`). Read the payload directly.
            const single = readSingleToolSchema(r);
            if (single) schema = single;
          }
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
