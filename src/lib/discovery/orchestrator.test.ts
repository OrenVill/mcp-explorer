import { describe, expect, test, vi } from 'vitest';
import { runDiscovery } from './orchestrator';
import type { MetaToolBinding, ToolResult } from '../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('runDiscovery', () => {
  test('picks bulk_list strategy and accumulates tools', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const callTool = vi.fn(async () => text({ tools: [{ name: 'a' }, { name: 'b' }] }));
    const events: string[] = [];
    const out = await runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool,
      onProbe: (e) => events.push(e.probe),
    });
    expect(out.status).toBe('done');
    expect(out.tools.map((t) => t.name)).toEqual(['a', 'b']);
    expect(events).toContain('bulk_list');
  });

  test('reports partial when maxTools cap is hit', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const big = { tools: Array.from({ length: 800 }, (_, i) => ({ name: `t${i}` })) };
    const out = await runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool: async () => text(big),
      onProbe: () => {},
      limits: { maxTools: 100 },
    });
    expect(out.status).toBe('partial');
    expect(out.tools).toHaveLength(100);
  });

  test('marks error when strategy throws', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const out = await runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool: async () => { throw new Error('oops'); },
      onProbe: () => {},
    });
    expect(out.status).toBe('error');
    expect(out.error).toContain('oops');
  });

  test('aborts when signal fires', async () => {
    const meta: MetaToolBinding = { toolName: 'list_tools', kind: 'bulk_list', confidence: 0.9 };
    const controller = new AbortController();
    let resolveCall: (v: ToolResult) => void = () => {};
    const callTool = () => new Promise<ToolResult>((r) => { resolveCall = r; });
    const promise = runDiscovery({
      serverId: 's',
      metaTool: meta,
      allMetaTools: [meta],
      callTool,
      onProbe: () => {},
      signal: controller.signal,
    });
    controller.abort();
    resolveCall(text({ tools: [] }));
    const out = await promise;
    expect(out.status).toBe('partial');
  });
});
