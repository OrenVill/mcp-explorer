import type { DiscoveredTool, MetaToolBinding } from '../../../types';
import { bulkListStrategy } from './bulkList';
import { paginatedListStrategy } from './paginatedList';
import { searchStrategy } from './search';
import { hybridStrategy } from './hybrid';
import { manifestStrategy } from './manifest';
import type { DiscoveryContext, DiscoveryStrategy } from '../strategy';

const DELEGATE_ORDER = ['bulk_list', 'hybrid_index', 'paginated_list', 'manifest', 'search'] as const;

const DELEGATES: Record<typeof DELEGATE_ORDER[number], DiscoveryStrategy> = {
  bulk_list: bulkListStrategy,
  hybrid_index: hybridStrategy,
  paginated_list: paginatedListStrategy,
  manifest: manifestStrategy,
  search: searchStrategy,
};

export const proxyStrategy: DiscoveryStrategy = {
  kind: 'proxy_invoke',
  async *run(ctx) {
    const proxyMeta = ctx.metaTool;
    const proxyArgKey = proxyMeta.proxyArgKey ?? 'arguments';
    const proxyNameKey = proxyMeta.proxyNameKey ?? 'tool_name';

    const delegateBinding = pickDelegate(ctx.allMetaTools, proxyMeta.toolName);
    if (!delegateBinding) return;
    const delegate = DELEGATES[delegateBinding.kind as typeof DELEGATE_ORDER[number]];
    if (!delegate) return;

    const subCtx: DiscoveryContext = {
      ...ctx,
      metaTool: delegateBinding,
      paired: findPair(ctx.allMetaTools, delegateBinding),
    };
    for await (const batch of delegate.run(subCtx)) {
      const tagged: DiscoveredTool[] = batch.map((d) => ({
        ...d,
        source: { ...d.source, via: proxyMeta.toolName, kind: 'proxy_invoke', proxyArgKey, proxyNameKey },
      }));
      yield tagged;
    }
  },
};

function pickDelegate(all: MetaToolBinding[], excludeName: string): MetaToolBinding | undefined {
  for (const k of DELEGATE_ORDER) {
    const found = all.find((m) => m.kind === k && m.toolName !== excludeName);
    if (found) return found;
  }
  return undefined;
}

function findPair(all: MetaToolBinding[], target: MetaToolBinding): MetaToolBinding | undefined {
  if (!target.pairedWith) return undefined;
  return all.find((m) => m.toolName === target.pairedWith);
}
