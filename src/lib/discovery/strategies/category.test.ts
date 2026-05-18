// src/lib/discovery/strategies/category.test.ts

import { describe, expect, test, vi } from 'vitest';
import { categoryStrategy } from './category';
import type { DiscoveryContext } from '../strategy';
import type { ToolResult } from '../../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

function makeCtx(callTool: DiscoveryContext['callTool']): DiscoveryContext {
  return {
    serverId: 's',
    metaTool: { toolName: 'list_categories', kind: 'category_index', confidence: 0.9, pairedWith: 'list_tools_in_category' },
    paired: { toolName: 'list_tools_in_category', kind: 'category_list', confidence: 0.9 },
    allMetaTools: [],
    callTool,
    signal: new AbortController().signal,
    limits: { maxCalls: 20, maxConcurrency: 3, maxTools: 500, totalTimeoutMs: 30000, perCallTimeoutMs: 10000, consecutiveErrorLimit: 3 },
    options: {},
    onProbe: () => {},
  };
}

async function collect<T>(iter: AsyncIterable<T[]>): Promise<T[]> {
  const out: T[] = [];
  for await (const batch of iter) out.push(...batch);
  return out;
}

describe('categoryStrategy', () => {
  test('lists categories then fans out per-category listings', async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_categories') return text({ categories: ['github', 'slack'] });
      if (args.category === 'github') return text({ tools: [{ name: 'gh_a' }, { name: 'gh_b' }] });
      if (args.category === 'slack') return text({ tools: [{ name: 'sl_a' }] });
      return text({ tools: [] });
    });
    const out = await collect(categoryStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name).sort()).toEqual(['gh_a', 'gh_b', 'sl_a']);
  });

  test('also accepts categories under tools/items/data keys', async () => {
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'list_categories') return text({ items: [{ name: 'x' }] });
      if (args.category === 'x') return text({ tools: [{ name: 'x_one' }] });
      return text({ tools: [] });
    });
    const out = await collect(categoryStrategy.run(makeCtx(callTool)));
    expect(out.map((t) => t.name)).toEqual(['x_one']);
  });
});
