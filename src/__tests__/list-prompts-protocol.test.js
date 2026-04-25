import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression test for TDD-H4 (audit 2026-04-24, NEW BUG):
//   The MCP `prompts/list` protocol handler emits one entry per stored prompt
//   with `name: <prompt-id>`. Pre-fix code read `p._id`, but the server returns
//   the transformed `{id, ...}` shape, so every entry got `name: undefined`,
//   making protocol-level prompt enumeration unusable.

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

let listPromptsHandler;
let fetchMock;

beforeEach(async () => {
  registeredHandlers = {};
  vi.resetModules();
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  await import('../index.js');
  listPromptsHandler = registeredHandlers['prompts/list'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prompts/list MCP protocol handler — name field rendering (TDD-H4)', () => {
  it('emits non-undefined name for every prompt when server returns canonical {id} shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [
          { id: 'kh7p1', title: 'P1', description: 'd1' },
          { id: 'kh7p2', title: 'P2', description: 'd2' },
        ],
      })
    );

    const result = await listPromptsHandler({});

    expect(result.prompts).toHaveLength(2);
    expect(result.prompts[0].name).toBe('kh7p1');
    expect(result.prompts[1].name).toBe('kh7p2');
    for (const entry of result.prompts) {
      expect(entry.name).toBeDefined();
      expect(entry.name).not.toBeNull();
      expect(entry.name).not.toBe('undefined');
    }
  });

  it('falls back to _id when server returns legacy raw-doc shape', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ _id: 'kh7legacy', title: 'Legacy', description: 'd' }],
      })
    );

    const result = await listPromptsHandler({});

    expect(result.prompts[0].name).toBe('kh7legacy');
  });

  it('prefers id over _id when both fields are present', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ id: 'canonical', _id: 'legacy', title: 'T', description: 'd' }],
      })
    );

    const result = await listPromptsHandler({});

    expect(result.prompts[0].name).toBe('canonical');
  });

  it('formats the description as "title — description"', async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: [{ id: 'p1', title: 'My Title', description: 'My Description' }],
      })
    );

    const result = await listPromptsHandler({});

    expect(result.prompts[0].description).toBe('My Title — My Description');
  });

  it('returns an empty prompts array when the user has no prompts', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

    const result = await listPromptsHandler({});

    expect(result.prompts).toEqual([]);
  });

  it('hits the documented backend route /v1/prompts?limit=100', async () => {
    fetchMock.mockResolvedValueOnce(mockFetchResponse(200, { data: [] }));

    await listPromptsHandler({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/prompts?limit=100');
  });
});
