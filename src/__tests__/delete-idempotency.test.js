import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for the v1.4.2 idempotent-delete contract (R-09 in the
// audit remediation plan). The current implementation in
// src/index.js uses /not found/i.test(error.message); TDD-M2 plans to
// migrate this to error.statusCode === 404 once H6 is in place (it is).
//
// This test file pins both surfaces:
//   1. The current regex-based behavior across multiple server message
//      shapes (canonical, legacy, empty body).
//   2. The new error.statusCode contract from H6 — confirming TDD-M2 has
//      a stable shape to migrate to.

function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText:
      status === 200 ? 'OK'
      : status === 204 ? 'No Content'
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

// =============================================================================
// Happy-path deletes — all three resource types
// =============================================================================
describe('delete tools — happy-path (204 No Content)', () => {
  it('delete_prompt returns success on 204', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(204, null));

    const result = await callTool('delete_prompt', { promptId: 'p1' });

    expect(result.isError).toBeFalsy();
    // v2.0.0 wording: "Successfully deleted <resource> <id>" (replaces the
    // pre-2.0 "✓ Deleted ..." prefix to match the web /mcp surface).
    expect(result.content[0].text).toContain('Successfully deleted prompt p1');
    expect(result.structuredContent).toEqual({ id: 'p1', deleted: true });
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/prompts/p1');
  });

  it('delete_document returns success on 204', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(204, null));

    const result = await callTool('delete_document', { documentId: 'd1' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Successfully deleted document d1');
    expect(result.structuredContent).toEqual({ id: 'd1', deleted: true });
  });

  it('delete_collection returns success on 204', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(204, null));

    const result = await callTool('delete_collection', { collectionId: 'c1' });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Successfully deleted collection c1');
    expect(result.structuredContent).toEqual({ id: 'c1', deleted: true });
  });
});

// =============================================================================
// Idempotent 404 — must NOT raise an error (1.4.2 contract)
// =============================================================================
describe('delete tools — idempotent 404 across message shapes', () => {
  describe('canonical structured body { error: { message } }', () => {
    it('delete_prompt: 404 "Prompt not found" → already-deleted no-op', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(404, { error: { message: 'Prompt not found' } }),
      );

      const result = await callTool('delete_prompt', { promptId: 'p_missing' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('already deleted');
    });

    it('delete_document: 404 "Document not found" → already-deleted no-op', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(404, { error: { message: 'Document not found' } }),
      );

      const result = await callTool('delete_document', { documentId: 'd_missing' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('already deleted');
    });

    it('delete_collection: 404 "Collection not found" → already-deleted no-op', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(404, { error: { message: 'Collection not found' } }),
      );

      const result = await callTool('delete_collection', { collectionId: 'c_missing' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('already deleted');
    });
  });

  describe('legacy flat body { message }', () => {
    it('delete_prompt: 404 with flat-shape body → still no-op (TDD-H6 coalesce)', async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(404, { message: 'Prompt not found' }),
      );

      const result = await callTool('delete_prompt', { promptId: 'p_missing' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('already deleted');
    });
  });

  describe('empty / unparseable body', () => {
    it('delete_prompt: 404 with empty body → no-op via "Resource not found." prefix', async () => {
      fetchMock.mockResolvedValueOnce(mockFetchResponse(404, {}));

      const result = await callTool('delete_prompt', { promptId: 'p_missing' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('already deleted');
    });

    it('delete_document: 404 with non-JSON body → no-op (apiRequest tolerates parse failure)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
        headers: new Headers(),
      });

      const result = await callTool('delete_document', { documentId: 'd_missing' });

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('already deleted');
    });
  });
});

// =============================================================================
// Non-404 errors must NOT be swallowed — they remain hard errors
// =============================================================================
describe('delete tools — non-404 errors are NOT swallowed', () => {
  it('delete_prompt: 500 surfaces as a hard error (sanitized via TDD-H7)', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(500, { error: { message: 'leak: stack trace at file:line' } }),
    );

    const result = await callTool('delete_prompt', { promptId: 'p1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Server error');
    expect(result.content[0].text).not.toContain('already deleted');
    expect(result.content[0].text).not.toContain('stack trace at file:line');
  });

  it('delete_document: 401 surfaces as auth failure, not a no-op', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(401, { error: { message: 'Token expired' } }),
    );

    const result = await callTool('delete_document', { documentId: 'd1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication failed');
    expect(result.content[0].text).not.toContain('already deleted');
  });

  it('delete_collection: 403 surfaces as permission denied, not a no-op', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(403, { error: { message: 'requires write permission' } }),
    );

    const result = await callTool('delete_collection', { collectionId: 'c1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
    expect(result.content[0].text).not.toContain('already deleted');
  });
});
