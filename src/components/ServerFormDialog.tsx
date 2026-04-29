import { useEffect, useState } from 'react';

export interface ServerFormValues {
  name: string;
  url: string;
  description?: string;
}

interface Props {
  open: boolean;
  mode: 'add' | 'edit';
  initialValues?: ServerFormValues;
  onClose: () => void;
  onSubmit: (values: ServerFormValues) => void;
  validate?: (values: ServerFormValues) => string | null;
}

const inputClass =
  'mt-1.5 w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm placeholder-zinc-600 focus:outline-none transition-colors';

export function ServerFormDialog({
  open,
  mode,
  initialValues,
  onClose,
  onSubmit,
  validate,
}: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('http://localhost:8000/mcp');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? '');
      setUrl(initialValues?.url ?? 'http://localhost:8000/mcp');
      setDescription(initialValues?.description ?? '');
      setError(null);
    }
  }, [open, initialValues]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const values: ServerFormValues = {
      name: name.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
    };
    if (!values.name) {
      setError('Name is required');
      return;
    }
    try {
      new URL(values.url);
    } catch {
      setError('URL is invalid');
      return;
    }
    const externalError = validate?.(values);
    if (externalError) {
      setError(externalError);
      return;
    }
    onSubmit(values);
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden>
              {mode === 'add' ? (
                <path d="M5 12h14M12 5v14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              ) : (
                <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              )}
            </svg>
          </div>
          <div>
            <h3 className="text-zinc-50 font-semibold tracking-tight">
              {mode === 'add' ? 'Add MCP Server' : 'Edit MCP Server'}
            </h3>
            <p className="text-xs text-zinc-500">
              {mode === 'add'
                ? "We'll connect right after you save."
                : 'Updating the URL while connected will reconnect.'}
            </p>
          </div>
        </div>

        <label className="block text-xs text-zinc-400 font-medium">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My local server"
            className={inputClass}
            autoFocus
          />
        </label>
        <label className="block text-xs text-zinc-400 font-medium">
          MCP HTTP URL
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:8000/mcp"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="block text-xs text-zinc-400 font-medium">
          Description
          <span className="text-zinc-600 font-normal ml-1">(optional)</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <div className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/60">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="text-sm px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-medium shadow-sm shadow-violet-950/50 transition-colors"
          >
            {mode === 'add' ? 'Add & connect' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
