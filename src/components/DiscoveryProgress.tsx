import type { DiscoveryRun } from '../types';

interface Props {
  run: DiscoveryRun;
}

export function DiscoveryProgress({ run }: Props) {
  if (run.status === 'idle') return null;
  const callsPart = `${run.callsMade} call${run.callsMade === 1 ? '' : 's'}`;
  const toolsPart = `${run.toolsFound} tool${run.toolsFound === 1 ? '' : 's'}`;
  const elapsedPart =
    run.startedAt && run.finishedAt
      ? ` · ${((run.finishedAt - run.startedAt) / 1000).toFixed(1)}s`
      : '';
  return (
    <code className="text-[11px] font-mono text-zinc-500 truncate">
      {callsPart} · {toolsPart}{elapsedPart}
    </code>
  );
}
