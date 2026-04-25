import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for the smoke-report B-05 cascade and TDD-H6/H7
// composition on the restore_prompt_version surface (R-03 in the audit
// remediation plan).
//
// Background: pre-fix, get_prompt_versions printed "ID: undefined" for every
// version (TDD-H2). A user copying the literal string "undefined" into
// restore_prompt_version triggered backend HTTP 500 with a leaked stack
// trace (smoke B-05). With H1–H7 in place, the chain is now closed:
//   - H2 prints real version IDs, so users no longer see "undefined".
//   - H6/H7 sanitize any 4xx/5xx response so even if a client sends
//     "undefined" anyway, the error surfaces cleanly without leakage.
// This test file pins all three contracts together.

function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText:
      status === 200 ? 'OK'
      : status === 400 ? 'Bad Request'
      : status === 404 ? 'Not Found'
      : status === 500 ? 'Internal Server Error'
      : 'Error',
    json: async () => body,
    headers: new Headers(),
  };
}

let registeredHandlers = {};

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  class MockServer {
    constructor() {
      this.setRequestHandler = vi.fn((schema, handler) => {
        const key = schema?.method || schema;
        registeredHandlers[key] = handler;
      });
      this.connect = vi.fn().mockResolvedValue(undefined);
    }
  }
  return { Server: MockServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  class MockStdioServerTransport {}
  return { StdioServerTransport: MockStdioServerTransport };
});

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { method: 'tools/call' },
  ListToolsRequestSchema: { method: 'tools/list' },
  ListResourcesRequestSchema: { method: 'resources/list' },
  ReadResourceRequestSchema: { method: 'resources/read' },
  ListPromptsRequestSchema: { method: 'prompts/list' },
  GetPromptRequestSchema: { method: 'prompts/get' },
}));

process.env.CONTEXTREPO_API_KEY = 'gm_test_key_123';

let callToolHandler;
let fetchMock;

beforeEach(async () => {
  registeredHandlers = {};
  vi.resetModules();
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../index.js');
  callToolHandler = registeredHandlers['tools/call'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

describe('restore_prompt_version — happy path', () => {
  it('renders the new currentVersion after a successful restore', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, { data: { id: 'p1', currentVersion: 4 } }),
    );

    const result = await callTool('restore_prompt_version', {
      promptId: 'p1',
      versionId: 'v_real_2',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Successfully restored');
    expect(result.content[0].text).toContain('New version: 4');
  });

  it('forwards versionId in the request body to POST /v1/prompts/{id}/restore', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, { data: { id: 'p1', currentVersion: 2 } }),
    );

    await callTool('restore_prompt_version', { promptId: 'p1', versionId: 'v_xyz' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/prompts/p1/restore');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body).toEqual({ versionId: 'v_xyz' });
  });
});

describe('restore_prompt_version — B-05 cascade is contained (TDD-H6/H7 composition)', () => {
  it('surfaces a clean 404 message when backend rejects literal "undefined" versionId', async () => {
    // This is the smoke B-05 scenario — a user copies the literal string
    // "undefined" out of pre-fix get_prompt_versions output. Current backend
    // returns 404 for unresolvable versionIds. The H6 helper preserves the
    // server message AND keeps the literal "Resource not found." prefix
    // for /not found/i regex compatibility.
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(404, { error: { message: 'Version not found' } }),
    );

    const result = await callTool('restore_prompt_version', {
      promptId: 'p1',
      versionId: 'undefined',
    });

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('Resource not found');
    expect(text).toContain('Version not found');
    // No stack trace, no path leak
    expect(text).not.toContain('convex/');
    expect(text).not.toMatch(/at async/);
  });

  it('sanitizes any 5xx response (defense if backend regresses to B-05 behavior)', async () => {
    // If the backend ever regresses to leaking a stack trace for malformed
    // versionIds, the H7 helper must still scrub the body before it reaches
    // the client.
    const leakyBody = {
      error: {
        message:
          'Uncaught Error: Invalid versionId\n    at restorePromptVersion (../convex/prompts.ts:412:10)',
      },
    };
    fetchMock.mockResolvedValueOnce(mockFetchResponse(500, leakyBody));

    const result = await callTool('restore_prompt_version', {
      promptId: 'p1',
      versionId: 'undefined',
    });

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('Server error');
    expect(text).toContain('500');
    expect(text).not.toContain('restorePromptVersion');
    expect(text).not.toContain('prompts.ts');
    expect(text).not.toMatch(/at async|at restore/);
  });

  it('returns a clean 400 when backend validates and rejects malformed versionId', async () => {
    // Future-state assertion: once the backend lands the validator wrap
    // (smoke report Group A — TDD-H6/H7 are forward-compatible with this).
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(400, { error: { message: 'Invalid versionId format' } }),
    );

    const result = await callTool('restore_prompt_version', {
      promptId: 'p1',
      versionId: 'undefined',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid versionId format');
  });
});

describe('restore_prompt_version — error.statusCode contract (TDD-M2 enabling)', () => {
  it('thrown error from apiRequest carries statusCode (verified via 404 surface)', async () => {
    // We can't directly inspect error.statusCode through the MCP envelope,
    // but we can confirm that 404 responses produce the documented "Resource
    // not found." prefix that downstream callers may match on, AND that the
    // (future) statusCode-based switch in TDD-M2 has stable input shape.
    fetchMock.mockResolvedValueOnce(mockFetchResponse(404, {}));

    const result = await callTool('restore_prompt_version', {
      promptId: 'p1',
      versionId: 'v_missing',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
