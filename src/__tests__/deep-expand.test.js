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

// Mock the MCP SDK
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

  // Reset module state
  vi.resetModules();

  // Set up fetch mock
  fetchMock = vi.fn();
  global.fetch = fetchMock;

  // Re-import to get fresh module state
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

// Sample expand API response chunk (uses _id per Convex convention).
// M-049 (2026-04-26) — the server emits `parentId` (not `parentChunkId`)
// for both deep_search and deep_expand; only deep_read uses the nested
// `position.parentChunkId` shape. See convex/pdHttp.ts expandedChunkValidator
// and convex/progressiveSearch.ts line 280.
function makeMockChunk(overrides = {}) {
  return {
    _id: 'chunk_abc123',
    content: 'This is chunk content for testing.',
    level: 'section',
    chunkIndex: 0,
    parentId: 'chunk_parent1',
    documentId: 'doc_xyz789',
    documentTitle: 'Test Document',
    ...overrides,
  };
}

// =============================================================================
// VAL-EXPAND-001: Tool schema registered
// =============================================================================
describe('deep_expand tool schema (VAL-EXPAND-001)', () => {
  it('should be present in TOOLS array with correct name', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    expect(pdExpand).toBeDefined();
  });

  it('should have chunkId as required string parameter', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    expect(pdExpand.inputSchema.properties.chunkId).toBeDefined();
    expect(pdExpand.inputSchema.properties.chunkId.type).toBe('string');
    expect(pdExpand.inputSchema.required).toContain('chunkId');
  });

  it('should have direction as required string parameter with enum', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    expect(pdExpand.inputSchema.properties.direction).toBeDefined();
    expect(pdExpand.inputSchema.properties.direction.type).toBe('string');
    expect(pdExpand.inputSchema.properties.direction.enum).toEqual(['up', 'down', 'next', 'previous', 'surrounding']);
    expect(pdExpand.inputSchema.required).toContain('direction');
  });

  it('should have count as optional number parameter', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    expect(pdExpand.inputSchema.properties.count).toBeDefined();
    expect(pdExpand.inputSchema.properties.count.type).toBe('number');
    // count should NOT be required
    if (pdExpand.inputSchema.required) {
      expect(pdExpand.inputSchema.required).not.toContain('count');
    }
  });
});

// =============================================================================
// VAL-EXPAND-006: Tool description explains directions
// =============================================================================
describe('deep_expand tool description (VAL-EXPAND-006)', () => {
  it('should list all 5 directions with explanations', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    const desc = pdExpand.description.toLowerCase();

    expect(desc).toMatch(/up/);
    expect(desc).toMatch(/down/);
    expect(desc).toMatch(/next/);
    expect(desc).toMatch(/previous/);
    expect(desc).toMatch(/surrounding/);
    // Should reference parent, child, sibling concepts
    expect(desc).toMatch(/parent/);
    expect(desc).toMatch(/child/);
    expect(desc).toMatch(/sibling/);
  });

  it('should explain this is used after deep_search', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    expect(pdExpand.description).toMatch(/deep_search/);
  });
});

// =============================================================================
// VAL-EXPAND-002: Expand request forwarded correctly
// =============================================================================
describe('deep_expand request forwarding (VAL-EXPAND-002)', () => {
  it('should call POST /v1/pd/expand with chunkId, direction, and count', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: { chunks: [makeMockChunk()] },
      }),
    );

    await callTool('deep_expand', { chunkId: 'chunk_abc123', direction: 'down', count: 5 });

    expect(fetchCalls.length).toBe(1);
    const call = fetchCalls[0];
    expect(call.url).toContain('/v1/pd/expand');
    expect(call.options.method).toBe('POST');
    const body = JSON.parse(call.options.body);
    expect(body.chunkId).toBe('chunk_abc123');
    expect(body.direction).toBe('down');
    expect(body.count).toBe(5);
  });
});

