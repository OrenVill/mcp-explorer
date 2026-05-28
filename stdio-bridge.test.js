import { describe, it, expect } from 'vitest';
import { STDIO_BRIDGE_PREFIX, isValidServerId, parseStdioPath } from './stdio-bridge.js';

describe('stdio-bridge routing', () => {
  it('isValidServerId accepts slug ids', () => {
    expect(isValidServerId('fixture-server')).toBe(true);
    expect(isValidServerId('../etc')).toBe(false);
  });

  it('parseStdioPath extracts action', () => {
    expect(parseStdioPath('/__mcp_stdio/my-id/start')).toEqual({
      serverId: 'my-id',
      action: 'start',
    });
    expect(parseStdioPath('/__mcp_stdio/my-id/mcp')).toEqual({
      serverId: 'my-id',
      action: 'mcp',
    });
    expect(parseStdioPath('/__mcp_stdio/my-id')).toEqual({
      serverId: 'my-id',
      action: 'stop',
    });
    expect(parseStdioPath('/__mcp_proxy')).toBeNull();
  });
});
