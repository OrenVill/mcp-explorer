// src/lib/discovery/strategies/manifest.test.ts

import { describe, expect, test } from 'vitest';
import { manifestStrategy } from './manifest';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'get_manifest', kind: 'manifest', confidence: 0.9 },
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

describe('manifestStrategy', () => {
  test('parses an OpenAPI manifest into tools', async () => {
    const manifest = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'getA' } },
        '/b': { post: { operationId: 'postB' } },
      },
    };
    const out = await collect(manifestStrategy.run(makeCtx(async () => text(manifest))));
    expect(out.map((t) => t.name).sort()).toEqual(['getA', 'postB']);
  });

  test('parses an MCP-nested-array manifest', async () => {
    const manifest = { tools: [{ name: 'x' }, { name: 'y' }] };
    const out = await collect(manifestStrategy.run(makeCtx(async () => text(manifest))));
    expect(out.map((t) => t.name)).toEqual(['x', 'y']);
  });
});