// =============================================================================
// VAL-EXPAND-003: All five directions handled
// =============================================================================
describe('deep_expand all five directions (VAL-EXPAND-003)', () => {
  const directions = ['up', 'down', 'next', 'previous', 'surrounding'];

  for (const direction of directions) {
    it(`should pass direction "${direction}" to the API`, async () => {
      setupFetch(
        mockFetchResponse(200, {
          data: { chunks: [makeMockChunk()] },
        }),
      );

      await callTool('deep_expand', { chunkId: 'chunk_test', direction });

      const body = JSON.parse(fetchCalls[0].options.body);
      expect(body.direction).toBe(direction);
    });
  }
});

// =============================================================================
// VAL-EXPAND-004: Response formatted with navigation context labels
// =============================================================================
describe('deep_expand response formatting per direction (VAL-EXPAND-004)', () => {
  it('should format "up" response with "Parent chunk" label', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [makeMockChunk({ _id: 'chunk_parent1', level: 'document', chunkIndex: 0 })],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_child1', direction: 'up' });
    const text = result.content[0].text;

    expect(text).toMatch(/parent chunk/i);
    expect(text).toContain('chunk_parent1'); // chunkId mapped from _id
    expect(text).toContain('document');
    expect(text).toContain('Test Document');
    expect(text).toContain('doc_xyz789');
  });

  it('should format "down" response with "Child chunks" label', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            makeMockChunk({ _id: 'chunk_child1', level: 'paragraph', chunkIndex: 0 }),
            makeMockChunk({ _id: 'chunk_child2', level: 'paragraph', chunkIndex: 1 }),
          ],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_parent1', direction: 'down' });
    const text = result.content[0].text;

    expect(text).toMatch(/child chunk/i);
    expect(text).toContain('chunk_child1');
    expect(text).toContain('chunk_child2');
  });

  it('should format "next" response with "Next sibling" label', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [makeMockChunk({ _id: 'chunk_next1', chunkIndex: 2 })],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_current', direction: 'next' });
    const text = result.content[0].text;

    expect(text).toMatch(/next sibling/i);
    expect(text).toContain('chunk_next1');
  });

  it('should format "previous" response with "Previous sibling" label', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [makeMockChunk({ _id: 'chunk_prev1', chunkIndex: 0 })],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_current', direction: 'previous' });
    const text = result.content[0].text;

    expect(text).toMatch(/previous sibling/i);
    expect(text).toContain('chunk_prev1');
  });

  it('should format "surrounding" response with "Surrounding" label', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            makeMockChunk({ _id: 'chunk_before', chunkIndex: 0 }),
            makeMockChunk({ _id: 'chunk_target', chunkIndex: 1 }),
            makeMockChunk({ _id: 'chunk_after', chunkIndex: 2 }),
          ],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_target', direction: 'surrounding' });
    const text = result.content[0].text;

    expect(text).toMatch(/surrounding/i);
    expect(text).toContain('chunk_before');
    expect(text).toContain('chunk_target');
    expect(text).toContain('chunk_after');
  });

  it('should include all expected fields in formatted output', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [makeMockChunk({
            _id: 'chunk_full',
            content: 'Full content for fields test',
            level: 'section',
            chunkIndex: 3,
            parentId: 'chunk_p',
            documentId: 'doc_123',
            documentTitle: 'Fields Test Doc',
          })],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_x', direction: 'down' });
    const text = result.content[0].text;

    expect(text).toContain('chunk_full'); // chunkId mapped from _id
    expect(text).toContain('Full content for fields test');
    expect(text).toContain('section');
    expect(text).toMatch(/3/); // chunkIndex
    expect(text).toContain('chunk_p'); // parentId
    expect(text).toContain('doc_123');
    expect(text).toContain('Fields Test Doc');
  });
});

// =============================================================================
// VAL-EXPAND-011: Response data correctly unwrapped (data.chunks)
// =============================================================================
describe('deep_expand data.chunks unwrapping (VAL-EXPAND-011)', () => {
  it('should correctly access response.data.chunks', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [makeMockChunk({ _id: 'chunk_unwrap', content: 'Unwrap verification content' })],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_test', direction: 'down' });
    const text = result.content[0].text;

    // Should show data from data.chunks, not raw JSON
    expect(text).toContain('chunk_unwrap');
    expect(text).toContain('Unwrap verification content');
  });
});

