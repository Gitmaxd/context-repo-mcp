import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression suite for v2.0.3:
//   create_document must accept `tags` in every shape coerceArray() promises
//   to heal (native array, JSON-encoded array, JSON-encoded empty, bare
//   string, undefined) without throwing, and must render byte-identical
//   output to v2.0.2 for well-behaved clients that send a native array.
//
// Pins BOTH the REST request body AND the formatter's Tags-line output to
// the coerced value, so the two call sites in `case "create_document"`
// can never drift apart again.

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

process.env.CONTEXTREPO_API_KEY = 'test-key';

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

function lastFetchBody() {
  const call = fetchMock.mock.calls.at(-1);
  return call?.[1]?.body ? JSON.parse(call[1].body) : null;
}

const CREATED_OK = mockFetchResponse(201, {
  data: { id: 'doc_v203_test', title: 'T' },
});

describe('create_document — tags coercion (v2.0.3 regression)', () => {
  describe('Group A: non-regression for well-behaved clients (must stay byte-identical)', () => {
    it('native array tags: forwarded as-is and rendered as "Tags: a, b"', async () => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', {
        title: 'T',
        content: 'c',
        tags: ['a', 'b'],
      });

      const text = result.content[0].text;
      expect(text).toBe(
        'Successfully created document "T"\n\nID: doc_v203_test\nTags: a, b'
      );
      expect(lastFetchBody()).toEqual({ title: 'T', content: 'c', tags: ['a', 'b'] });
    });

    it('empty array tags: no Tags line, body has tags: []', async () => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', {
        title: 'T',
        content: 'c',
        tags: [],
      });

      const text = result.content[0].text;
      expect(text).toBe('Successfully created document "T"\n\nID: doc_v203_test');
      expect(text).not.toContain('Tags:');
      expect(lastFetchBody()).toEqual({ title: 'T', content: 'c', tags: [] });
    });

    it('omitted tags (undefined): no Tags line, body has tags: []', async () => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', { title: 'T', content: 'c' });

      const text = result.content[0].text;
      expect(text).toBe('Successfully created document "T"\n\nID: doc_v203_test');
      expect(text).not.toContain('Tags:');
      expect(lastFetchBody()).toEqual({ title: 'T', content: 'c', tags: [] });
    });
  });

  describe('Group B: heal paths (these threw "args.tags.join is not a function" in v2.0.2)', () => {
    it('JSON-encoded array string: healed to array; renders "Tags: a, b"', async () => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', {
        title: 'T',
        content: 'c',
        tags: '["a","b"]',
      });

      const text = result.content[0].text;
      expect(text).toBe(
        'Successfully created document "T"\n\nID: doc_v203_test\nTags: a, b'
      );
      expect(lastFetchBody()).toEqual({ title: 'T', content: 'c', tags: ['a', 'b'] });
    });

    it('JSON-encoded empty string: healed to []; no Tags line', async () => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', {
        title: 'T',
        content: 'c',
        tags: '[]',
      });

      const text = result.content[0].text;
      expect(text).toBe('Successfully created document "T"\n\nID: doc_v203_test');
      expect(text).not.toContain('Tags:');
      expect(lastFetchBody()).toEqual({ title: 'T', content: 'c', tags: [] });
    });

    it('bare string tag: wrapped via single-string fallback; renders "Tags: diag"', async () => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', {
        title: 'T',
        content: 'c',
        tags: 'diag',
      });

      const text = result.content[0].text;
      expect(text).toBe(
        'Successfully created document "T"\n\nID: doc_v203_test\nTags: diag'
      );
      expect(lastFetchBody()).toEqual({ title: 'T', content: 'c', tags: ['diag'] });
    });
  });

  describe('drift guard: REST body and formatter input always see the same coerced value', () => {
    it.each([
      ['native', ['x', 'y']],
      ['stringified', '["x","y"]'],
      ['empty array', []],
      ['stringified empty', '[]'],
      ['bare string', 'x'],
      ['undefined', undefined],
    ])('parity for %s', async (_label, input) => {
      fetchMock.mockResolvedValueOnce(CREATED_OK);

      const result = await callTool('create_document', {
        title: 'T',
        content: 'c',
        ...(input === undefined ? {} : { tags: input }),
      });

      const body = lastFetchBody();
      const text = result.content[0].text;

      const tagsInBody = body.tags;
      const expectsTagsLine = Array.isArray(tagsInBody) && tagsInBody.length > 0;

      if (expectsTagsLine) {
        expect(text).toContain(`\nTags: ${tagsInBody.join(', ')}`);
      } else {
        expect(text).not.toContain('Tags:');
      }
    });
  });
});
