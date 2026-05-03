import http from 'node:http';
import https from 'node:https';

export const PROXY_PATH = '/__mcp_proxy';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function filterRequestHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key === 'origin' || key === 'referer') continue;
    if (key === 'accept-encoding') continue;
    out[k] = v;
  }
  return out;
}

function filterResponseHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function handleMcpProxy(req, res) {
  const parsed = new URL(req.url ?? '/', 'http://placeholder.invalid');
  const target = parsed.searchParams.get('target');
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Missing "target" query parameter');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid target URL');
    return;
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Only http and https targets are supported');
    return;
  }

  const lib = targetUrl.protocol === 'https:' ? https : http;
  const upstream = lib.request(
    {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: filterRequestHeaders(req.headers),
    },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, filterResponseHeaders(upRes.headers));
      upRes.pipe(res);
      upRes.on('error', () => res.end());
    },
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(`Bad Gateway: ${err.message}`);
  });

  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