// =============================================================================
// VAL-CROSS-003: chunkId mapped from _id in expand response
// =============================================================================
describe('deep_expand chunkId mapping from _id (VAL-CROSS-003)', () => {
  it('should map _id to chunkId in formatted output', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [makeMockChunk({ _id: 'j97abcdef123456' })],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_test', direction: 'down' });
    const text = result.content[0].text;

    // chunkId label should appear with the _id value
    expect(text).toMatch(/chunkId.*j97abcdef123456/i);
  });
});

// =============================================================================
// VAL-EXPAND-005: Handles chunk not found (404)
// =============================================================================
describe('deep_expand chunk not found (VAL-EXPAND-005)', () => {
  it('should return isError for 404 with chunk not found message', async () => {
    setupFetch(
      mockFetchResponse(404, { error: { message: 'Chunk not found' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'nonexistent_chunk', direction: 'up' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });
});

// =============================================================================
// VAL-EXPAND-007: Non-404 API errors propagated
// =============================================================================
describe('deep_expand error propagation (VAL-EXPAND-007)', () => {
  it('should return isError for 401 Unauthorized', async () => {
    setupFetch(
      mockFetchResponse(401, { error: { message: 'Unauthorized' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'up' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for 403 Forbidden', async () => {
    setupFetch(
      mockFetchResponse(403, { error: { message: 'Forbidden' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'down' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for 429 Rate Limit', async () => {
    setupFetch(
      mockFetchResponse(429, { error: { message: 'Rate limited' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'next' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for 500 Server Error', async () => {
    setupFetch(
      mockFetchResponse(500, { error: { message: 'Internal error' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'previous' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });

  it('should return isError for network errors (VAL-CROSS-005)', async () => {
    setupFetch(
      new TypeError('fetch failed'),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'up' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });
});

// =============================================================================
// VAL-EXPAND-008: Invalid direction string handled
// =============================================================================
describe('deep_expand invalid direction (VAL-EXPAND-008)', () => {
  it('should return isError for invalid direction "sideways"', async () => {
    setupFetch(
      mockFetchResponse(400, { error: { message: 'Invalid direction. Valid directions: up, down, next, previous, surrounding' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'sideways' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });
});

// =============================================================================
// VAL-EXPAND-009: Malformed chunkId returns error
// =============================================================================
describe('deep_expand malformed chunkId (VAL-EXPAND-009)', () => {
  it('should return isError for malformed chunkId', async () => {
    setupFetch(
      mockFetchResponse(400, { error: { message: 'Invalid chunkId format' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'abc123', direction: 'up' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/error/i);
  });
});

// =============================================================================
// VAL-EXPAND-010: Count parameter passed through for all directions
// =============================================================================
describe('deep_expand count passthrough (VAL-EXPAND-010)', () => {
  it('should pass count through for direction "up"', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [makeMockChunk()] } }),
    );

    await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'up', count: 5 });

    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.count).toBe(5);
  });

  it('should pass count through for direction "down"', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [makeMockChunk()] } }),
    );

    await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'down', count: 3 });

    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.count).toBe(3);
  });

  it('should pass count through for direction "next"', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [makeMockChunk()] } }),
    );

    await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'next', count: 2 });

    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.count).toBe(2);
  });

  it('should pass count through for direction "surrounding"', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [makeMockChunk()] } }),
    );

    await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'surrounding', count: 10 });

    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.count).toBe(10);
  });

  it('should not include count when not provided', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [makeMockChunk()] } }),
    );

    await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'down' });

    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.count).toBeUndefined();
  });
});

// =============================================================================
// VAL-EXPAND-012: Empty results for boundary navigation
// =============================================================================
describe('deep_expand empty results (VAL-EXPAND-012)', () => {
  it('should return friendly message for empty chunks (not error)', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [] } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_last', direction: 'next' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/no.*chunk|no.*found/i);
  });

  it('should return friendly message when expanding "up" on document-level chunk', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [] } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_root', direction: 'up' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/no.*chunk|no.*found/i);
  });
});

