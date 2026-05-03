import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it } from 'vitest';
import { formatConnectionError } from './connectionErrorMessage';

describe('formatConnectionError', () => {
  it('maps 404 to not-found guidance', () => {
    const out = formatConnectionError(
      new StreamableHTTPError(404, 'Not Found'),
    );
    expect(out).toContain('Not found');
    expect(out).toContain('HTTP 404');
  });

  it('maps 502 with ECONNREFUSED to connection refused', () => {
    const out = formatConnectionError(
      new StreamableHTTPError(502, 'Bad Gateway: ECONNREFUSED 127.0.0.1:7'),
    );
    expect(out).toContain('refused');
  });

  it('maps UnauthorizedError to auth guidance', () => {
    const out = formatConnectionError(new UnauthorizedError());
    expect(out).toContain('Authentication');
  });
});
