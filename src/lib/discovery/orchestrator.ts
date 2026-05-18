import type { DiscoveredTool, DiscoveryRun, DiscoveryStatus, MetaToolBinding, MetaToolKind, ToolResult } from '../../types';
import * as C from './constants';
import { bulkListStrategy } from './strategies/bulkList';
import { categoryStrategy } from './strategies/category';
import { enableCapabilityStrategy } from './strategies/enableCapability';
import { hybridStrategy } from './strategies/hybrid';
import { manifestStrategy } from './strategies/manifest';
import { paginatedListStrategy } from './strategies/paginatedList';
import { proxyStrategy } from './strategies/proxy';
import { searchStrategy } from './strategies/search';
import type { DiscoveryContext, DiscoveryLimits, DiscoveryStrategy, ProbeEvent } from './strategy';

const STRATEGIES: Partial<Record<MetaToolKind, DiscoveryStrategy>> = {
  bulk_list: bulkListStrategy,
  paginated_list: paginatedListStrategy,
  search: searchStrategy,
  hybrid_index: hybridStrategy,
  category_index: categoryStrategy,
  enable_capability: enableCapabilityStrategy,
  manifest: manifestStrategy,
  proxy_invoke: proxyStrategy,
};

export interface RunInput {
  serverId: string;
  metaTool: MetaToolBinding;
  allMetaTools: MetaToolBinding[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  onProbe: (event: ProbeEvent) => void;
  signal?: AbortSignal;
  limits?: Partial<DiscoveryLimits>;
  options?: { alphabetSweep?: boolean };
}

export interface RunOutput {
  status: DiscoveryStatus;
  tools: DiscoveredTool[];
  run: DiscoveryRun;
  error?: string;
}

export async function runDiscovery(input: RunInput): Promise<RunOutput> {
  const startedAt = Date.now();
  const limits: DiscoveryLimits = {
    maxCalls: input.options?.alphabetSweep ? C.MAX_CALLS_WITH_SWEEP : C.MAX_CALLS,
    maxConcurrency: C.MAX_CONCURRENCY,
    maxTools: C.MAX_TOOLS,
    totalTimeoutMs: C.TOTAL_TIMEOUT_MS,
    perCallTimeoutMs: C.PER_CALL_TIMEOUT_MS,
    consecutiveErrorLimit: C.CONSECUTIVE_ERROR_LIMIT,
    ...input.limits,
  };

  const strategy = STRATEGIES[input.metaTool.kind];
  if (!strategy) {
    return finish('error', [], startedAt, 0, 0, 0, `No strategy for kind: ${input.metaTool.kind}`);
  }

  const internalController = new AbortController();
  const timeout = setTimeout(() => internalController.abort(), limits.totalTimeoutMs);
  const externalSignal = input.signal;
  if (externalSignal) {
    if (externalSignal.aborted) internalController.abort();
    else externalSignal.addEventListener('abort', () => internalController.abort(), { once: true });
  }

  const accumulated: DiscoveredTool[] = [];
  const seen = new Set<string>();
  let calls = 0;
  let probes = 0;
  let lastError: string | undefined;
  let hitCap = false;

  const ctx: DiscoveryContext = {
    serverId: input.serverId,
    metaTool: input.metaTool,
    paired: findPair(input.allMetaTools, input.metaTool),
    allMetaTools: input.allMetaTools,
    callTool: input.callTool,
    signal: internalController.signal,
    limits,
    options: input.options ?? {},
    onProbe: (e) => {
      probes++;
      calls = Math.max(calls, e.callsMade);
      input.onProbe(e);
    },
  };

  try {
    for await (const batch of strategy.run(ctx)) {
      if (internalController.signal.aborted) break;
      for (const t of batch) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        accumulated.push(t);
        if (accumulated.length >= limits.maxTools) {
          hitCap = true;
          internalController.abort();
          break;
        }
      }
      if (hitCap) break;
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timeout);
  }

  let status: DiscoveryStatus;
  if (lastError) status = 'error';
  else if (hitCap || internalController.signal.aborted) status = 'partial';
  else status = 'done';

  return finish(status, accumulated, startedAt, probes, calls, accumulated.length, lastError);
}

function finish(
  status: DiscoveryStatus,
  tools: DiscoveredTool[],
  startedAt: number,
  probes: number,
  calls: number,
  toolsFound: number,
  error?: string,
): RunOutput {
  const run: DiscoveryRun = {
    status,
    startedAt,
    finishedAt: Date.now(),
    probesAttempted: probes,
    callsMade: calls,
    toolsFound,
    error,
  };
  return { status, tools, run, error };
}

function findPair(all: MetaToolBinding[], target: MetaToolBinding): MetaToolBinding | undefined {
  if (!target.pairedWith) return undefined;
  return all.find((m) => m.toolName === target.pairedWith);
}
