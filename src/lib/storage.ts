import type { ServerEntry } from '../types';

const KEY = 'mcp-explorer.servers.v1';

type StoredServer = Pick<
  ServerEntry,
  'id' | 'name' | 'url' | 'description' | 'custom'
>;

export function loadServers(): StoredServer[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredServer[];
  } catch {
    return null;
  }
}

export function saveServers(servers: ServerEntry[]): void {
  const stored: StoredServer[] = servers.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    description: s.description,
    custom: s.custom,
  }));
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* quota or disabled — ignore */
  }
}
