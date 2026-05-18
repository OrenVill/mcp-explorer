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
