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

// Sample read API response (full chunk with hierarchy metadata)
function makeMockReadResponse(overrides = {}) {
  return {
    chunkId: 'chunk_abc123',
    content: 'This is the full content of the chunk with all details included.',
    level: 'section',
    hierarchy: {
      documentId: 'doc_xyz789',
      documentTitle: 'Test Document',
      sectionPath: 'Chapter 1 > Section 1.2',
      position: {
        chunkIndex: 3,
        parentChunkId: 'chunk_parent001',
        prevSiblingId: 'chunk_prev001',
        nextSiblingId: 'chunk_next001',
      },
    },
    metadata: {
      wordCount: 42,
      startIndex: 100,
      endIndex: 350,
      headingText: 'Section 1.2: Overview',
    },
    ...overrides,
  };
}

// =============================================================================
// VAL-READ-001: Tool schema registered
// =============================================================================

describe('deep_read tool schema (VAL-READ-001)', () => {
  it('should be present in TOOLS array with correct name', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');
    expect(tool).toBeDefined();
    expect(tool.name).toBe('deep_read');
  });

  it('should have chunkId as required string parameter', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');
    expect(tool.inputSchema.properties.chunkId).toBeDefined();
    expect(tool.inputSchema.properties.chunkId.type).toBe('string');
    expect(tool.inputSchema.required).toContain('chunkId');
  });

  it('should have only chunkId as a parameter', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');
    const propNames = Object.keys(tool.inputSchema.properties);
    expect(propNames).toEqual(['chunkId']);
  });
});

// =============================================================================
// VAL-READ-002: Read request forwarded correctly
// =============================================================================

describe('deep_read request forwarding (VAL-READ-002)', () => {
  it('should call GET /v1/pd/read/<chunkId> with chunkId in URL path', async () => {
    const mockChunk = makeMockReadResponse();
    setupFetch(mockFetchResponse(200, { data: mockChunk }));

    await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/v1/pd/read/chunk_abc123');
    expect(fetchCalls[0].options.method).toBe('GET');
  });

  it('should NOT send chunkId in the request body', async () => {
    const mockChunk = makeMockReadResponse();
    setupFetch(mockFetchResponse(200, { data: mockChunk }));

    await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(fetchCalls[0].options.body).toBeUndefined();
  });

  it('should send chunkId with special characters in URL path', async () => {
    const mockChunk = makeMockReadResponse({ chunkId: 'k17ej3g6cxj2r7gqbz3tpxpjxh7b06ey' });
    setupFetch(mockFetchResponse(200, { data: mockChunk }));

    await callTool('deep_read', { chunkId: 'k17ej3g6cxj2r7gqbz3tpxpjxh7b06ey' });

    expect(fetchCalls[0].url).toContain('/v1/pd/read/k17ej3g6cxj2r7gqbz3tpxpjxh7b06ey');
  });
});

// =============================================================================
// VAL-READ-003: Response includes full hierarchy metadata
// =============================================================================

describe('deep_read response formatting (VAL-READ-003)', () => {
  it('should include chunkId in response', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('chunk_abc123');
  });

  it('should include full content (not truncated)', async () => {
    const longContent = 'A'.repeat(500);
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse({ content: longContent }) }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain(longContent);
  });

  it('should include level', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('section');
  });

  it('should include hierarchy.documentId', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('doc_xyz789');
  });

  it('should include hierarchy.documentTitle', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('Test Document');
  });

  it('should include hierarchy.sectionPath', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('Chapter 1 > Section 1.2');
  });

  it('should include hierarchy.position.chunkIndex', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('3');
  });

  it('should include hierarchy.position.parentChunkId', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('chunk_parent001');
  });

  it('should include hierarchy.position.prevSiblingId', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('chunk_prev001');
  });

  it('should include hierarchy.position.nextSiblingId', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('chunk_next001');
  });

  it('should include metadata.wordCount', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('42');
  });

  it('should include metadata.startIndex', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('100');
  });

  it('should include metadata.endIndex', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('350');
  });

  it('should include metadata.headingText when present', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('Section 1.2: Overview');
  });

  it('should omit headingText when not present', async () => {
    const chunkWithoutHeading = makeMockReadResponse({
      metadata: {
        wordCount: 42,
        startIndex: 100,
        endIndex: 350,
      },
    });
    setupFetch(mockFetchResponse(200, { data: chunkWithoutHeading }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).not.toContain('Heading');
  });

  it('should include navigation hints', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).toContain('deep_expand');
    expect(text).toContain('chunkId');
  });

  it('should omit parentChunkId when null', async () => {
    const chunk = makeMockReadResponse({
      hierarchy: {
        documentId: 'doc_xyz789',
        documentTitle: 'Test Document',
        sectionPath: 'Chapter 1',
        position: {
          chunkIndex: 0,
          parentChunkId: null,
          prevSiblingId: null,
          nextSiblingId: 'chunk_next001',
        },
      },
    });
    setupFetch(mockFetchResponse(200, { data: chunk }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).not.toContain('Parent Chunk');
  });

  it('should omit prevSiblingId when null', async () => {
    const chunk = makeMockReadResponse({
      hierarchy: {
        documentId: 'doc_xyz789',
        documentTitle: 'Test Document',
        sectionPath: 'Chapter 1',
        position: {
          chunkIndex: 0,
          parentChunkId: 'chunk_parent001',
          prevSiblingId: null,
          nextSiblingId: 'chunk_next001',
        },
      },
    });
    setupFetch(mockFetchResponse(200, { data: chunk }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).not.toContain('Prev Sibling');
  });

  it('should omit nextSiblingId when null', async () => {
    const chunk = makeMockReadResponse({
      hierarchy: {
        documentId: 'doc_xyz789',
        documentTitle: 'Test Document',
        sectionPath: 'Chapter 1',
        position: {
          chunkIndex: 0,
          parentChunkId: 'chunk_parent001',
          prevSiblingId: 'chunk_prev001',
          nextSiblingId: null,
        },
      },
    });
    setupFetch(mockFetchResponse(200, { data: chunk }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });
    const text = result.content[0].text;

    expect(text).not.toContain('Next Sibling');
  });
});

