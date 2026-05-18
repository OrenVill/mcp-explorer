import type { DiscoveryRun, MetaToolBinding } from '../types';
import { DiscoveryProgress } from './DiscoveryProgress';

interface Props {
  meta: MetaToolBinding;
  run: DiscoveryRun;
  onDiscover: (opts?: { alphabetSweep?: boolean }) => void;
  onStop: () => void;
}

const LABEL: Record<MetaToolBinding['kind'], string> = {
  bulk_list: 'discovery tool (list)',
  paginated_list: 'discovery tool (paginated list)',
  search: 'discovery tool (search)',
  hybrid_index: 'discovery tool (list + describe)',
  hybrid_describe: 'tool descriptor',
  category_index: 'discovery tool (categories)',
  category_list: 'category listing tool',
  enable_capability: 'capability enabler',
  proxy_invoke: 'proxy invoker',
  manifest: 'discovery tool (manifest)',
};

export function DiscoveryHeader({ meta, run, onDiscover, onStop }: Props) {
  const tint =
    run.status === 'error' ? 'border-red-900/60 bg-red-950/20' :
    run.status === 'partial' ? 'border-amber-900/60 bg-amber-950/20' :
    'border-zinc-800/80 bg-zinc-900/40';

  return (
    <div className={`rounded-xl border ${tint} px-4 py-3 flex items-center gap-3`}>
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-violet-400 shrink-0" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-xs text-zinc-300">This is a {LABEL[meta.kind]}.</span>
      <div className="flex-1" />
      <DiscoveryProgress run={run} />
      {renderActions(meta, run, onDiscover, onStop)}
    </div>
  );
}

function renderActions(
  meta: MetaToolBinding,
  run: DiscoveryRun,
  onDiscover: Props['onDiscover'],
  onStop: Props['onStop'],
) {
  if (run.status === 'running') {
    return (
      <button
        type="button"
        onClick={onStop}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-900/40 hover:bg-red-900/60 border border-red-900/60 text-red-200"
      >
        Stop
      </button>
    );
  }

  if (run.status === 'partial' && meta.kind === 'search') {
    return (
      <>
        <button
          type="button"
          onClick={() => onDiscover()}
          className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200"
        >
          Re-discover
        </button>
        <button
          type="button"
          onClick={() => onDiscover({ alphabetSweep: true })}
          className="text-xs text-violet-400 hover:text-violet-300 underline-offset-2 hover:underline"
        >
          Try harder
        </button>
      </>
    );
  }

  if (run.status === 'done' || run.status === 'partial' || run.status === 'error') {
    return (
      <button
        type="button"
        onClick={() => onDiscover()}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200"
      >
        {run.status === 'error' ? 'Retry' : 'Re-discover'}
      </button>
    );
  }

  // idle
  if (meta.kind === 'enable_capability') {
    return (
      <span className="text-[11px] text-zinc-500">Fill the form below and submit to enable.</span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onDiscover()}
      className="px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
    >
      Discover all tools
    </button>
  );
}
