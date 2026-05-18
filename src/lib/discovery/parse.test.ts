import { describe, expect, test } from 'vitest';
import { extractToolDefs } from './parse';
import type { ToolResult } from '../../types';

function textResult(obj: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

describe('extractToolDefs', () => {
  test('reads structuredContent.tools when present', () => {
    const r = {
      content: [],
      structuredContent: { tools: [{ name: 'foo', description: 'd' }] },
    } as unknown as ToolResult;
    expect(extractToolDefs(r)).toEqual([{ name: 'foo', description: 'd', inputSchema: { type: 'object' } }]);
  });

  test('parses { tools: [...] } from text', () => {
    const r = textResult({ tools: [{ name: 'a' }, { name: 'b' }] });
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['a', 'b']);
  });

  test('parses a top-level array from text', () => {
    const r = textResult([{ name: 'x' }]);
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['x']);
  });

  test('parses { items: [...] }', () => {
    const r = textResult({ items: [{ name: 'i1' }] });
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['i1']);
  });

  test('parses { data: [...] }', () => {
    const r = textResult({ data: [{ name: 'd1' }] });
    expect(extractToolDefs(r).map((t) => t.name)).toEqual(['d1']);
  });

  test('parses OpenAPI paths', () => {
    const r = textResult({
      openapi: '3.0.0',
      paths: {
        '/users': { get: { operationId: 'listUsers', summary: 'List users' } },
        '/users/{id}': { post: { operationId: 'createUser' } },
      },
    });
    const names = extractToolDefs(r).map((t) => t.name).sort();
    expect(names).toEqual(['createUser', 'listUsers']);
  });

  test('returns empty for malformed JSON without throwing', () => {
    const r: ToolResult = { content: [{ type: 'text', text: '{ not json' }] };
    expect(extractToolDefs(r)).toEqual([]);
  });

  test('returns empty for empty content', () => {
    const r: ToolResult = { content: [] };
    expect(extractToolDefs(r)).toEqual([]);
  });

  test('passes inputSchema through when present', () => {
    const schema = { type: 'object', properties: { x: { type: 'string' } } };
    const r = textResult({ tools: [{ name: 'a', inputSchema: schema }] });
    expect(extractToolDefs(r)[0].inputSchema).toEqual(schema);
  });

  test('accepts `parameters` as an alias for inputSchema', () => {
    const schema = { type: 'object', properties: { y: { type: 'number' } } };
    const r = textResult({ tools: [{ name: 'a', parameters: schema }] });
    expect(extractToolDefs(r)[0].inputSchema).toEqual(schema);
  });
});
