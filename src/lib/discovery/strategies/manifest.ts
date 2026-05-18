// src/lib/discovery/strategies/manifest.ts

import type { DiscoveredTool } from '../../../types';
import { extractToolDefs } from '../parse';
import type { DiscoveryStrategy } from '../strategy';

export const manifestStrategy: DiscoveryStrategy = {
  kind: 'manifest',
  async *run(ctx) {
    const result = await ctx.callTool(ctx.metaTool.toolName, {});
    const parsed = extractToolDefs(result);
    const out: DiscoveredTool[] = parsed.map((p) => ({
      ...p,
      source: { via: ctx.metaTool.toolName, kind: ctx.metaTool.kind },
    }));
    ctx.onProbe({ probe: 'manifest', callsMade: 1, newToolsThisProbe: out.length, totalToolsSoFar: out.length });
    yield out;
  },
};
