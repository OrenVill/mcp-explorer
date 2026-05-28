export const STDIO_BRIDGE_PREFIX = '/__mcp_stdio';
const ID_RE = /^[a-zA-Z0-9_-]+$/;

export function isValidServerId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

export function parseStdioPath(urlPath) {
  const clean = urlPath.split('?')[0];
  if (!clean.startsWith(STDIO_BRIDGE_PREFIX + '/')) return null;
  const rest = clean.slice(STDIO_BRIDGE_PREFIX.length + 1);
  const parts = rest.split('/').filter(Boolean);
  if (parts.length === 1) return { serverId: decodeURIComponent(parts[0]), action: 'stop' };
  if (parts.length === 2) {
    const serverId = decodeURIComponent(parts[0]);
    const tail = parts[1];
    if (tail === 'start') return { serverId, action: 'start' };
    if (tail === 'mcp') return { serverId, action: 'mcp' };
  }
  return null;
}

export async function handleStdioBridge(req, res) {
  const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
  const route = parseStdioPath(parsed.pathname);
  if (!route || !isValidServerId(route.serverId)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  res.writeHead(501, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Implemented');
}
