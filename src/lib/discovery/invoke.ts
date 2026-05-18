import type { DiscoveredTool, MetaToolBinding, ToolDef, ToolResult } from '../../types';

export interface InvokeInput {
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  tool: ToolDef | DiscoveredTool;
  args: Record<string, unknown>;
  metaTools: MetaToolBinding[];
}

const DIRECT_KINDS = new Set([
  'bulk_list', 'paginated_list', 'hybrid_index', 'category_list',
  'manifest', 'enable_capability',
]);

export async function invokeMaybeDiscovered(input: InvokeInput): Promise<ToolResult> {
  const { tool, args, callTool, metaTools } = input;
  const source = (tool as DiscoveredTool).source;

  if (!source) return callTool(tool.name, args);

  if (source.kind === 'proxy_invoke') {
    return callProxy(callTool, tool.name, args, source);
  }

  if (DIRECT_KINDS.has(source.kind)) {
    return callTool(tool.name, args);
  }

  // Search-discovered: direct first, proxy fallback on not-found.
  try {
    return await callTool(tool.name, args);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    const proxy = metaTools.find((m) => m.kind === 'proxy_invoke');
    if (!proxy) throw err;
    return callTool(proxy.toolName, {
      [proxy.proxyNameKey ?? 'tool_name']: tool.name,
      [proxy.proxyArgKey ?? 'arguments']: args,
    });
  }
}

function callProxy(
  callTool: InvokeInput['callTool'],
  innerName: string,
  args: Record<string, unknown>,
  source: NonNullable<DiscoveredTool['source']>,
): Promise<ToolResult> {
  const nameKey = source.proxyNameKey ?? 'tool_name';
  const argKey = source.proxyArgKey ?? 'arguments';
  return callTool(source.via, { [nameKey]: innerName, [argKey]: args });
}

function isNotFound(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /tool not found|unknown tool|no such tool/i.test(m);
}
