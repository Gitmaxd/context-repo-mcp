import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for TDD-H2 (audit 2026-04-24):
//   get_prompt_versions must render a real version ID per row, never "undefined".
//   Server returns transformed `{data: [{id, version, content, changeLog, userName}]}`
//   (convex/http.ts:1879–1888). Pre-fix code read `v._id`, producing
//   "ID: undefined" on every row and cascading into smoke B-05.

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

describe('get_prompt_versions — version ID rendering (TDD-H2)', () => {
  it('renders a real version ID per row when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          { id: 'v_real_2', version: 2, userName: 'alice', changeLog: 'tweak', content: 'v2' },
          { id: 'v_real_1', version: 1, userName: 'alice', changeLog: 'init', content: 'v1' },
        ],
      })
    );

    const result = await callTool('get_prompt_versions', { promptId: 'p1' });
    const text = result.content[0].text;

    expect(text).toContain('v_real_2');
    expect(text).toContain('v_real_1');
    expect(text).not.toMatch(/\*\*ID:\*\*\s*undefined/);
    expect(text).not.toMatch(/\*\*ID:\*\*\s*null/);
  });

  it('marks the first row as (Latest Snapshot) and renders Version label correctly', async () => {
    // v2.0.0 changed the latest-row marker from "(Current)" to
    // "(Latest Snapshot)" to align with the web /mcp surface (locked by
    // canonical fixture). Older clients matching on the literal string
    // "(Current)" need to migrate to "(Latest Snapshot)".
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ id: 'v_curr', version: 3, userName: 'u', changeLog: 'c', content: 'x' }],
      })
    );

    const result = await callTool('get_prompt_versions', { promptId: 'p1' });
    const text = result.content[0].text;

    expect(text).toContain('Version 3 (Latest Snapshot)');
  });

  it('preserves _id verbatim in structuredContent when server returns legacy raw-row shape', async () => {
    // Markdown formatter now reads `v.id` directly per the canonical
    // contract; structuredContent mirrors the REST response verbatim, so
    // a legacy `_id` field is preserved untouched for callers asserting
    // on it.
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ _id: 'v_legacy', version: 1, userName: 'u', changeLog: 'c', content: 'x' }],
      })
    );

    const result = await callTool('get_prompt_versions', { promptId: 'p1' });

    expect(result.structuredContent.data[0]._id).toBe('v_legacy');
  });

  it('renders id (not _id) in markdown when both are present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ id: 'canonical', _id: 'legacy', version: 1, userName: 'u', changeLog: 'c', content: 'x' }],
      })
    );

    const result = await callTool('get_prompt_versions', { promptId: 'p1' });
    const text = result.content[0].text;

    expect(text).toContain('**ID:** canonical');
    expect(text).not.toMatch(/\*\*ID:\*\*\s*legacy/);
  });

  it('returns the no-history message on empty data array', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

    const result = await callTool('get_prompt_versions', { promptId: 'p1' });

    expect(result.content[0].text).toContain('No version history found');
  });
});
