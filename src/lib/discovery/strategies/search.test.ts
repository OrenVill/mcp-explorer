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
