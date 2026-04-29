import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (input: { name: string; url: string; description?: string }) => void;
  existingIds: Set<string>;
}

export function AddServerDialog({ open, onClose, onAdd, existingIds }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('http://localhost:3500/mcp');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      new URL(url);
    } catch {
      setError('URL is invalid');
      return;
    }
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (existingIds.has(id)) {
      setError(`A server named "${name}" already exists`);
      return;
    }
    onAdd({ name: name.trim(), url: url.trim(), description: description.trim() || undefined });
    setName('');
    setDescription('');
    setUrl('http://localhost:3500/mcp');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-md p-5 space-y-3"
      >
        <h3 className="text-zinc-100 font-semibold">Add MCP Server</h3>
        <label className="block text-xs text-zinc-400">
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My local server"
            className="mt-1 w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm focus:outline-none focus:border-emerald-500"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          MCP HTTP URL
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3500/mcp"
            className="mt-1 w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm font-mono focus:outline-none focus:border-emerald-500"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Description (optional)
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-100 text-sm focus:outline-none focus:border-emerald-500"
          />
        </label>
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
