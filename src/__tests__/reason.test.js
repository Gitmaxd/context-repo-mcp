import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helper to create a mock fetch response
function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText:
      status === 200
        ? 'OK'
        : status === 400
          ? 'Bad Request'
          : status === 401
            ? 'Unauthorized'
            : status === 403
              ? 'Forbidden'
              : status === 429
                ? 'Too Many Requests'
                : 'Internal Server Error',
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

process.env.CONTEXTREPO_API_KEY = '***************';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = JSON.parse(
  readFileSync(path.join(__dirname, '_fixtures', 'canonical.json'), 'utf-8'),
).fixtures;

function fixture(tool) {
  const f = FIXTURES.find((x) => x.tool === tool);
  if (!f) throw new Error(`fixture "${tool}" not found`);
  return f;
}

let callToolHandler;
let listToolsHandler;
let fetchCalls = [];
let fetchMock;

beforeEach(async () => {
  fetchCalls = [];
  registeredHandlers = {};
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  fetchMock = vi.fn();
  global.fetch = fetchMock;

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

describe('reason tool schema', () => {
  it('is registered with required query and no model selector', async () => {
    const result = await listToolsHandler({});
    const reason = result.tools.find((t) => t.name === 'reason');

    expect(reason).toBeDefined();
    expect(reason.inputSchema.type).toBe('object');
    expect(reason.inputSchema.required).toEqual(['query']);
    expect('model' in reason.inputSchema.properties).toBe(false);
    expect(reason.description.length).toBeGreaterThan(0);
  });
});

describe('reason tool — formatter byte-identity (canonical fixture)', () => {
  it('renders the happy-path answer + sources + gaps + conflicts', async () => {
    const fx = fixture('reason');
    setupFetch(mockFetchResponse(200, fx.rest.response));

    const result = await callTool('reason', fx.args);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe(fx.expected.text);
    expect(result.structuredContent).toEqual(fx.expected.structuredContent);
  });

  it('renders the empty-gather result with no Sources/Conflicts sections', async () => {
    const fx = fixture('reason_empty');
    setupFetch(mockFetchResponse(200, fx.rest.response));

    const result = await callTool('reason', fx.args);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe(fx.expected.text);
    expect(result.content[0].text).not.toContain('## Sources');
    expect(result.content[0].text).not.toContain('## Conflicts');
  });

  it('omits the Conflicts section when conflicts is empty but sources exist', async () => {
    const response = {
      data: {
        answer: 'Onboarding starts on day one [[chunk_aaa]].',
        citations: [
          {
            chunkId: 'chunk_aaa',
            documentId: 'doc_aaa',
            documentTitle: 'Handbook',
            score: 0.77,
          },
        ],
        gaps: [],
        conflicts: [],
        meta: { chunksGathered: 1, citationsDropped: 0, latencyMs: 12 },
      },
    };
    setupFetch(mockFetchResponse(200, response));

    const result = await callTool('reason', { query: 'When does onboarding start?' });

    expect(result.content[0].text).toContain('## Sources');
    expect(result.content[0].text).not.toContain('## Gaps');
    expect(result.content[0].text).not.toContain('## Conflicts');
  });
});

describe('reason tool — request body', () => {
  it('POSTs to /v1/reason and forwards optional scope fields', async () => {
    setupFetch(mockFetchResponse(200, fixture('reason').rest.response));

    await callTool('reason', {
      query: 'q',
      limit: 5,
      documentId: 'doc_1',
      collectionId: 'col_1',
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/v1/reason');
    expect(fetchCalls[0].options.method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].options.body)).toEqual({
      query: 'q',
      limit: 5,
      documentId: 'doc_1',
      collectionId: 'col_1',
    });
  });

  it('sends only query when no optional fields are provided', async () => {
    setupFetch(mockFetchResponse(200, fixture('reason').rest.response));

    await callTool('reason', { query: 'q' });

    expect(JSON.parse(fetchCalls[0].options.body)).toEqual({ query: 'q' });
  });
});

describe('reason tool — error paths', () => {
  it('returns a friendly isError for 401 Unauthorized', async () => {
    setupFetch(mockFetchResponse(401, { error: { message: 'Invalid API key' } }));

    const result = await callTool('reason', { query: 'q' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Authentication failed');
  });

  it('returns a friendly isError for 403 Forbidden', async () => {
    setupFetch(mockFetchResponse(403, { error: { message: 'documents.read required' } }));

    const result = await callTool('reason', { query: 'q' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Permission denied');
  });

  it('redacts the server body on 5xx', async () => {
    setupFetch(
      mockFetchResponse(500, { error: { message: 'secret stack trace detail' } }),
    );

    const result = await callTool('reason', { query: 'q' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Server error (status 500)');
    expect(result.content[0].text).not.toContain('secret stack trace detail');
  });
});
