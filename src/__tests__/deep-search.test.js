import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to create a mock fetch response
function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 204 ? 'No Content' : status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 404 ? 'Not Found' : status === 429 ? 'Too Many Requests' : 'Internal Server Error',
    json: async () => body,
    headers: new Headers(),
  };
}

let registeredHandlers = {};

// Mock the MCP SDK — Server must be a real class for `new Server(...)` to work
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

vi.mock('@modelcontextprotocol/sdk/types.js', () => {
  return {
    CallToolRequestSchema: { method: 'tools/call' },
    ListToolsRequestSchema: { method: 'tools/list' },
    ListResourcesRequestSchema: { method: 'resources/list' },
    ReadResourceRequestSchema: { method: 'resources/read' },
    ListPromptsRequestSchema: { method: 'prompts/list' },
    GetPromptRequestSchema: { method: 'prompts/get' },
  };
});

// Set environment before importing
process.env.CONTEXTREPO_API_KEY = 'gm_test_key_123';

let callToolHandler;
let listToolsHandler;

// Track fetch calls
let fetchCalls = [];
let fetchMock;

beforeEach(async () => {
  fetchCalls = [];
  registeredHandlers = {};

  // Reset module state by clearing the module cache
  vi.resetModules();

  // Set up fetch mock
  fetchMock = vi.fn();
  global.fetch = fetchMock;

  // Re-import to get fresh module state (fresh currentSessionId)
  await import('../index.js');

  callToolHandler = registeredHandlers['tools/call'];
  listToolsHandler = registeredHandlers['tools/list'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to call a tool
async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

// Helper to set up fetch mock with sequential responses
function setupFetch(...responses) {
  let callIndex = 0;
  fetchMock.mockImplementation(async (url, options) => {
    fetchCalls.push({ url, options });
    if (callIndex < responses.length) {
      const response = responses[callIndex];
      callIndex++;
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }
    return mockFetchResponse(500, { error: { message: 'Unexpected call' } });
  });
}

// =============================================================================
// VAL-SEARCH-001: Tool schema registered
// =============================================================================
describe('deep_search tool schema (VAL-SEARCH-001)', () => {
  it('should be present in TOOLS array with correct name', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch).toBeDefined();
  });

  it('should have query as required string parameter', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.inputSchema.properties.query).toBeDefined();
    expect(pdSearch.inputSchema.properties.query.type).toBe('string');
    expect(pdSearch.inputSchema.required).toContain('query');
  });

  it('should have limit as optional number parameter', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.inputSchema.properties.limit).toBeDefined();
    expect(pdSearch.inputSchema.properties.limit.type).toBe('number');
    // limit should NOT be required
    if (pdSearch.inputSchema.required) {
      expect(pdSearch.inputSchema.required).not.toContain('limit');
    }
  });

  it('should have sessionId as optional string parameter', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.inputSchema.properties.sessionId).toBeDefined();
    expect(pdSearch.inputSchema.properties.sessionId.type).toBe('string');
  });

  it('should have collectionId as optional string parameter', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.inputSchema.properties.collectionId).toBeDefined();
    expect(pdSearch.inputSchema.properties.collectionId.type).toBe('string');
  });

  it('should have documentId as optional string parameter', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.inputSchema.properties.documentId).toBeDefined();
    expect(pdSearch.inputSchema.properties.documentId.type).toBe('string');
  });
});

// =============================================================================
// VAL-SEARCH-006: Tool description is agent-discoverable
// =============================================================================
describe('deep_search tool description (VAL-SEARCH-006)', () => {
  it('should explain what the tool does (vector search)', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.description.toLowerCase()).toMatch(/search/);
  });

  it('should differentiate from find_items', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.description).toMatch(/find_items|hierarchi|chunk|progressive/i);
  });

  it('should reference deep_expand and deep_read', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    expect(pdSearch.description).toMatch(/deep_expand/);
    expect(pdSearch.description).toMatch(/deep_read/);
  });
});

// =============================================================================
// VAL-SEARCH-002: Search request forwarded correctly
// =============================================================================
describe('deep_search request forwarding (VAL-SEARCH-002)', () => {
  it('should call POST /v1/pd/search with query', async () => {
    // Session creation + search
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test query' });

    // Second call is the search (first is session creation)
    const searchCall = fetchCalls[1];
    expect(searchCall.url).toContain('/v1/pd/search');
    expect(searchCall.options.method).toBe('POST');
    const body = JSON.parse(searchCall.options.body);
    expect(body.query).toBe('test query');
  });

  it('should pass collectionId when provided', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test', collectionId: 'col_123' });

    const searchCall = fetchCalls[1];
    const body = JSON.parse(searchCall.options.body);
    expect(body.collectionId).toBe('col_123');
  });

  it('should pass documentId when provided', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test', documentId: 'doc_456' });

    const searchCall = fetchCalls[1];
    const body = JSON.parse(searchCall.options.body);
    expect(body.documentId).toBe('doc_456');
  });
});

