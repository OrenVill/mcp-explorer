import { useEffect, useMemo, useState } from 'react';
import { ServerList } from './components/ServerList';
import { ToolList } from './components/ToolList';
import { ToolDetail } from './components/ToolDetail';
import {
  ServerFormDialog,
  type ServerFormValues,
} from './components/ServerFormDialog';
import { connect, disconnect } from './lib/mcpClient';
import { loadServers, saveServers } from './lib/storage';
import type { ServerEntry } from './types';

function loadInitial(): ServerEntry[] {
  const stored = loadServers();
  if (!stored) return [];
  return stored.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    description: s.description,
    custom: true,
    status: 'disconnected' as const,
  }));
}

function makeId(name: string, existing: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'server';
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export default function App() {
  const [servers, setServers] = useState<ServerEntry[]>(() => loadInitial());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const editingServer = useMemo(
    () => (editingId ? servers.find((s) => s.id === editingId) ?? null : null),
    [servers, editingId],
  );

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

  function handleAddClick() {
    setEditingId(null);
    setDialogMode('add');
  }

  function handleEditClick(id: string) {
    setEditingId(id);
    setDialogMode('edit');
  }

  function handleDialogClose() {
    setDialogMode(null);
    setEditingId(null);
  }

  function handleSubmit(values: ServerFormValues) {
    if (dialogMode === 'add') {
      const existingIds = new Set(servers.map((s) => s.id));
      const id = makeId(values.name, existingIds);
      const entry: ServerEntry = {
        id,
        name: values.name,
        url: values.url,
        description: values.description,
        custom: true,
        status: 'disconnected',
      };
      setServers((prev) => [...prev, entry]);
      setSelectedId(id);
      setSelectedToolName(null);
      handleDialogClose();
      void handleConnect(id);
      return;
    }

    if (dialogMode === 'edit' && editingId) {
      const target = servers.find((s) => s.id === editingId);
      if (!target) {
        handleDialogClose();
        return;
      }
      const urlChanged = target.url !== values.url;
      updateServer(editingId, {
        name: values.name,
        url: values.url,
        description: values.description,
      });
      if (urlChanged && target.status === 'connected') {
        void disconnect(editingId).then(() => {
          updateServer(editingId, { status: 'disconnected', tools: undefined });
          void handleConnect(editingId);
        });
      }
      handleDialogClose();
    }
  }

  function dialogValidate(values: ServerFormValues): string | null {
    const id = makeId(values.name, new Set());
    if (dialogMode === 'add') {
      if (servers.some((s) => s.id === id || s.name === values.name)) {
        return `A server named "${values.name}" already exists`;
      }
    } else if (dialogMode === 'edit' && editingId) {
      if (
        servers.some(
          (s) => s.id !== editingId && s.name === values.name,
        )
      ) {
        return `Another server is already named "${values.name}"`;
      }
    }
    return null;
  }

  async function handleRemove(id: string) {
    await disconnect(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedToolName(null);
    }
  }

  const dialogInitial: ServerFormValues | undefined =
    dialogMode === 'edit' && editingServer
      ? {
          name: editingServer.name,
          url: editingServer.url,
          description: editingServer.description,
        }
      : undefined;

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <h1 className="text-zinc-100 font-semibold tracking-wide">
            MCP Explorer
          </h1>
          <span className="text-xs text-zinc-500">connect, list, invoke</span>
        </div>
        <a
          href="https://github.com/OrenVill/mcp-explorer"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          OrenVill/mcp-explorer ↗
        </a>
      </header>
      <div className="flex-1 flex min-h-0">
        <ServerList
          servers={servers}
          selectedId={selectedId}
          onSelect={handleSelect}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          onEdit={handleEditClick}
          onRemove={handleRemove}
          onAddClick={handleAddClick}
        />
        <ToolList
          server={selectedServer}
          selectedToolName={selectedToolName}
          onSelect={setSelectedToolName}
        />
        <ToolDetail server={selectedServer} tool={selectedTool} />
      </div>
      <ServerFormDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'add'}
        initialValues={dialogInitial}
        onClose={handleDialogClose}
        onSubmit={handleSubmit}
        validate={dialogValidate}
      />
    </div>
  );
}
