import type { ServerEntry, ToolDef } from '../types';

interface Props {
  server: ServerEntry | null;
  selectedToolName: string | null;
  onSelect: (toolName: string) => void;
}

export function ToolList({ server, selectedToolName, onSelect }: Props) {
  if (!server) {
    return (
      <div className="w-72 shrink-0 border-r border-zinc-800 p-4 text-sm text-zinc-500">
        Select a server to see its tools.
      </div>
    );
  }

  if (server.status !== 'connected') {
    return (
      <div className="w-72 shrink-0 border-r border-zinc-800 p-4 text-sm text-zinc-500">
        Connect to <span className="text-zinc-300">{server.name}</span> to see tools.
      </div>
    );
  }

  const tools = server.tools ?? [];

  return (
    <aside className="w-72 shrink-0 border-r border-zinc-800 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
          Tools <span className="text-zinc-500 font-normal">({tools.length})</span>
        </h2>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {tools.length === 0 && (
          <li className="px-4 py-3 text-sm text-zinc-500">No tools advertised.</li>
        )}
        {tools.map((t: ToolDef) => {
          const isSelected = t.name === selectedToolName;
          const desc = stripEmoji(t.description ?? '').split('\n').filter(Boolean)[0];
          return (
            <li
              key={t.name}
              onClick={() => onSelect(t.name)}
              className={[
                'px-4 py-2 cursor-pointer border-b border-zinc-900',
                isSelected ? 'bg-zinc-900' : 'hover:bg-zinc-900/60',
              ].join(' ')}
            >
              <div className="font-mono text-xs text-zinc-100">{t.name}</div>
              {desc && (
                <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                  {desc}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function stripEmoji(s: string): string {
  return s.replace(/^[^\w(]*\s*/, '');
}