// =============================================================================
// VAL-SEARCH-009: Limit parameter passthrough
// =============================================================================
describe('deep_search limit parameter (VAL-SEARCH-009)', () => {
  it('should pass limit to API when provided', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test', limit: 5 });

    const searchCall = fetchCalls[1];
    const body = JSON.parse(searchCall.options.body);
    expect(body.limit).toBe(5);
  });

  it('should omit limit when not provided', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test' });

    const searchCall = fetchCalls[1];
    const body = JSON.parse(searchCall.options.body);
    expect(body.limit).toBeUndefined();
  });
});

// =============================================================================
// VAL-SEARCH-003: Response formatted with hierarchy metadata
// =============================================================================
describe('deep_search response formatting (VAL-SEARCH-003)', () => {
  it('should format response with all hierarchy fields', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_abc123',
              content: 'This is a test chunk with some content that should be shown',
              score: 0.95,
              level: 'section',
              documentTitle: 'Test Document',
              documentId: 'doc_xyz789',
              parentId: 'chunk_parent1',
              siblingIds: { prev: 'chunk_prev1', next: 'chunk_next1' },
            },
          ],
          meta: { query: 'test', totalResults: 1, latencyMs: 42 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'test' });
    const text = result.content[0].text;

    expect(text).toContain('chunk_abc123');
    expect(text).toContain('This is a test chunk');
    expect(text).toMatch(/0\.95/);
    expect(text).toContain('section');
    expect(text).toContain('Test Document');
    expect(text).toContain('doc_xyz789');
    expect(text).toContain('chunk_parent1');
    expect(text).toContain('chunk_prev1');
    expect(text).toContain('chunk_next1');
    expect(text).toMatch(/Total Results/i);
  });

  it('should include summary with totalResults and query', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_1',
              content: 'Result content',
              score: 0.85,
              level: 'paragraph',
              documentTitle: 'Doc Title',
              documentId: 'doc_1',
              parentId: null,
              siblingIds: { prev: null, next: null },
            },
          ],
          meta: { query: 'my search', totalResults: 1 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'my search' });
    const text = result.content[0].text;

    expect(text).toContain('my search');
    expect(text).toMatch(/1/);
  });
});

// =============================================================================
// VAL-SEARCH-008: Response data correctly unwrapped
// =============================================================================
describe('deep_search data unwrapping (VAL-SEARCH-008)', () => {
  it('should access response.data.results and response.data.meta', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_unwrap_test',
              content: 'Unwrap test content',
              score: 0.77,
              level: 'document',
              documentTitle: 'Unwrap Doc',
              documentId: 'doc_unwrap',
              parentId: null,
              siblingIds: { prev: null, next: null },
            },
          ],
          meta: { query: 'unwrap', totalResults: 1 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'unwrap' });
    const text = result.content[0].text;

    // Should show the data from data.results, not raw JSON
    expect(text).toContain('chunk_unwrap_test');
    expect(text).toContain('Unwrap test content');
    expect(text).toContain('Unwrap Doc');
  });
});

// =============================================================================
// VAL-SEARCH-004: Handles empty results
// =============================================================================
describe('deep_search empty results (VAL-SEARCH-004)', () => {
  it('should return friendly message when no results found', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [],
          meta: { query: 'nonexistent', totalResults: 0 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'nonexistent' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/no.*match|no.*result|0 result/i);
  });
});

// =============================================================================
// VAL-SEARCH-005: API errors propagated as tool errors
// =============================================================================
describe('deep_search error propagation (VAL-SEARCH-005)', () => {
  it('should return isError for 401 Unauthorized', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(401, { error: { message: 'Unauthorized' } }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for 403 Forbidden', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(403, { error: { message: 'Forbidden' } }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for 429 Rate Limit', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(429, { error: { message: 'Rate limited' } }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for 500 Server Error', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(500, { error: { message: 'Internal error' } }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for network errors', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      new TypeError('fetch failed'),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });
});

// =============================================================================
// VAL-SEARCH-007: Empty or whitespace query returns error
// =============================================================================
describe('deep_search empty/whitespace query (VAL-SEARCH-007)', () => {
  it('should return isError for empty query string', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(400, { error: { message: 'Query is required' } }),
    );

    const result = await callTool('deep_search', { query: '' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for whitespace-only query', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(400, { error: { message: 'Query is required' } }),
    );

    const result = await callTool('deep_search', { query: '   ' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });
});

// =============================================================================
// VAL-SESSION-001: Auto-creates session on first search
// =============================================================================
describe('deep_search auto-session creation (VAL-SESSION-001)', () => {
  it('should call POST /v1/pd/session first when no sessionId provided', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'auto_sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test' });

    expect(fetchCalls.length).toBe(2);
    // First call: session creation
    expect(fetchCalls[0].url).toContain('/v1/pd/session');
    expect(fetchCalls[0].options.method).toBe('POST');
    // Second call: search with session
    expect(fetchCalls[1].url).toContain('/v1/pd/search');
    const searchBody = JSON.parse(fetchCalls[1].options.body);
    expect(searchBody.sessionId).toBe('auto_sess_1');
  });
});

