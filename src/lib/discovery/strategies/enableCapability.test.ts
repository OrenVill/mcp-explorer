// src/lib/discovery/strategies/enableCapability.test.ts

import { describe, expect, test, vi } from 'vitest';
import { enableCapabilityStrategy } from './enableCapability';
import type { DiscoveryContext } from '../strategy';
import type { JsonSchema, ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool'], schema: JsonSchema): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'enable_capability', kind: 'enable_capability', confidence: 0.9, inputSchema: schema },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 5, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('enableCapabilityStrategy', () => {
  test('yields nothing when capability arg has no enum', async () => {
    const schema: JsonSchema = { type: 'object', properties: { capability: { type: 'string' } }, required: ['capability'] };
    const callTool = vi.fn();
    const out = await collect(enableCapabilityStrategy.run(makeCtx(callTool, schema)));
    expect(out).toEqual([]);
    expect(callTool).not.toHaveBeenCalled();
  });

  test('iterates enum values and unions returned tools', async () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { capability: { type: 'string', enum: ['github', 'slack'] } },
      required: ['capability'],
    };
    const callTool = vi.fn(async (_n: string, args: Record<string, unknown>) => {
      if (args.capability === 'github') return text({ tools: [{ name: 'gh' }] });
      if (args.capability === 'slack') return text({ tools: [{ name: 'sl' }] });
      return text({ tools: [] });
    });
    const out = await collect(enableCapabilityStrategy.run(makeCtx(callTool, schema)));
    expect(out.map((t) => t.name).sort()).toEqual(['gh', 'sl']);
  });
});
