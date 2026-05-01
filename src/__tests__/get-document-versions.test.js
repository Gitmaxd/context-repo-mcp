import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for F-1 (audit 2026-04-26 mcp-pre-launch-findings):
//   get_document_versions must render a real version ID per row, never "undefined".
//   Server returns transformed `{data: [{id, version, content, changeLog, userName}]}`
//   (convex/http.ts documents-versions handler). Pre-fix code at src/index.js:1086
//   read `v._id`, producing "ID: undefined" on every row in the npm CLI surface.
//   Mirrors the get-prompt-versions TDD-H2 test pattern (1.5.0 fix).

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

describe('get_document_versions — version ID rendering (F-1)', () => {
  it('renders a real version ID per row when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          { id: 'dv_real_2', version: 2, title: 'doc', userName: 'alice', changeLog: 'tweak', content: 'v2' },
          { id: 'dv_real_1', version: 1, title: 'doc', userName: 'alice', changeLog: 'init', content: 'v1' },
        ],
      })
    );

    const result = await callTool('get_document_versions', { documentId: 'd1' });
    const text = result.content[0].text;

    expect(text).toContain('dv_real_2');
    expect(text).toContain('dv_real_1');
    expect(text).not.toMatch(/\*\*ID:\*\*\s*undefined/);
    expect(text).not.toMatch(/\*\*ID:\*\*\s*null/);
  });

  it('marks the first row as (Latest Snapshot) and renders Version label correctly', async () => {
    // v2.0.0 changed the latest-row marker from "(Current)" to
    // "(Latest Snapshot)" to align with the web /mcp surface (locked by
    // canonical fixture).
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ id: 'dv_curr', version: 3, title: 'doc', userName: 'u', changeLog: 'c', content: 'x' }],
      })
    );

    const result = await callTool('get_document_versions', { documentId: 'd1' });
    const text = result.content[0].text;

    expect(text).toContain('Version 3 (Latest Snapshot)');
  });

  it('preserves _id verbatim in structuredContent when server returns legacy raw-row shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ _id: 'dv_legacy', version: 1, title: 'doc', userName: 'u', changeLog: 'c', content: 'x' }],
      })
    );

    const result = await callTool('get_document_versions', { documentId: 'd1' });

    expect(result.structuredContent.data[0]._id).toBe('dv_legacy');
  });

  it('renders id (not _id) in markdown when both are present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ id: 'canonical', _id: 'legacy', version: 1, title: 'doc', userName: 'u', changeLog: 'c', content: 'x' }],
      })
    );

    const result = await callTool('get_document_versions', { documentId: 'd1' });
    const text = result.content[0].text;

    expect(text).toContain('**ID:** canonical');
    expect(text).not.toMatch(/\*\*ID:\*\*\s*legacy/);
  });

  it('returns the no-history message on empty data array', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

    const result = await callTool('get_document_versions', { documentId: 'd1' });

    expect(result.content[0].text).toContain('No version history found');
  });
});
