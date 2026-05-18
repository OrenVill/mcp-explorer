// src/lib/discovery/strategies/paginatedList.test.ts

import { describe, expect, test, vi } from 'vitest';
import { paginatedListStrategy } from './paginatedList';
import type { DiscoveryContext } from '../strategy';
import type { JsonSchema, ToolResult } from '../../../types';

function ctx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
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
    const c = ctx(callTool);
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
    const c = ctx(callTool);
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
    const c = ctx(callTool);
    (c.metaTool as unknown as { inputSchema: JsonSchema }).inputSchema = schema;
    const out = await collect(paginatedListStrategy.run(c));
    expect(out.map((t) => t.name)).toEqual(['a', 'b']);
    expect(callTool).toHaveBeenNthCalledWith(1, 'list_tools', {});
    expect(callTool).toHaveBeenNthCalledWith(2, 'list_tools', { page: 2 });
  });
});
