import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for TDD-H8 (audit 2026-04-24):
//   apiRequest now bounds every outbound HTTP request via
//   AbortSignal.timeout(30_000). A hung backend must surface as a clear
//   "Request timed out" error rather than blocking the stdio worker.
//
// Strategy: pass a real AbortSignal into a fetch-mock implementation that
// rejects when the signal fires. Drive vitest fake timers past the 30s
// threshold. The handler should emit an isError result whose text mentions
// "timed out" and "30s".

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

describe('apiRequest — request timeout (TDD-H8)', () => {
  it('passes an AbortSignal into every fetch call', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [] }),
      headers: new Headers(),
    });

    await callTool('search_prompts', {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const passedOptions = fetchMock.mock.calls[0][1];
    expect(passedOptions).toBeDefined();
    expect(passedOptions.signal).toBeDefined();
    // Node's AbortSignal exposes .aborted boolean
    expect(passedOptions.signal.aborted).toBe(false);
  });

  it('surfaces a timeout error when the signal aborts', async () => {
    // AbortSignal.timeout() is wired to platform timers that vitest fake
    // timers cannot advance directly. We instead simulate the abort by
    // having fetch immediately reject with an AbortError — exactly the
    // shape AbortSignal.timeout(N) produces when N elapses. This still
    // exercises the classification branch in apiRequest's catch.
    fetchMock.mockImplementationOnce(() => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toMatch(/timed out/i);
    expect(text).toContain('30s');
  });

  it('does NOT classify successful fast responses as timeouts', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: [] }),
      headers: new Headers(),
    });

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBeFalsy();
  });

  it('classifies a TimeoutError name as a timeout (not as a generic error)', async () => {
    fetchMock.mockImplementationOnce(() => {
      const err = new Error('TimeoutError: signal timed out');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    });

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/timed out/i);
  });

  it('still classifies generic network errors via the TypeError branch', async () => {
    fetchMock.mockImplementationOnce(() => {
      return Promise.reject(new TypeError('fetch failed'));
    });

    const result = await callTool('search_prompts', {});

    expect(result.isError).toBe(true);
    // Network classification, not timeout classification
    expect(result.content[0].text).toMatch(/network error/i);
    expect(result.content[0].text).not.toMatch(/timed out/i);
  });
});