// =============================================================================
// MCP response envelope consistency for deep_expand (VAL-CROSS-004)
// =============================================================================
describe('deep_expand MCP response envelope (VAL-CROSS-004)', () => {
  it('should return success response with correct envelope shape', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { chunks: [makeMockChunk()] } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'down' });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeFalsy();
  });

  it('should return error response with correct envelope shape', async () => {
    setupFetch(
      mockFetchResponse(404, { error: { message: 'Not found' } }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_1', direction: 'up' });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBe(true);
  });
});

// =============================================================================
// M-049 / TDD-M1: Parent field name contract (R-08)
//
// The server's /v1/pd/expand endpoint emits each chunk's parent reference as
// `parentId` (matching the documented contract and what deep_search returns
// at line ~1231 of src/index.js). Until M-049 the deep_expand formatter read
// `chunk.parentChunkId` (line ~1341), so the "Parent:" line silently never
// rendered against real server payloads — only mocks that mimicked the wrong
// field shape ever exercised that branch.
//
// These tests pin the CONTRACT: when the server provides a parent reference
// under the documented `parentId` key, the formatted output must include the
// "Parent:" line with that ID; when neither key is present, the line must be
// omitted entirely (no "- **Parent:** undefined" leakage).
//
// Wire-contract source-of-truth references:
//   - convex/pdHttp.ts line 27 (expandedChunkValidator) — emits `parentId`.
//   - convex/progressiveSearch.ts line 280 — deep_search also emits `parentId`.
//   - convex/pdHttp.ts line 254 — deep_read uses `position.parentChunkId`
//     (nested), which is a separate code path and not exercised here.
// =============================================================================
describe('deep_expand parent field contract (M-049 / TDD-M1, R-08)', () => {
  it('should render Parent line from server-emitted parentId (not parentChunkId)', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            {
              _id: 'chunk_target',
              content: 'Target paragraph under section A.',
              level: 'paragraph',
              chunkIndex: 1,
              // Server emits parentId per the wire contract; explicitly
              // exclude parentChunkId to prove the formatter doesn't depend
              // on the legacy/wrong field name.
              parentId: 'chunk_section_a',
              documentId: 'doc_1',
              documentTitle: 'M-049 Doc',
            },
          ],
        },
      }),
    );

    const result = await callTool('deep_expand', {
      chunkId: 'chunk_seed',
      direction: 'next',
    });
    const text = result.content[0].text;

    expect(text).toContain('- **Parent:** chunk_section_a');
    expect(text).not.toContain('undefined');
  });

  it('should render Parent line for "up" direction when parentId is present', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            {
              _id: 'chunk_section_a',
              content: 'Parent section A heading.',
              level: 'section',
              chunkIndex: 0,
              parentId: 'chunk_doc_root',
              documentId: 'doc_1',
              documentTitle: 'M-049 Doc',
            },
          ],
        },
      }),
    );

    const result = await callTool('deep_expand', {
      chunkId: 'chunk_target',
      direction: 'up',
    });
    const text = result.content[0].text;

    expect(text).toContain('- **Parent:** chunk_doc_root');
    expect(text).not.toContain('undefined');
  });

  it('should omit Parent line when neither parentId nor parentChunkId is set', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            {
              _id: 'chunk_root',
              content: 'Top-level / orphan chunk content.',
              level: 'document',
              chunkIndex: 0,
              // Intentionally omit BOTH parent fields — formatter must not
              // emit a "- **Parent:**" line at all (no "undefined" leakage,
              // no empty value).
              documentId: 'doc_1',
              documentTitle: 'M-049 Doc',
            },
          ],
        },
      }),
    );

    const result = await callTool('deep_expand', {
      chunkId: 'chunk_root',
      direction: 'up',
    });
    const text = result.content[0].text;

    expect(text).not.toContain('Parent:');
    expect(text).not.toContain('undefined');
  });
});
