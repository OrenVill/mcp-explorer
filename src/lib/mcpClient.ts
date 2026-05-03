import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDef, ToolResult } from '../types';

const clients = new Map<string, Client>();
const transports = new Map<string, StreamableHTTPClientTransport>();

function proxiedUrl(target: string): URL {
  // Always route through the local same-origin proxy so localhost MCP servers
  // without CORS headers (and any cross-origin server) work in the browser.
  const base = window.location.origin;
  return new URL(`/__mcp_proxy?target=${encodeURIComponent(target)}`, base);
}

export async function connect(serverId: string, url: string): Promise<ToolDef[]> {
  await disconnect(serverId);

  const transport = new StreamableHTTPClientTransport(proxiedUrl(url));
  const client = new Client(
    { name: 'mcp-explorer', version: '0.1.0' },
    { capabilities: {} },
  );

  await client.connect(transport);
  clients.set(serverId, client);
  transports.set(serverId, transport);

  const list = await client.listTools();
  return list.tools as unknown as ToolDef[];
}

export async function disconnect(serverId: string): Promise<void> {
  const client = clients.get(serverId);
  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore close errors */
    }
    clients.delete(serverId);
  }
  const transport = transports.get(serverId);
  if (transport) {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    transports.delete(serverId);
  }
}

export async function callTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const client = clients.get(serverId);
  if (!client) {
    throw new Error(`Not connected to server "${serverId}"`);
  }
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as ToolResult;
}

export function isConnected(serverId: string): boolean {
  return clients.has(serverId);
}
