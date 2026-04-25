import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for TDD-H3 (audit 2026-04-24):
// search_prompts must populate `id` on every entry, never `undefined`.
// Server returns transformed shape `{id,title,...}` (convex/http.ts:1685–1695).
// Pre-fix code read `p._id`, producing `id: undefined` for every prompt.

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

describe('search_prompts — id field rendering (TDD-H3)', () => {
  it('populates id on every entry when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          { id: 'kh7realid001', title: 'Prompt A', description: 'desc A', engine: 'gpt-4' },
          { id: 'kh7realid002', title: 'Prompt B', description: 'desc B', engine: 'claude-3' },
        ],
      })
    );

    const result = await callTool('search_prompts', {});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('kh7realid001');
    expect(parsed[1].id).toBe('kh7realid002');
    expect(text).not.toMatch(/"id"\s*:\s*null/);
    expect(text).not.toMatch(/"id"\s*:\s*"undefined"/);
  });

  it('falls back to _id when server returns legacy raw-doc shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          { _id: 'kh7legacyid001', title: 'Legacy A', description: 'd', engine: 'gpt-4' },
        ],
      })
    );

    const result = await callTool('search_prompts', {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed[0].id).toBe('kh7legacyid001');
  });

  it('prefers id over _id when both fields are present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          { id: 'canonical', _id: 'legacy', title: 't', description: 'd', engine: 'gpt-4' },
        ],
      })
    );

    const result = await callTool('search_prompts', {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed[0].id).toBe('canonical');
  });

  it('forwards search and limit query params to the backend', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

    await callTool('search_prompts', { search: 'hello', limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('/v1/prompts?');
    expect(url).toContain('q=hello');
    expect(url).toContain('limit=5');
  });

  it('returns an empty array string when no prompts exist (no crash, no undefined)', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

    const result = await callTool('search_prompts', {});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed).toEqual([]);
  });
});