// =============================================================================
// VAL-READ-004: Handles chunk not found (404)
// =============================================================================

describe('deep_read chunk not found (VAL-READ-004)', () => {
  it('should return isError when chunk is not found (404)', async () => {
    setupFetch(mockFetchResponse(404, { error: { message: 'Chunk not found' } }));

    const result = await callTool('deep_read', { chunkId: 'nonexistent_chunk' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });
});

// =============================================================================
// VAL-READ-005: Tool description explains deep inspection use case
// =============================================================================

describe('deep_read tool description (VAL-READ-005)', () => {
  it('should explain deep inspection use case', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');
    const desc = tool.description.toLowerCase();

    expect(desc).toContain('chunk');
    expect(desc).toContain('metadata');
  });

  it('should reference deep_search', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');

    expect(tool.description).toContain('deep_search');
  });

  it('should reference deep_expand', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');

    expect(tool.description).toContain('deep_expand');
  });

  it('should explain it returns hierarchy/position metadata', async () => {
    const result = await listToolsHandler();
    const tool = result.tools.find((t) => t.name === 'deep_read');
    const desc = tool.description.toLowerCase();

    expect(desc).toContain('sectionpath');
    expect(desc).toContain('chunkindex');
  });
});

// =============================================================================
// VAL-READ-006: Non-404 API errors propagated
// =============================================================================

describe('deep_read API error propagation (VAL-READ-006)', () => {
  it('should return isError for 401 Unauthorized', async () => {
    setupFetch(mockFetchResponse(401, { error: { message: 'Unauthorized' } }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should return isError for 403 Forbidden', async () => {
    setupFetch(mockFetchResponse(403, { error: { message: 'Forbidden' } }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should return isError for 429 Rate Limit', async () => {
    setupFetch(mockFetchResponse(429, { error: { message: 'Rate limited' } }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should return isError for 500 Server Error', async () => {
    setupFetch(mockFetchResponse(500, { error: { message: 'Internal Server Error' } }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });
});

// =============================================================================
// VAL-READ-007: Malformed chunkId returns error
// =============================================================================

describe('deep_read malformed chunkId (VAL-READ-007)', () => {
  it('should return isError for malformed chunkId (API returns 400)', async () => {
    setupFetch(mockFetchResponse(400, { error: { message: 'Invalid chunk ID format' } }));

    const result = await callTool('deep_read', { chunkId: 'abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should return isError for empty chunkId (API returns 400)', async () => {
    setupFetch(mockFetchResponse(400, { error: { message: 'chunkId is required' } }));

    const result = await callTool('deep_read', { chunkId: '' });

    expect(result.isError).toBe(true);
  });
});

// =============================================================================
// VAL-SESSION-007: deep_read never triggers session creation
// =============================================================================

describe('deep_read session scoping (VAL-SESSION-007)', () => {
  it('should NOT call /v1/pd/session endpoint', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    await callTool('deep_read', { chunkId: 'chunk_abc123' });

    // Only one fetch call — the read request itself, no session creation
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/v1/pd/read/');
    expect(fetchCalls[0].url).not.toContain('/v1/pd/session');
  });

  it('should NOT include sessionId in any request', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    await callTool('deep_read', { chunkId: 'chunk_abc123' });

    // GET request should have no body
    expect(fetchCalls[0].options.body).toBeUndefined();
  });
});

// =============================================================================
// VAL-CROSS-004: MCP response envelope consistency
// =============================================================================

describe('deep_read MCP response envelope (VAL-CROSS-004)', () => {
  it('should return success response with correct envelope shape', async () => {
    setupFetch(mockFetchResponse(200, { data: makeMockReadResponse() }));

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeUndefined();
  });

  it('should return error response with correct envelope shape', async () => {
    setupFetch(mockFetchResponse(404, { error: { message: 'Not found' } }));

    const result = await callTool('deep_read', { chunkId: 'nonexistent' });

    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBe(true);
  });
});

// =============================================================================
// VAL-CROSS-005: Network errors produce tool errors
// =============================================================================

describe('deep_read network error handling (VAL-CROSS-005)', () => {
  it('should return isError for network errors (fetch TypeError)', async () => {
    const networkError = new TypeError('fetch failed');
    setupFetch(networkError);

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should include helpful message for network errors', async () => {
    const networkError = new TypeError('fetch failed');
    setupFetch(networkError);

    const result = await callTool('deep_read', { chunkId: 'chunk_abc123' });

    expect(result.content[0].text.toLowerCase()).toContain('network');
  });
});
