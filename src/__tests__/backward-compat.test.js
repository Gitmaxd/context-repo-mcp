import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to create a mock fetch response
function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
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
let fetchCalls = [];
let fetchMock;

beforeEach(async () => {
  fetchCalls = [];
  registeredHandlers = {};

  vi.resetModules();

  fetchMock = vi.fn();
  global.fetch = fetchMock;

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
// The 22 original tools that must remain unchanged
// =============================================================================
const ORIGINAL_TOOL_NAMES = [
  'list_prompts',
  'get_prompt',
  'create_prompt',
  'update_prompt',
  'delete_prompt',
  'get_prompt_versions',
  'restore_prompt_version',
  'list_collections',
  'get_collection',
  'create_collection',
  'update_collection',
  'delete_collection',
  'add_to_collection',
  'remove_from_collection',
  'list_documents',
  'get_document',
  'create_document',
  'update_document',
  'delete_document',
  'get_document_versions',
  'restore_document_version',
  'find_items',
];

const NEW_DEEP_TOOL_NAMES = ['deep_search', 'deep_expand', 'deep_read'];

// =============================================================================
// VAL-COMPAT-001: All existing tools still registered + total count = 25
// =============================================================================
describe('Backward compatibility — tool registration (VAL-COMPAT-001)', () => {
  it('should have exactly 25 tools total (22 original + 3 new PD)', async () => {
    const result = await listToolsHandler();
    expect(result.tools.length).toBe(25);
  });

  it('should contain all 22 original tool names', async () => {
    const result = await listToolsHandler();
    const toolNames = result.tools.map(t => t.name);

    for (const name of ORIGINAL_TOOL_NAMES) {
      expect(toolNames).toContain(name);
    }
  });

  it('should contain all 3 new PD tool names', async () => {
    const result = await listToolsHandler();
    const toolNames = result.tools.map(t => t.name);

    for (const name of NEW_DEEP_TOOL_NAMES) {
      expect(toolNames).toContain(name);
    }
  });

  it('should have no duplicate tool names', async () => {
    const result = await listToolsHandler();
    const toolNames = result.tools.map(t => t.name);
    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });
});

// =============================================================================
// VAL-CROSS-001: chunkIds from search usable by expand and read
// =============================================================================
describe('Cross-tool chunkId flow (VAL-CROSS-001)', () => {
  it('should allow chunkId from deep_search to be passed to deep_expand', async () => {
    // Mock deep_search returning a chunkId
    setupFetch(
      // Session creation
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      // Search results
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_from_search_abc',
              content: 'Test content',
              score: 0.95,
              level: 'section',
              documentTitle: 'Test Doc',
              documentId: 'doc_1',
              parentId: null,
              siblingIds: { prev: null, next: null },
            },
          ],
          meta: { query: 'test', totalResults: 1 },
        },
      }),
    );

    const searchResult = await callTool('deep_search', { query: 'test' });
    const searchText = searchResult.content[0].text;

    // Extract the chunkId from search response
    expect(searchText).toContain('chunk_from_search_abc');

    // Now use that chunkId in deep_expand
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            {
              _id: 'chunk_child_1',
              content: 'Child chunk',
              level: 'paragraph',
              chunkIndex: 0,
              parentChunkId: 'chunk_from_search_abc',
              documentId: 'doc_1',
              documentTitle: 'Test Doc',
            },
          ],
        },
      }),
    );

    const expandResult = await callTool('deep_expand', { chunkId: 'chunk_from_search_abc', direction: 'down' });

    // Should succeed (not an error)
    expect(expandResult.isError).toBeFalsy();
    expect(expandResult.content[0].text).toContain('chunk_child_1');

    // Verify the correct chunkId was sent to the API
    const expandBody = JSON.parse(fetchCalls[fetchCalls.length - 1].options.body);
    expect(expandBody.chunkId).toBe('chunk_from_search_abc');
  });

  it('should allow chunkId from deep_search to be passed to deep_read', async () => {
    // Mock deep_search returning a chunkId
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_read_target',
              content: 'Target content',
              score: 0.85,
              level: 'paragraph',
              documentTitle: 'Read Doc',
              documentId: 'doc_2',
              parentId: 'chunk_parent',
              siblingIds: { prev: null, next: null },
            },
          ],
          meta: { query: 'read test', totalResults: 1 },
        },
      }),
    );

    const searchResult = await callTool('deep_search', { query: 'read test' });
    expect(searchResult.content[0].text).toContain('chunk_read_target');

    // Now use that chunkId in deep_read
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunkId: 'chunk_read_target',
          content: 'Full content of the chunk for detailed reading.',
          level: 'paragraph',
          hierarchy: {
            documentId: 'doc_2',
            documentTitle: 'Read Doc',
            sectionPath: 'Chapter 1',
            position: {
              chunkIndex: 0,
              parentChunkId: 'chunk_parent',
              prevSiblingId: null,
              nextSiblingId: null,
            },
          },
          metadata: {
            wordCount: 10,
            startIndex: 0,
            endIndex: 50,
          },
        },
      }),
    );

    const readResult = await callTool('deep_read', { chunkId: 'chunk_read_target' });

    expect(readResult.isError).toBeFalsy();
    expect(readResult.content[0].text).toContain('chunk_read_target');

    // Verify the correct chunkId was used in the URL
    const readUrl = fetchCalls[fetchCalls.length - 1].url;
    expect(readUrl).toContain('/v1/pd/read/chunk_read_target');
  });
});

