import { describe, expect, test, vi } from 'vitest';
import { invokeMaybeDiscovered } from './invoke';
import type { DiscoveredTool, MetaToolBinding, ToolDef, ToolResult } from '../../types';

function text(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('invokeMaybeDiscovered', () => {
  test('routes native tools through callTool directly', async () => {
    const callTool = vi.fn(async () => text({ ok: true }));
    const t: ToolDef = { name: 'native', inputSchema: { type: 'object' } };
    await invokeMaybeDiscovered({ callTool, tool: t, args: { x: 1 }, metaTools: [] });
    expect(callTool).toHaveBeenCalledWith('native', { x: 1 });
  });

  test('routes proxy-discovered tools through the proxy meta-tool', async () => {
    const callTool = vi.fn(async () => text({ ok: true }));
    const t: DiscoveredTool = {
      name: 'gh_create',
      inputSchema: { type: 'object' },
      source: { via: 'invoke_tool', kind: 'proxy_invoke', proxyNameKey: 'tool_name', proxyArgKey: 'arguments' },
    };
    await invokeMaybeDiscovered({ callTool, tool: t, args: { title: 'hi' }, metaTools: [] });
    expect(callTool).toHaveBeenCalledWith('invoke_tool', { tool_name: 'gh_create', arguments: { title: 'hi' } });
  });

  test('search-discovered: tries direct first; on not-found, falls back to proxy', async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const callTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push([name, args]);
      if (name === 'searched') throw new Error('Tool not found');
      return text({ ok: true });
    });
    const t: DiscoveredTool = {
      name: 'searched',
      inputSchema: { type: 'object' },
      source: { via: 'search_tools', kind: 'search' },
    };
    const proxy: MetaToolBinding = {
      toolName: 'invoke_tool',
      kind: 'proxy_invoke',
      confidence: 0.9,
      proxyNameKey: 'tool_name',
      proxyArgKey: 'arguments',
    };
    const out = await invokeMaybeDiscovered({ callTool, tool: t, args: { v: 1 }, metaTools: [proxy] });
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toBe('searched');
    expect(calls[1][0]).toBe('invoke_tool');
    expect(out).toBeDefined();
  });

  test('direct-discovered (bulk_list source) does NOT fall back to proxy on error', async () => {
    const callTool = vi.fn(async () => { throw new Error('Tool not found'); });
    const t: DiscoveredTool = {
      name: 'direct',
      inputSchema: { type: 'object' },
      source: { via: 'list_tools', kind: 'bulk_list' },
    };
    const proxy: MetaToolBinding = {
      toolName: 'invoke_tool',
      kind: 'proxy_invoke',
      confidence: 0.9,
      proxyNameKey: 'tool_name',
      proxyArgKey: 'arguments',
    };
    await expect(
      invokeMaybeDiscovered({ callTool, tool: t, args: {}, metaTools: [proxy] }),
    ).rejects.toThrow('Tool not found');
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
