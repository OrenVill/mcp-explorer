import { useEffect, useMemo, useState } from 'react';
import { ServerList } from './components/ServerList';
import { ToolList } from './components/ToolList';
import { ToolDetail } from './components/ToolDetail';
import {
  ServerFormDialog,
  type ServerFormValues,
} from './components/ServerFormDialog';
import { Logo } from './components/Logo';
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
    auth: s.auth,
    custom: true,
    status: 'disconnected' as const,
  }));
}

function makeId(name: string, existing: Set<string>): string {
  const base =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    'server';
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
  /** Bumps when the add/edit modal opens so the form remounts with fresh initial state (no reset-in-effect). */
  const [dialogFormKey, setDialogFormKey] = useState(0);

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
      const tools = await connect(id, s.url, s.auth);
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
    setDialogFormKey((k) => k + 1);
    setEditingId(null);
    setDialogMode('add');
  }

  function handleEditClick(id: string) {
    setDialogFormKey((k) => k + 1);
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
        auth: values.auth,
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
      const authChanged = JSON.stringify(target.auth) !== JSON.stringify(values.auth);
      updateServer(editingId, {
        name: values.name,
        url: values.url,
        description: values.description,
        auth: values.auth,
      });
      if ((urlChanged || authChanged) && target.status === 'connected') {
        void disconnect(editingId).then(() => {
          updateServer(editingId, { status: 'disconnected', tools: undefined });
          void handleConnect(editingId);
        });
      }
      handleDialogClose();
    }
  }

  function dialogValidate(values: ServerFormValues): string | null {
    if (dialogMode === 'add') {
      if (servers.some((s) => s.name === values.name)) {
        return `A server named "${values.name}" already exists`;
      }
    } else if (dialogMode === 'edit' && editingId) {
      if (
        servers.some((s) => s.id !== editingId && s.name === values.name)
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
          auth: editingServer.auth,
        }
      : undefined;

  const connectedCount = servers.filter((s) => s.status === 'connected').length;

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      <header className="border-b border-zinc-800/80 px-5 py-3 flex items-center justify-between bg-zinc-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <Logo size={30} className="shadow-lg shadow-violet-900/30 rounded-[8px]" />
          <div className="flex items-baseline gap-2">
            <h1 className="text-zinc-50 font-semibold tracking-tight">
              MCP Explorer
            </h1>
            <span className="text-xs text-zinc-500 hidden sm:inline">
              connect · list · invoke
            </span>
          </div>
          {servers.length > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
              {connectedCount}/{servers.length} connected
            </span>
          )}
        </div>
        <a
          href="https://github.com/OrenVill/mcp-explorer"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
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
        key={dialogFormKey}
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
