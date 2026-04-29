import { useEffect, useState } from 'react';
import { SchemaForm } from './SchemaForm';
import { ResultPane } from './ResultPane';
import { callTool } from '../lib/mcpClient';
import type { ServerEntry, ToolDef, ToolResult } from '../types';

interface Props {
  server: ServerEntry | null;
  tool: ToolDef | null;
}

export function ToolDetail({ server, tool }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValues({});
    setResult(null);
    setError(null);
  }, [server?.id, tool?.name]);

  if (!server) {
    return (
      <main className="flex-1 p-6 text-zinc-500">
        Select a server from the left.
      </main>
    );
  }
  if (!tool) {
    return (
      <main className="flex-1 p-6 text-zinc-500">
        {server.status === 'connected'
          ? 'Pick a tool to invoke.'
          : `Connect to ${server.name} to start exploring tools.`}
      </main>
    );
  }

  const cleanedArgs = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== ''),
  );

  async function run() {
    if (!tool || !server) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await callTool(server.id, tool.name, cleanedArgs);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const description = (tool.description ?? '').trim();

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            {server.name}
          </div>
          <h1 className="text-xl font-semibold text-zinc-100 font-mono">
            {tool.name}
          </h1>
          {description && (
            <p className="text-sm text-zinc-400 mt-2 whitespace-pre-line">
              {description}
            </p>
          )}
        </header>

        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">Arguments</h2>
          <SchemaForm
            schema={tool.inputSchema}
            values={values}
            onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={loading}
              className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm"
            >
              {loading ? 'Running…' : 'Run tool'}
            </button>
            <span className="text-xs text-zinc-500 font-mono">
              {Object.keys(cleanedArgs).length > 0
                ? JSON.stringify(cleanedArgs)
                : '{}'}
            </span>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-200 mb-3">Result</h2>
          <ResultPane result={result} error={error} loading={loading} />
        </section>
      </div>
    </main>
  );
}