// =============================================================================
// VAL-CROSS-002: Tool descriptions form discoverable workflow
// =============================================================================
describe('Discoverable workflow via tool descriptions (VAL-CROSS-002)', () => {
  it('deep_search description references deep_expand and deep_read', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');

    expect(pdSearch.description).toContain('deep_expand');
    expect(pdSearch.description).toContain('deep_read');
  });

  it('deep_expand description references deep_search and deep_read', async () => {
    const result = await listToolsHandler();
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');

    expect(pdExpand.description).toContain('deep_search');
    expect(pdExpand.description).toContain('deep_read');
  });

  it('deep_read description references deep_search and deep_expand', async () => {
    const result = await listToolsHandler();
    const pdRead = result.tools.find(t => t.name === 'deep_read');

    expect(pdRead.description).toContain('deep_search');
    expect(pdRead.description).toContain('deep_expand');
  });

  it('all three PD tools describe a coherent workflow (search → expand → read)', async () => {
    const result = await listToolsHandler();
    const pdSearch = result.tools.find(t => t.name === 'deep_search');
    const pdExpand = result.tools.find(t => t.name === 'deep_expand');
    const pdRead = result.tools.find(t => t.name === 'deep_read');

    // deep_search positions itself as the search entry point for document content
    expect(pdSearch.description.toLowerCase()).toMatch(/search.*document.*content|entry.*point|start/i);

    // deep_expand mentions it's used after deep_search
    expect(pdExpand.description).toContain('deep_search');

    // deep_read mentions it's used after deep_search or deep_expand
    expect(pdRead.description).toContain('deep_search');
    expect(pdRead.description).toContain('deep_expand');
  });
});

// =============================================================================
// VAL-CROSS-003: Consistent chunkId naming across all PD tools
// =============================================================================
describe('Consistent chunkId naming across PD tools (VAL-CROSS-003)', () => {
  it('deep_expand maps _id to chunkId in formatted output', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunks: [
            {
              _id: 'chunk_mapped_id',
              content: 'Mapped content',
              level: 'section',
              chunkIndex: 0,
              parentChunkId: null,
              documentId: 'doc_1',
              documentTitle: 'Test Doc',
            },
          ],
        },
      }),
    );

    const result = await callTool('deep_expand', { chunkId: 'chunk_test', direction: 'down' });
    const text = result.content[0].text;

    // Should use "chunkId" label, not "_id"
    expect(text).toMatch(/chunkId.*chunk_mapped_id/i);
    expect(text).not.toMatch(/\b_id\b/);
  });

  it('deep_search uses chunkId field directly (API returns chunkId)', async () => {
    setupFetch(
      mockFetchResponse(200, { data: { sessionId: 'sess_1', createdAt: Date.now(), expiresAt: Date.now() + 3600000 } }),
      mockFetchResponse(200, {
        data: {
          results: [
            {
              chunkId: 'chunk_search_result',
              content: 'Search content',
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
    const text = result.content[0].text;

    expect(text).toMatch(/chunkId.*chunk_search_result/i);
  });

  it('deep_read uses chunkId field directly (API returns chunkId)', async () => {
    setupFetch(
      mockFetchResponse(200, {
        data: {
          chunkId: 'chunk_read_result',
          content: 'Read content',
          level: 'section',
          hierarchy: {
            documentId: 'doc_1',
            documentTitle: 'Doc',
            sectionPath: 'Section 1',
            position: {
              chunkIndex: 0,
              parentChunkId: null,
              prevSiblingId: null,
              nextSiblingId: null,
            },
          },
          metadata: {
            wordCount: 5,
            startIndex: 0,
            endIndex: 30,
          },
        },
      }),
    );

    const result = await callTool('deep_read', { chunkId: 'chunk_read_result' });
    const text = result.content[0].text;

    expect(text).toMatch(/chunkId.*chunk_read_result/i);
  });
});
