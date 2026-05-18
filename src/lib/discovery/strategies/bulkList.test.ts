// src/lib/discovery/strategies/bulkList.test.ts

import { describe, expect, test, vi } from 'vitest';
import { bulkListStrategy } from './bulkList';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.8 },
    allMetaTools: [{ toolName: 'list_tools', kind: 'bulk_list', confidence: 0.8 }],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

function textResult(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('bulkListStrategy', () => {
  test('calls meta-tool with empty args and yields parsed batch', async () => {
    const callTool = vi.fn(async () => textResult({ tools: [{ name: 'a' }, { name: 'b' }] }));
    const out = await collect(bulkListStrategy.run(makeCtx(callTool)));
    expect(callTool).toHaveBeenCalledWith('list_tools', {});
    expect(out.map((t) => t.name)).toEqual(['a', 'b']);
  });

  test('tags discovered tools with source.via and source.kind', async () => {
    const callTool = vi.fn(async () => textResult({ tools: [{ name: 'a' }] }));
    const out = await collect(bulkListStrategy.run(makeCtx(callTool)));
    expect(out[0].source).toEqual({ via: 'list_tools', kind: 'bulk_list' });
  });

  test('emits a probe event', async () => {
    const onProbe = vi.fn();
    const callTool = async () => textResult({ tools: [{ name: 'a' }] });
    const ctx = { ...makeCtx(callTool), onProbe };
    await collect(bulkListStrategy.run(ctx));
    expect(onProbe).toHaveBeenCalledTimes(1);
    expect(onProbe.mock.calls[0][0]).toMatchObject({ callsMade: 1, totalToolsSoFar: 1 });
  });
});
