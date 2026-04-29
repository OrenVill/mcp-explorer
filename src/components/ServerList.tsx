import type { ServerEntry, ServerStatus } from '../types';

interface Props {
  servers: ServerEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRemove: (id: string) => void;
  onAddClick: () => void;
}

const STATUS_DOT: Record<ServerStatus, string> = {
  disconnected: 'bg-zinc-600',
  connecting: 'bg-amber-400 animate-pulse',
  connected: 'bg-emerald-500',
  error: 'bg-red-500',
};

const STATUS_LABEL: Record<ServerStatus, string> = {
  disconnected: 'disconnected',
  connecting: 'connecting…',
  connected: 'connected',
  error: 'error',
};

export function ServerList({
  servers,
  selectedId,
  onSelect,
  onConnect,
  onDisconnect,
  onRemove,
  onAddClick,
}: Props) {
  return (
    <aside className="w-80 shrink-0 border-r border-zinc-800 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
          MCP Servers
        </h2>
        <button
          type="button"
          onClick={onAddClick}
          className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
        >
          + Add
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {servers.map((s) => {
          const isSelected = s.id === selectedId;
          return (
            <li
              key={s.id}
              className={[
                'px-4 py-3 border-b border-zinc-900 cursor-pointer',
                isSelected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60',
              ].join(' ')}
              onClick={() => onSelect(s.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[s.status]}`}
                    title={STATUS_LABEL[s.status]}
                  />
                  <span className="font-medium text-zinc-100 truncate">
                    {s.name}
                  </span>
                </div>
                {s.custom && (
                  <button
                    type="button"
                    title="Remove custom server"
                    className="text-zinc-500 hover:text-red-400 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(s.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="text-xs text-zinc-500 truncate mt-0.5">
                {s.url}
              </div>
              {s.description && (
                <div className="text-xs text-zinc-400 mt-1 line-clamp-2">
                  {s.description}
                </div>
              )}
              {s.error && (
                <div className="text-xs text-red-400 mt-1 truncate">
                  {s.error}
                </div>
              )}
              <div className="mt-2 flex gap-1">
                {s.status === 'connected' ? (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect(s.id);
                    }}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={s.status === 'connecting'}
                    className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConnect(s.id);
                    }}
                  >
                    {s.status === 'connecting' ? 'Connecting…' : 'Connect'}
                  </button>
                )}
                {s.status === 'connected' && s.tools && (
                  <span className="text-xs px-2 py-1 text-zinc-400">
                    {s.tools.length} tool{s.tools.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