// =============================================================================
// VAL-SESSION-002: Reuses auto-session for subsequent searches
// =============================================================================
describe('deep_search auto-session reuse (VAL-SESSION-002)', () => {
  it('should reuse session on second call without creating new one', async () => {
    // First call: session creation + search
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'reuse_sess', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, { data: { results: [], meta: { query: 'first', totalResults: 0 } } }),
      // Second call: just search (no session creation)
      mockFetchResponse(200, { data: { results: [], meta: { query: 'second', totalResults: 0 } } }),
    );

    // First search - creates session
    await callTool('deep_search', { query: 'first' });
    expect(fetchCalls.length).toBe(2); // session + search

    // Second search - reuses session
    await callTool('deep_search', { query: 'second' });
    expect(fetchCalls.length).toBe(3); // only one more call (search, no session)

    // Verify second search used the session
    const secondSearchBody = JSON.parse(fetchCalls[2].options.body);
    expect(secondSearchBody.sessionId).toBe('reuse_sess');
  });
});

// =============================================================================
// VAL-SESSION-003: Explicit sessionId overrides auto-session
// =============================================================================
describe('deep_search explicit sessionId override (VAL-SESSION-003)', () => {
  it('should use explicit sessionId and not create auto-session', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { results: [], meta: { query: 'test', totalResults: 0 } } }),
    );

    await callTool('deep_search', { query: 'test', sessionId: 'explicit_sess_99' });

    // Only one call (search), no session creation
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain('/v1/pd/search');
    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.sessionId).toBe('explicit_sess_99');
  });
});

// =============================================================================
// VAL-SESSION-005: Session creation failure does not block search
// =============================================================================
describe('deep_search session creation failure (VAL-SESSION-005)', () => {
  it('should still execute search when session creation fails with 500', async () => {
    setupFetch(
      mockFetchResponse(500, { error: { message: 'Session service down' } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_fallback',
              content: 'Fallback result',
              score: 0.5,
              level: 'paragraph',
              documentTitle: 'Fallback Doc',
              documentId: 'doc_fb',
              parentId: null,
              siblingIds: { prev: null, next: null },
            },
          ],
          meta: { query: 'test', totalResults: 1 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    // Should not be an error - search succeeded
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('chunk_fallback');

    // Should have made 2 calls: failed session + successful search
    expect(fetchCalls.length).toBe(2);
  });

  it('should still execute search when session creation fails with 429', async () => {
    setupFetch(
      mockFetchResponse(429, { error: { message: 'Rate limited' } }),
      mockFetchResponse(200, {
        data: {
          results: [],
          meta: { query: 'test', totalResults: 0 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBeFalsy();
    expect(fetchCalls.length).toBe(2);
  });

  it('should still execute search when session creation has network error', async () => {
    setupFetch(
      new TypeError('fetch failed'),
      mockFetchResponse(200, {
        data: {
          results: [],
          meta: { query: 'test', totalResults: 0 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.isError).toBeFalsy();
    expect(fetchCalls.length).toBe(2);
  });
});

// =============================================================================
// VAL-CROSS-004: MCP response envelope consistency
// =============================================================================
describe('deep_search MCP response envelope (VAL-CROSS-004)', () => {
  it('should return success response with correct envelope shape', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_1',
              content: 'Test',
              score: 0.9,
              level: 'section',
              documentTitle: 'Doc',
              documentId: 'doc_1',
              parentId: null,
              siblingIds: { prev: null, next: null },
            },
          ],
          meta: { query: 'test', totalResults: 1 },
        },
      }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeFalsy();
  });

  it('should return error response with correct envelope shape', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(401, { error: { message: 'Unauthorized' } }),
    );

    const result = await callTool('deep_search', { query: 'test' });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBe(true);
  });
});
