import type { DiscoveredTool, MetaToolBinding, MetaToolKind, ToolResult } from '../../types';

export interface DiscoveryLimits {
  maxCalls: number;
  maxConcurrency: number;
  maxTools: number;
  totalTimeoutMs: number;
  perCallTimeoutMs: number;
  consecutiveErrorLimit: number;
}

export interface ProbeEvent {
  /** Human-readable probe label, e.g. `query="*"`, `page=2`, `category=github`. */
  probe: string;
  callsMade: number;
  newToolsThisProbe: number;
  totalToolsSoFar: number;
}

export interface DiscoveryContext {
  serverId: string;
  metaTool: MetaToolBinding;
  /** Paired meta-tool, when relevant: hybrid_describe for hybrid_index, category_list for category_index, etc. */
  paired?: MetaToolBinding;
  /** All meta-tools detected on the server — used by strategies that delegate (e.g. proxy_invoke). */
  allMetaTools: MetaToolBinding[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  signal: AbortSignal;
  limits: DiscoveryLimits;
  options: { alphabetSweep?: boolean };
  onProbe: (event: ProbeEvent) => void;
}

export interface DiscoveryStrategy {
  kind: MetaToolKind;
  run(ctx: DiscoveryContext): AsyncIterable<DiscoveredTool[]>;
}
