import { useState } from 'react';
import type { CallRecord } from '../lib/history';

interface Props {
  history: CallRecord[];
  onReplay: (args: Record<string, unknown>) => void;
  onClear: () => void;
}

function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function CallHistory({ history, onReplay, onClear }: Props) {
  const [open, setOpen] = useState(true);

  if (history.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-zinc-400 group-hover:text-zinc-300 transition-colors">
          Call History
        </h2>
        <span className="text-[10px] text-zinc-600 font-mono">{history.length}</span>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          className={`w-3 h-3 text-zinc-600 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
          <ul className="divide-y divide-zinc-800/60">
            {history.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => onReplay(record.args)}
                  className="w-full text-left px-4 py-2.5 hover:bg-zinc-800/40 transition-colors flex items-center gap-3"
                  title="Click to replay with these args"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      record.result?.isError ? 'bg-red-400' : record.result ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`}
                  />
                  <span className="font-mono text-xs text-violet-400 truncate flex-shrink-0 max-w-[12rem]">
                    {record.toolName}
                  </span>
                  <span className="text-xs text-zinc-500 truncate flex-1">{record.serverName}</span>
                  {record.durationMs !== undefined && (
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 font-mono">
                      {record.durationMs}ms
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600 flex-shrink-0 min-w-[3.5rem] text-right">
                    {relativeTime(record.timestamp)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2 border-t border-zinc-800/60 flex justify-end">
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] uppercase tracking-wider text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear history
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
