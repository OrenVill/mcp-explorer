import { describe, expect, test } from 'vitest';
import { detectMetaTools } from './detect';
import type { ToolDef } from '../../types';

function tool(name: string, schema: Record<string, unknown> = { type: 'object' }, description?: string): ToolDef {
  return { name, description, inputSchema: schema as ToolDef['inputSchema'] };
}

describe('detectMetaTools', () => {
  test('detects bulk_list by name', () => {
    const b = detectMetaTools([tool('list_tools')]);
    expect(b).toHaveLength(1);
    expect(b[0].kind).toBe('bulk_list');
    expect(b[0].toolName).toBe('list_tools');
  });

  test('detects search by name + required query', () => {
    const b = detectMetaTools([
      tool('search_tools', { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }),
    ]);
    expect(b[0].kind).toBe('search');
  });

  test('detects proxy_invoke and captures arg/name keys', () => {
    const schema = {
      type: 'object',
      properties: { tool_name: { type: 'string' }, arguments: { type: 'object' } },
      required: ['tool_name', 'arguments'],
    };
    const b = detectMetaTools([tool('invoke_tool', schema)]);
    expect(b[0].kind).toBe('proxy_invoke');
    expect(b[0].toolName).toBe('invoke_tool');
    expect(b[0].proxyNameKey).toBe('tool_name');
    expect(b[0].proxyArgKey).toBe('arguments');
  });

  test('detects manifest', () => {
    const b = detectMetaTools([tool('get_manifest')]);
    expect(b[0].kind).toBe('manifest');
  });

  test('detects category_index', () => {
    const b = detectMetaTools([tool('list_categories')]);
    expect(b[0].kind).toBe('category_index');
  });

  test('detects enable_capability', () => {
    const b = detectMetaTools([tool('enable_capability')]);
    expect(b[0].kind).toBe('enable_capability');
  });

  test('detects hybrid_describe by name', () => {
    const b = detectMetaTools([tool('describe_tool', { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] })]);
    expect(b[0].kind).toBe('hybrid_describe');
  });

  test('description keyword alone is below threshold', () => {
    const b = detectMetaTools([tool(
      'foobar',
      { type: 'object', properties: { thing: { type: 'string' } }, required: ['thing'] },
      'discover all tools',
    )]);
    expect(b).toHaveLength(0);
  });

  test('output-schema bonus tips a borderline tool over the threshold (defaulting to bulk_list)', () => {
    const t = {
      name: 'inventory',
      description: 'discover all tools',
      inputSchema: { type: 'object', properties: { thing: { type: 'string' } }, required: ['thing'] },
      outputSchema: { type: 'array', items: { properties: { name: { type: 'string' }, description: {} } } },
    } as unknown as ToolDef;
    const b = detectMetaTools([t]);
    expect(b).toHaveLength(1);
    expect(b[0].kind).toBe('bulk_list');
  });

  test('pairs hybrid_index with hybrid_describe', () => {
    const list: ToolDef = { name: 'list_tools', inputSchema: { type: 'object' } };
    const describe: ToolDef = { name: 'describe_tool', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } };
    const b = detectMetaTools([list, describe]);
    const idx = b.find((x) => x.toolName === 'list_tools')!;
    const desc = b.find((x) => x.toolName === 'describe_tool')!;
    expect(idx.kind).toBe('hybrid_index');
    expect(idx.pairedWith).toBe('describe_tool');
    expect(desc.pairedWith).toBe('list_tools');
  });

  test('pairs category_index with category_list', () => {
    const cat: ToolDef = { name: 'list_categories', inputSchema: { type: 'object' } };
    const inCat: ToolDef = { name: 'list_tools_in_category', inputSchema: { type: 'object', properties: { category: { type: 'string' } }, required: ['category'] } };
    const b = detectMetaTools([cat, inCat]);
    const catB = b.find((x) => x.toolName === 'list_categories')!;
    const inB = b.find((x) => x.toolName === 'list_tools_in_category')!;
    expect(catB.kind).toBe('category_index');
    expect(catB.pairedWith).toBe('list_tools_in_category');
    expect(inB.kind).toBe('category_list');
    expect(inB.pairedWith).toBe('list_categories');
  });

  test('ignores ordinary tools', () => {
    const b = detectMetaTools([tool('github_create_issue'), tool('post_message')]);
    expect(b).toEqual([]);
  });
});
