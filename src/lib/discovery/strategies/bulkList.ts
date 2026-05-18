// src/lib/discovery/strategies/bulkList.ts

import type { DiscoveredTool } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const bulkListStrategy: DiscoveryStrategy = {
  kind: 'bulk_list',
  async *run(ctx) {
    const result = await ctx.callTool(ctx.metaTool.toolName, {});
    const parsed = extractToolDefs(result);
    const discovered: DiscoveredTool[] = parsed.map((p) => ({
      ...p,
      source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
    }));
    ctx.onProbe({
      probe: 'bulk_list',
      callsMade: 1,
      newToolsThisProbe: discovered.length,
      totalToolsSoFar: discovered.length,
    });
    yield discovered;
  },
};
