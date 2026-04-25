import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for TDD-H1 and TDD-H5 (audit 2026-04-24):
//   create_prompt, create_document, create_collection must render a real ID
//   in the success message, never the literal string "undefined".
//
// The shared `getId(obj)` helper now reads `obj.id ?? obj._id`, so all three
// creators are forward-compatible with the canonical {id} shape and
// backwards-compatible with the legacy raw-Convex-doc {_id} shape.

function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 201 ? 'Created' : 'Error',
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
  await import('../index.js');
  callToolHandler = registeredHandlers['tools/call'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

describe('create_prompt — ID rendering (TDD-H1)', () => {
  it('renders the real ID when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, { data: { id: 'kh7canonical001', title: 'Test', currentVersion: 1 } })
    );

    const result = await callTool('create_prompt', {
      title: 'Test',
      description: 'd',
      content: 'c',
      engine: 'gpt-4',
    });
    const text = result.content[0].text;

    expect(text).toContain('kh7canonical001');
    expect(text).not.toMatch(/ID:\s*undefined/);
    expect(text).not.toMatch(/ID:\s*null/);
  });

  it('falls back to _id when server returns legacy raw-doc shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, { data: { _id: 'kh7legacy001', title: 'Test' } })
    );

    const result = await callTool('create_prompt', {
      title: 'Test',
      description: 'd',
      content: 'c',
      engine: 'gpt-4',
    });

    expect(result.content[0].text).toContain('kh7legacy001');
  });

  it('prefers id over _id when both are present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, { data: { id: 'canonical', _id: 'legacy', title: 'T' } })
    );

    const result = await callTool('create_prompt', {
      title: 'T',
      description: 'd',
      content: 'c',
      engine: 'gpt-4',
    });

    expect(result.content[0].text).toContain('canonical');
    expect(result.content[0].text).not.toContain('ID: legacy');
  });
});

describe('create_document — ID rendering (TDD-H5)', () => {
  it('renders the real ID when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, { data: { id: 'doc_canonical_001', title: 'Doc' } })
    );

    const result = await callTool('create_document', { title: 'Doc', content: 'body' });
    const text = result.content[0].text;

    expect(text).toContain('doc_canonical_001');
    expect(text).not.toMatch(/ID:\s*undefined/);
  });

  it('falls back to _id when server returns raw Convex doc (current production behavior)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, {
        data: { _id: 'doc_legacy_001', _creationTime: 1700000000, userId: 'u1', title: 'Doc' },
      })
    );

    const result = await callTool('create_document', { title: 'Doc', content: 'body' });

    expect(result.content[0].text).toContain('doc_legacy_001');
  });
});

describe('create_collection — ID rendering (TDD-H5)', () => {
  it('renders the real ID when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, { data: { id: 'col_canonical_001', name: 'My Collection' } })
    );

    const result = await callTool('create_collection', { name: 'My Collection' });
    const text = result.content[0].text;

    expect(text).toContain('col_canonical_001');
    expect(text).not.toMatch(/ID:\s*undefined/);
  });

  it('falls back to _id when server returns raw Convex doc (current production behavior)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(201, {
        data: { _id: 'col_legacy_001', _creationTime: 1700000000, userId: 'u1', name: 'My Collection' },
      })
    );

    const result = await callTool('create_collection', { name: 'My Collection' });

    expect(result.content[0].text).toContain('col_legacy_001');
  });
});
