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
