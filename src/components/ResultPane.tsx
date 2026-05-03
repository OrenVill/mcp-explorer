import type { ToolResult } from '../types';
import { CodeBlock } from './CodeBlock';
import { detectLanguage } from '../lib/highlighter';

interface Props {
  result: ToolResult | null;
  error: string | null;
  loading: boolean;
}

export function ResultPane({ result, error, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-amber-400/90 flex items-center gap-2">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Calling tool…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-5">
        <div className="text-[11px] uppercase tracking-wider text-red-400/90 font-semibold mb-2">
          Transport error
        </div>
        <pre className="text-sm text-red-300 whitespace-pre-wrap break-words font-mono">
          {error}
        </pre>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 text-sm text-zinc-500 italic">
        Run the tool to see results here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {result.isError && (
        <div className="text-[11px] px-2.5 py-1 inline-flex items-center gap-1.5 rounded-md bg-red-950/40 text-red-300 border border-red-900/60">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          tool reported error
        </div>
      )}
      {result.content.map((c, i) => {
        const isText = c.type === 'text' && c.text !== undefined;
        const raw = isText ? (c.text as string) : JSON.stringify(c, null, 2);
        const lang = isText ? detectLanguage(raw) : 'json';
        return (
          <div key={i} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
            <div className="px-4 py-1.5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold flex items-center gap-2">
                {c.type}
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-500/80 normal-case tracking-normal">{lang}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(raw).catch(() => {});
                }}
                className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Copy"
              >
                copy
              </button>
            </div>
            <CodeBlock code={raw} lang={lang} />
          </div>
        );
      })}
    </div>
  );
}
