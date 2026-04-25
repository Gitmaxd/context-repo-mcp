import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Snapshot test for the 26-tool MCP contract (R-11 in the audit
// remediation plan). The existing backward-compat test asserts the
// COUNT and the PRESENCE of each name, but does not pin order. A
// typo or a duplicate that still leaves count = 26 would slip
// through. This test pins the exact ordered list.

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

let listToolsHandler;

beforeEach(async () => {
  registeredHandlers = {};
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../index.js');
  listToolsHandler = registeredHandlers['tools/list'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tools/list — exact 26-tool contract pinned (R-11)', () => {
  it('returns the canonical 26 tool names in the documented order', async () => {
    const result = await listToolsHandler({});
    const names = result.tools.map((t) => t.name);

    expect(names).toEqual([
      // Identity (1)
      'get_user_info',
      // Prompts (7)
      'search_prompts',
      'read_prompt',
      'create_prompt',
      'update_prompt',
      'delete_prompt',
      'get_prompt_versions',
      'restore_prompt_version',
      // Collections (7)
      'list_collections',
      'get_collection',
      'create_collection',
      'update_collection',
      'delete_collection',
      'add_to_collection',
      'remove_from_collection',
      // Documents (7)
      'list_documents',
      'get_document',
      'create_document',
      'update_document',
      'delete_document',
      'get_document_versions',
      'restore_document_version',
      // Catalog search (1)
      'find_items',
      // Progressive disclosure (3)
      'deep_search',
      'deep_read',
      'deep_expand',
    ]);
  });

  it('every tool has a non-empty name, description, and inputSchema', async () => {
    const result = await listToolsHandler({});

    for (const tool of result.tools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('emits no duplicate tool names', async () => {
    const result = await listToolsHandler({});
    const names = result.tools.map((t) => t.name);
    const unique = new Set(names);

    expect(unique.size).toBe(names.length);
    expect(unique.size).toBe(26);
  });

  it('every tool with a "required" array references properties that exist on the schema', async () => {
    const result = await listToolsHandler({});

    for (const tool of result.tools) {
      const required = tool.inputSchema.required ?? [];
      const properties = tool.inputSchema.properties ?? {};
      for (const reqField of required) {
        expect(
          properties[reqField],
          `Tool ${tool.name} requires "${reqField}" but no such property is defined`,
        ).toBeDefined();
      }
    }
  });
});
