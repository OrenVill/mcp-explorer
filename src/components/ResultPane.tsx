import type { ToolResult } from '../types';

interface Props {
  result: ToolResult | null;
  error: string | null;
  loading: boolean;
}

export function ResultPane({ result, error, loading }: Props) {
  if (loading) {
    return (
      <div className="text-sm text-amber-400 animate-pulse">Calling tool…</div>
    );
  }
  if (error) {
    return (
      <pre className="text-sm text-red-400 whitespace-pre-wrap break-words">
        {error}
      </pre>
    );
  }
  if (!result) {
    return (
      <div className="text-sm text-zinc-500">
        Run the tool to see results here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {result.isError && (
        <div className="text-xs px-2 py-1 inline-block rounded bg-red-900/40 text-red-300 border border-red-800">
          tool reported error
        </div>
      )}
      {result.content.map((c, i) => (
        <div key={i}>
          {c.type === 'text' && c.text !== undefined ? (
            <pre className="text-sm text-zinc-100 whitespace-pre-wrap break-words bg-zinc-950 border border-zinc-800 rounded p-3">
              {c.text}
            </pre>
          ) : (
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words bg-zinc-950 border border-zinc-800 rounded p-3">
              {JSON.stringify(c, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
