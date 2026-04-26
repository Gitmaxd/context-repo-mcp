// =============================================================================
// M-050 — get_collection.includeItems default reconciliation
//
// Pre-M-050 the npm CLI defaulted `includeItems` to FALSE while the
// httpStreamableServer (app/[transport]/route.ts) defaulted it to TRUE,
// so the same `get_collection` call against the same collection returned
// different shapes depending on which client a user was on. This file
// pins the post-M-050 contract for the npm CLI:
//
//   - includeItems omitted   -> 2 fetch calls, response includes `items`
//   - includeItems = true    -> 2 fetch calls, response includes `items`
//   - includeItems = false   -> 1 fetch call,  response excludes `items`
//
// The wire-contract source-of-truth lives at:
//   - app/[transport]/route.ts:739 (`if (args.includeItems !== false)`)
//   - convex/collections.ts (no server-side default; HTTP layer decides)
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
let listToolsHandler;
let fetchCalls = [];
let fetchMock;

beforeEach(async () => {
  fetchCalls = [];
  registeredHandlers = {};
  vi.resetModules();

  fetchMock = vi.fn();
  global.fetch = fetchMock;

  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../index.js');

  callToolHandler = registeredHandlers['tools/call'];
  listToolsHandler = registeredHandlers['tools/list'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

function setupFetch(...responses) {
  let callIndex = 0;
  fetchMock.mockImplementation(async (url, options) => {
    fetchCalls.push({ url, options });
    if (callIndex < responses.length) {
      const response = responses[callIndex];
      callIndex++;
      if (response instanceof Error) throw response;
      return response;
    }
    return mockFetchResponse(500, { error: { message: 'Unexpected call' } });
  });
}

const COLLECTION_PAYLOAD = {
  data: {
    id: 'col_abc123',
    name: 'M-050 Test Collection',
    description: 'A collection used to pin includeItems default behavior.',
    color: '#f97316',
    icon: '📁',
    itemCount: 2,
  },
};

const ITEMS_PAYLOAD = {
  data: [
    { id: 'doc_1', title: 'First doc', itemType: 'document' },
    { id: 'pmt_1', title: 'First prompt', itemType: 'prompt' },
  ],
};

// =============================================================================
// VAL-COLLECTION-DEFAULT-001 — omitted includeItems must include items
// =============================================================================
describe('get_collection.includeItems default = true (M-050)', () => {
  it('fetches items by default when includeItems is omitted', async () => {
    setupFetch(
      mockFetchResponse(200, COLLECTION_PAYLOAD),
      mockFetchResponse(200, ITEMS_PAYLOAD),
    );

    const result = await callTool('get_collection', { collectionId: 'col_abc123' });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toContain('/v1/collections/col_abc123');
    expect(fetchCalls[0].url).not.toContain('/items');
    expect(fetchCalls[1].url).toContain('/v1/collections/col_abc123/items');

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('items');
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].id).toBe('doc_1');
  });

  it('fetches items when includeItems is explicitly true', async () => {
    setupFetch(
      mockFetchResponse(200, COLLECTION_PAYLOAD),
      mockFetchResponse(200, ITEMS_PAYLOAD),
    );

    const result = await callTool('get_collection', {
      collectionId: 'col_abc123',
      includeItems: true,
    });

    expect(fetchCalls.length).toBe(2);

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty('items');
    expect(parsed.items).toHaveLength(2);
  });

  it('omits items and skips the items fetch when includeItems is explicitly false', async () => {
    setupFetch(mockFetchResponse(200, COLLECTION_PAYLOAD));

    const result = await callTool('get_collection', {
      collectionId: 'col_abc123',
      includeItems: false,
    });

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain('/v1/collections/col_abc123');
    expect(fetchCalls[0].url).not.toContain('/items');

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed).not.toHaveProperty('items');
    expect(parsed.id).toBe('col_abc123');
    expect(parsed.itemCount).toBe(2);
  });
});

// =============================================================================
// VAL-COLLECTION-DEFAULT-002 — tools/list advertises the new default
// =============================================================================
describe('get_collection tool description advertises default = true (M-050)', () => {
  it('describes includeItems as defaulting to true in the tool schema', async () => {
    const result = await listToolsHandler({});
    const getCollection = result.tools.find((t) => t.name === 'get_collection');

    expect(getCollection).toBeDefined();
    expect(getCollection.inputSchema.properties.includeItems.description).toContain('default: true');
    expect(getCollection.inputSchema.properties.includeItems.description).not.toContain('default: false');
  });
});

// =============================================================================
// VAL-COLLECTION-DEFAULT-003 — top-level description mentions the default
// =============================================================================
describe('get_collection top-level description (M-050)', () => {
  it('mentions that items are returned by default', async () => {
    const result = await listToolsHandler({});
    const getCollection = result.tools.find((t) => t.name === 'get_collection');

    expect(getCollection.description.toLowerCase()).toContain('by default');
    expect(getCollection.description).toContain('Set includeItems to false');
  });
});
