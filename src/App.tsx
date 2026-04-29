import { useEffect, useMemo, useState } from 'react';
import { ServerList } from './components/ServerList';
import { ToolList } from './components/ToolList';
import { ToolDetail } from './components/ToolDetail';
import { AddServerDialog } from './components/AddServerDialog';
import { buildDefaultServers } from './lib/defaultServers';
import { connect, disconnect } from './lib/mcpClient';
import { loadServers, saveServers } from './lib/storage';
import type { ServerEntry } from './types';

function mergeWithStored(): ServerEntry[] {
  const defaults = buildDefaultServers();
  const stored = loadServers();
  if (!stored) return defaults;
  const byId = new Map<string, ServerEntry>();
  for (const d of defaults) byId.set(d.id, d);
  for (const s of stored) {
    const existing = byId.get(s.id);
    if (existing) {
      byId.set(s.id, {
        ...existing,
        name: s.name,
        url: s.url,
        description: s.description,
      });
    } else if (s.custom) {
      byId.set(s.id, {
        id: s.id,
        name: s.name,
        url: s.url,
        description: s.description,
        custom: true,
        status: 'disconnected',
      });
    }
  }
  return Array.from(byId.values());
}

export default function App() {
  const [servers, setServers] = useState<ServerEntry[]>(() => mergeWithStored());
  const [selectedId, setSelectedId] = useState<string | null>(
    servers[0]?.id ?? null,
  );
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    saveServers(servers);
  }, [servers]);

  const selectedServer = useMemo(
    () => servers.find((s) => s.id === selectedId) ?? null,
    [servers, selectedId],
  );

  const selectedTool = useMemo(() => {
    if (!selectedServer || !selectedToolName) return null;
    return selectedServer.tools?.find((t) => t.name === selectedToolName) ?? null;
  }, [selectedServer, selectedToolName]);

  function updateServer(id: string, patch: Partial<ServerEntry>) {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleConnect(id: string) {
    const s = servers.find((x) => x.id === id);
    if (!s) return;
    updateServer(id, { status: 'connecting', error: undefined });
    try {
      const tools = await connect(id, s.url);
      updateServer(id, { status: 'connected', tools, error: undefined });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      updateServer(id, { status: 'error', error: msg });
    }
  }

  async function handleDisconnect(id: string) {
    await disconnect(id);
    updateServer(id, { status: 'disconnected', tools: undefined });
    if (selectedId === id) setSelectedToolName(null);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setSelectedToolName(null);
  }

  function handleAdd(input: { name: string; url: string; description?: string }) {
    const id = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const entry: ServerEntry = {
      id,
      name: input.name,
      url: input.url,
      description: input.description,
      custom: true,
      status: 'disconnected',
    };
    setServers((prev) => [...prev, entry]);
    setSelectedId(id);
  }

  async function handleRemove(id: string) {
    await disconnect(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedToolName(null);
    }
  }

  const existingIds = new Set(servers.map((s) => s.id));

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <h1 className="text-zinc-100 font-semibold tracking-wide">
            MCP Explorer
          </h1>
          <span className="text-xs text-zinc-500">
            connect, list, invoke
          </span>
        </div>
        <a
          href="https://github.com/OrenVill/awesome-mcp-servers"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          awesome-mcp-servers ↗
        </a>
      </header>
      <div className="flex-1 flex min-h-0">
        <ServerList
          servers={servers}
          selectedId={selectedId}
          onSelect={handleSelect}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onRemove={handleRemove}
          onAddClick={() => setAddOpen(true)}
        />
        <ToolList
          server={selectedServer}
          selectedToolName={selectedToolName}
          onSelect={setSelectedToolName}
        />
        <ToolDetail server={selectedServer} tool={selectedTool} />
      </div>
      <AddServerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
        existingIds={existingIds}
      />
    </div>
  );
}
