import type { DiscoveryRun } from '../types';

interface Props {
  run: DiscoveryRun;
}

export function DiscoveryProgress({ run }: Props) {
  if (run.status === 'idle') return null;
  const elapsed = run.startedAt ? ((run.finishedAt ?? Date.now()) - run.startedAt) / 1000 : 0;
  const summary = `${run.callsMade} call${run.callsMade === 1 ? '' : 's'} · ${run.toolsFound} tool${run.toolsFound === 1 ? '' : 's'} · ${elapsed.toFixed(1)}s`;
  return (
    <code className="text-[11px] font-mono text-zinc-500 truncate">
      {summary}
    </code>
  );
}
