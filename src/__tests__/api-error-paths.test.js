import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for TDD-H6 (preserve server error messages on 4xx) and
// TDD-H7 (sanitize 5xx response bodies to prevent stack-trace leak).
// Also locks in the .statusCode contract that TDD-M2 (statusCode-driven
// idempotent-delete) will rely on.

function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText:
      status === 200 ? 'OK'
      : status === 201 ? 'Created'
      : status === 204 ? 'No Content'
      : status === 400 ? 'Bad Request'
      : status === 401 ? 'Unauthorized'
      : status === 403 ? 'Forbidden'
      : status === 404 ? 'Not Found'
      : status === 429 ? 'Too Many Requests'
      : status === 500 ? 'Internal Server Error'
      : status === 502 ? 'Bad Gateway'
      : status === 503 ? 'Service Unavailable'
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
let consoleErrorSpy;

beforeEach(async () => {
  registeredHandlers = {};
  vi.resetModules();
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  // Suppress noisy server boot banner; capture for 5xx assertions
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../index.js');
  callToolHandler = registeredHandlers['tools/call'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

// =============================================================================
// TDD-H6: Server message preservation on 4xx
// =============================================================================
describe('apiRequest — preserves server error message on 401 (TDD-H6)', () => {
  it('appends server-supplied 401 message when present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(401, { error: { message: 'Token expired at 2026-04-24T00:00:00Z' } }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('Authentication failed');
    expect(text).toContain('Token expired');
  });

  it('falls back to generic message when 401 body has no message field', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(401, {}));

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication failed');
    expect(result.content[0].text).toContain('Check your API key');
  });
});

describe('apiRequest — preserves server error message on 403 (TDD-H6)', () => {
  it('appends server-supplied 403 message when present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(403, { error: { message: 'requires write permission for prompts' } }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
    expect(result.content[0].text).toContain('requires write permission');
  });
});

describe('apiRequest — preserves server error message on 404 (TDD-H6)', () => {
  it('appends server-supplied 404 message when present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(404, { error: { message: 'Document not found' } }),
    );

    const result = await callTool('read_prompt', { promptId: 'p1' });

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    // Compatibility: the literal phrase "Resource not found." must remain
    // until idempotent-delete handlers migrate to statusCode-based detection.
    expect(text).toContain('Resource not found');
    expect(text).toContain('Document not found');
  });

  it('preserves /not found/i regex matchability (idempotent-delete contract)', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(404, {}));

    const result = await callTool('read_prompt', { promptId: 'p1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});

describe('apiRequest — preserves server error message on 429 (TDD-H6)', () => {
  it('appends server-supplied retry-after detail when present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(429, { error: { message: 'Try again in 60s' } }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit exceeded');
    expect(result.content[0].text).toContain('Try again in 60s');
  });
});

describe('apiRequest — coalesces multiple body shapes (TDD-H6)', () => {
  it('reads errorData.error.message (canonical structured shape)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(400, { error: { message: 'canonical-shape-msg' } }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('canonical-shape-msg');
  });

  it('reads errorData.message (legacy flat shape)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(400, { message: 'flat-shape-msg' }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('flat-shape-msg');
  });

  it('reads errorData.error when error is a string (alt legacy shape)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(400, { error: 'string-shape-msg' }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('string-shape-msg');
  });

  it('falls back to "API error: <status> <statusText>" when no message field exists', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(418, {}));

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('418');
  });
});

// =============================================================================
// TDD-H7: 5xx body sanitization (defense against B-09 stack-trace leak)
// =============================================================================
describe('apiRequest — sanitizes 5xx response bodies (TDD-H7)', () => {
  it('does not forward stack trace from 500 body to the client', async () => {
    const leakyBody = {
      error: {
        message:
          'Uncaught Error: HTTP 400: ...\n    at async performScrapeForUser (../convex/scraping.ts:291:8)\n    at async <anonymous> (../convex/http.ts:1234:5)',
      },
    };
    fetchMock.mockResolvedValueOnce(mockFetchResponse(500, leakyBody));

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    // Sanitized message present
    expect(text).toContain('Server error');
    expect(text).toContain('500');
    // Leaked detail must NOT appear in client output
    expect(text).not.toContain('performScrapeForUser');
    expect(text).not.toContain('scraping.ts');
    expect(text).not.toContain('http.ts');
    expect(text).not.toMatch(/at async/);
  });

  it('logs the raw 5xx body server-side for operator debugging', async () => {
    const leakyBody = { error: { message: 'internal: SECRET_TOKEN_VALUE leaked here' } };
    fetchMock.mockResolvedValueOnce(mockFetchResponse(500, leakyBody));

    await callTool('search_prompts', {});

    // The console.error spy must have been called with the leaked detail
    // (server-side logging is OK; client-side passthrough is not).
    const allLogs = consoleErrorSpy.mock.calls.flat().join('\n');
    expect(allLogs).toContain('SECRET_TOKEN_VALUE leaked here');
  });

  it('returns sanitized message for 502 Bad Gateway', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(502, { error: { message: 'upstream connection refused at 10.0.0.5:8080' } }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Server error');
    expect(result.content[0].text).toContain('502');
    expect(result.content[0].text).not.toContain('10.0.0.5');
  });

  it('returns sanitized message for 503 Service Unavailable', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(503, { error: { message: 'database connection pool exhausted' } }),
    );

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Server error');
    expect(result.content[0].text).toContain('503');
    expect(result.content[0].text).not.toContain('connection pool');
  });

  it('handles 5xx with no body gracefully', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
      headers: new Headers(),
    });

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Server error');
    expect(result.content[0].text).toContain('500');
  });
});

// =============================================================================
// TDD-H6 / M2 enabling contract: thrown Error carries .statusCode
// =============================================================================
describe('idempotent-delete /not found/i regex contract still matches (TDD-M2 prerequisite)', () => {
  it('delete_prompt returns success no-op on backend 404 with structured body', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(404, { error: { message: 'Prompt not found' } }),
    );

    const result = await callTool('delete_prompt', { promptId: 'p_missing' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('already deleted');
  });

  it('delete_collection returns success no-op on backend 404 with empty body', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(404, {}));

    const result = await callTool('delete_collection', { collectionId: 'c_missing' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('already deleted');
  });

  it('delete_document returns success no-op on backend 404', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(404, { error: { message: 'Document not found' } }),
    );

    const result = await callTool('delete_document', { documentId: 'd_missing' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('already deleted');
  });
});
