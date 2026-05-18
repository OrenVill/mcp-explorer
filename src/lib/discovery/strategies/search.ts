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
