// =============================================================================
// Integration smoke test (R-10)
//
// Env-gated end-to-end smoke that exercises the MCP client against a REAL
// Context Repo backend (typically the dev environment). It is skipped by
// default so unit-test runs in CI and on developer machines stay hermetic.
//
// To run locally against dev:
//   CONTEXTREPO_INTEGRATION=1 \
//   CONTEXTREPO_API_KEY=gm_dev_xxx \
//   CONTEXTREPO_API_BASE=https://your-dev-deployment.convex.site \
//   pnpm test src/__tests__/integration-smoke.test.js
//
// Gating semantics:
//   - CONTEXTREPO_INTEGRATION must be set to a truthy value ('1', 'true').
//   - CONTEXTREPO_API_KEY must be present (non-empty).
//   - CONTEXTREPO_API_BASE may be overridden; if absent, the bundled
//     default in src/index.js is used.
//   - When the gate is OFF, the entire describe block is skipped via
//     describe.skipIf so the suite remains green and fast in CI.
//
// What it validates:
//   - get_user_info: simplest read-only call, validates auth + transport
//     + response envelope shape end-to-end against a live API.
//   - search_prompts (limit=1): validates list-shape rendering and the
//     v1.5.0 H3/H4 fixes (id field handling) against real server output.
//
// What it intentionally does NOT do:
//   - Mutations (create/update/delete) -- avoids polluting the dev DB
//     and avoids ordering coupling between tests.
//   - Vector search calls (deep_search) -- those depend on indexed
//     content and would flake if the dev DB is empty.
//
// This file is the canonical product smoke for v1.5.0+; the renamed
// framework-sanity.test.js (R-12) covers vitest/ESM sanity only.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Snapshot the real (user-supplied) integration env BEFORE we touch
// process.env. This is what the gate decision is based on.
const integrationGate =
  ['1', 'true', 'yes'].includes(String(process.env.CONTEXTREPO_INTEGRATION || '').toLowerCase()) &&
  typeof process.env.CONTEXTREPO_API_KEY === 'string' &&
  process.env.CONTEXTREPO_API_KEY.length > 0;

// When the gate is OFF we still need to import src/index.js without
// triggering its hard 'API key missing' process.exit(1). Inject a
// throwaway sentinel; the gate guarantees no real network calls run.
if (!integrationGate && !process.env.CONTEXTREPO_API_KEY) {
  process.env.CONTEXTREPO_API_KEY = 'gm_integration_smoke_placeholder';
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

vi.mock('@modelcontextprotocol/sdk/types.js', () => {
  return {
    CallToolRequestSchema: { method: 'tools/call' },
    ListToolsRequestSchema: { method: 'tools/list' },
    ListResourcesRequestSchema: { method: 'resources/list' },
    ReadResourceRequestSchema: { method: 'resources/read' },
    ListPromptsRequestSchema: { method: 'prompts/list' },
    GetPromptRequestSchema: { method: 'prompts/get' },
  };
});

let callToolHandler;

beforeEach(async () => {
  registeredHandlers = {};
  vi.resetModules();
  // Important: do NOT mock global.fetch here -- this suite intentionally
  // hits the real network when the integration gate is on.
  await import('../index.js');
  callToolHandler = registeredHandlers['tools/call'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

describe.skipIf(!integrationGate)('integration smoke — live backend (R-10)', () => {
  it('get_user_info responds with a non-error envelope', async () => {
    const result = await callTool('get_user_info', {});
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    expect(result.isError).toBeFalsy();
  });

  it('get_user_info text output identifies an authenticated principal', async () => {
    const result = await callTool('get_user_info', {});
    const text = result.content[0].text;
    // Loose contract: response must mention either an id, a name, or
    // an authentication descriptor. We do not pin exact keys because
    // the real server formatting is the source of truth.
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/user|id|auth|name/i);
  });

  it('search_prompts (limit=1) returns a renderable result without throwing', async () => {
    const result = await callTool('search_prompts', { limit: 1 });
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
    // Either we get a list with at least 0 items, or a "no prompts"
    // message -- both are acceptable smoke outcomes. What we DON'T
    // accept is isError true on a happy-path read.
    expect(result.isError).toBeFalsy();
  });

  it('search_prompts output never embeds a literal "[object Object]" id (H3 regression)', async () => {
    const result = await callTool('search_prompts', { limit: 5 });
    const text = result.content[0].text;
    // If the H3 fix regressed and id rendering broke again, the
    // string "[object Object]" or an "undefined" id would appear here.
    expect(text).not.toMatch(/\[object Object\]/);
    expect(text).not.toMatch(/\bid:\s*undefined\b/i);
  });
});

// Always-on guard: when the gate is off, ensure at least one assertion
// runs so the file shows up as "passed" in CI rather than "no tests".
describe('integration smoke gate metadata', () => {
  it('reports gate status', () => {
    expect(typeof integrationGate).toBe('boolean');
  });
});
