import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Phase 4 (PR-N, 2026-05-24) regression suite for v2.0.4.
//
// 1. Filter handlers — search_prompts, list_collections, list_documents,
//    find_items — accept `tags: string[]` and join into the upstream
//    `?tags=a,b` query parameter.
// 2. Create handlers — create_prompt + create_collection — accept and
//    forward `tags` (already wired for create_document in v2.0.3).
// 3. Update handlers — update_prompt, update_collection, update_document —
//    refactored from the `{ id, ...updates }` spread idiom to explicit-body
//    construction so coerceArray() can heal the Factory Droid stringified
//    array path on tags. The refactor must preserve all existing non-tag
//    field forwarding (regression-pinned per field).
//
// Pattern mirrors create-document-tags-coercion.test.js.

function mockFetchResponse(status, body, ok = null) {
  return {
    ok: ok !== null ? ok : status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 201 ? "Created" : "Error",
    json: async () => body,
    headers: new Headers(),
  };
}

let registeredHandlers = {};

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
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

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => {
  class MockStdioServerTransport {}
  return { StdioServerTransport: MockStdioServerTransport };
});

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: { method: "tools/call" },
  ListToolsRequestSchema: { method: "tools/list" },
  ListResourcesRequestSchema: { method: "resources/list" },
  ReadResourceRequestSchema: { method: "resources/read" },
  ListPromptsRequestSchema: { method: "prompts/list" },
  GetPromptRequestSchema: { method: "prompts/get" },
}));

process.env.CONTEXTREPO_API_KEY = "test-key";

let callToolHandler;
let fetchMock;

beforeEach(async () => {
  registeredHandlers = {};
  vi.resetModules();
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  await import("../index.js");
  callToolHandler = registeredHandlers["tools/call"];
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function callTool(name, args = {}) {
  return callToolHandler({ params: { name, arguments: args } });
}

function lastFetchCall() {
  return fetchMock.mock.calls.at(-1);
}
function lastFetchUrl() {
  return lastFetchCall()?.[0];
}
function lastFetchBody() {
  const call = lastFetchCall();
  return call?.[1]?.body ? JSON.parse(call[1].body) : null;
}

const OK_LIST = mockFetchResponse(200, { data: [], pagination: null });
const OK_DATA = (data) => mockFetchResponse(200, { data });
const CREATED = (data) => mockFetchResponse(201, { data });

// ---------------------------------------------------------------------------
// (1) Filter handlers join tags array into ?tags=a,b
// ---------------------------------------------------------------------------

describe("Phase 4 — filter handlers join tags array into ?tags=a,b", () => {
  it("search_prompts joins tags array", async () => {
    fetchMock.mockResolvedValueOnce(OK_LIST);
    await callTool("search_prompts", { tags: ["alpha", "beta"] });
    expect(decodeURIComponent(lastFetchUrl())).toContain("tags=alpha,beta");
  });

  it("search_prompts omits tags param when not provided", async () => {
    fetchMock.mockResolvedValueOnce(OK_LIST);
    await callTool("search_prompts", {});
    expect(lastFetchUrl()).not.toContain("tags=");
  });

  it("search_prompts omits tags param when empty array", async () => {
    fetchMock.mockResolvedValueOnce(OK_LIST);
    await callTool("search_prompts", { tags: [] });
    expect(lastFetchUrl()).not.toContain("tags=");
  });

  it("list_collections joins tags array", async () => {
    fetchMock.mockResolvedValueOnce(OK_LIST);
    await callTool("list_collections", { tags: ["alpha", "beta"] });
    expect(decodeURIComponent(lastFetchUrl())).toContain("tags=alpha,beta");
  });

  it("list_documents joins tags array", async () => {
    fetchMock.mockResolvedValueOnce(OK_LIST);
    await callTool("list_documents", { tags: ["alpha", "beta"] });
    expect(decodeURIComponent(lastFetchUrl())).toContain("tags=alpha,beta");
  });

  it("find_items joins tags array", async () => {
    fetchMock.mockResolvedValueOnce(
      mockFetchResponse(200, {
        data: { prompts: [], documents: [], collections: [] },
      }),
    );
    await callTool("find_items", { query: "x", tags: ["alpha", "beta"] });
    expect(decodeURIComponent(lastFetchUrl())).toContain("tags=alpha,beta");
  });
});

// ---------------------------------------------------------------------------
// (2) create_prompt and create_collection forward tags via coerceArray
// ---------------------------------------------------------------------------

describe("Phase 4 — create_prompt forwards tags via coerceArray", () => {
  it("native array tags: forwarded as-is", async () => {
    fetchMock.mockResolvedValueOnce(
      CREATED({ id: "p_new", title: "T", engine: "gpt-4" }),
    );
    await callTool("create_prompt", {
      title: "T",
      description: "d",
      content: "c",
      engine: "gpt-4",
      tags: ["alpha", "beta"],
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });

  it("stringified array tags: healed via coerceArray", async () => {
    fetchMock.mockResolvedValueOnce(
      CREATED({ id: "p_new", title: "T", engine: "gpt-4" }),
    );
    await callTool("create_prompt", {
      title: "T",
      description: "d",
      content: "c",
      engine: "gpt-4",
      tags: '["alpha","beta"]',
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });

  it("undefined tags: forwarded as []", async () => {
    fetchMock.mockResolvedValueOnce(
      CREATED({ id: "p_new", title: "T", engine: "gpt-4" }),
    );
    await callTool("create_prompt", {
      title: "T",
      description: "d",
      content: "c",
      engine: "gpt-4",
    });
    expect(lastFetchBody().tags).toEqual([]);
  });
});

describe("Phase 4 — create_collection forwards tags via coerceArray", () => {
  it("native array tags: forwarded as-is", async () => {
    fetchMock.mockResolvedValueOnce(CREATED({ id: "c_new", name: "C" }));
    await callTool("create_collection", {
      name: "C",
      tags: ["alpha", "beta"],
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });

  it("undefined tags: forwarded as []", async () => {
    fetchMock.mockResolvedValueOnce(CREATED({ id: "c_new", name: "C" }));
    await callTool("create_collection", { name: "C" });
    expect(lastFetchBody().tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (3) Update handlers — explicit-body refactor preserves all non-tag fields
//     AND threads tags via coerceArray() with replace-vs-omit semantics.
// ---------------------------------------------------------------------------

describe("Phase 4 — update_prompt explicit-body refactor", () => {
  it("forwards title/description/content/changeLog correctly (regression)", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "p_x", title: "New", currentVersion: 2 }),
    );
    await callTool("update_prompt", {
      promptId: "p_x",
      title: "New",
      description: "Nd",
      content: "Nc",
      changeLog: "cl",
    });
    expect(lastFetchBody()).toEqual({
      title: "New",
      description: "Nd",
      content: "Nc",
      changeLog: "cl",
    });
  });

  it("does NOT include promptId in PATCH body", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "p_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_prompt", { promptId: "p_x", title: "T" });
    expect(lastFetchBody()).not.toHaveProperty("promptId");
  });

  it("with tags=undefined omits tags from PATCH body", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "p_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_prompt", { promptId: "p_x", title: "T" });
    const body = lastFetchBody();
    expect(body).not.toHaveProperty("tags");
  });

  it("with tags=[] writes tags: [] to PATCH body (clear-semantics)", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "p_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_prompt", { promptId: "p_x", tags: [] });
    expect(lastFetchBody().tags).toEqual([]);
  });

  it("with native array tags: forwards as array", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "p_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_prompt", {
      promptId: "p_x",
      tags: ["alpha", "beta"],
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });

  it("with stringified array tags: healed via coerceArray", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "p_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_prompt", {
      promptId: "p_x",
      tags: '["alpha","beta"]',
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });
});

describe("Phase 4 — update_collection explicit-body refactor", () => {
  it("forwards name/description/color/icon correctly (regression)", async () => {
    fetchMock.mockResolvedValueOnce(OK_DATA({ id: "c_x", name: "New" }));
    await callTool("update_collection", {
      collectionId: "c_x",
      name: "New",
      description: "Nd",
      color: "#fff",
      icon: "📁",
    });
    expect(lastFetchBody()).toEqual({
      name: "New",
      description: "Nd",
      color: "#fff",
      icon: "📁",
    });
  });

  it("does NOT include collectionId in PATCH body", async () => {
    fetchMock.mockResolvedValueOnce(OK_DATA({ id: "c_x", name: "T" }));
    await callTool("update_collection", { collectionId: "c_x", name: "T" });
    expect(lastFetchBody()).not.toHaveProperty("collectionId");
  });

  it("with tags=undefined omits tags from PATCH body", async () => {
    fetchMock.mockResolvedValueOnce(OK_DATA({ id: "c_x", name: "T" }));
    await callTool("update_collection", { collectionId: "c_x", name: "T" });
    const body = lastFetchBody();
    expect(body).not.toHaveProperty("tags");
  });

  it("with tags=[] writes tags: [] (clear-semantics)", async () => {
    fetchMock.mockResolvedValueOnce(OK_DATA({ id: "c_x", name: "T" }));
    await callTool("update_collection", { collectionId: "c_x", tags: [] });
    expect(lastFetchBody().tags).toEqual([]);
  });

  it("with stringified array tags: healed via coerceArray", async () => {
    fetchMock.mockResolvedValueOnce(OK_DATA({ id: "c_x", name: "T" }));
    await callTool("update_collection", {
      collectionId: "c_x",
      tags: '["alpha","beta"]',
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });
});

describe("Phase 4 — update_document explicit-body refactor", () => {
  it("forwards title/content/changeLog correctly (regression)", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "d_x", title: "New", currentVersion: 2 }),
    );
    await callTool("update_document", {
      documentId: "d_x",
      title: "New",
      content: "Nc",
      changeLog: "cl",
    });
    expect(lastFetchBody()).toEqual({
      title: "New",
      content: "Nc",
      changeLog: "cl",
    });
  });

  it("does NOT include documentId in PATCH body", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "d_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_document", { documentId: "d_x", title: "T" });
    expect(lastFetchBody()).not.toHaveProperty("documentId");
  });

  it("with tags=undefined omits tags from PATCH body", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "d_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_document", { documentId: "d_x", title: "T" });
    const body = lastFetchBody();
    expect(body).not.toHaveProperty("tags");
  });

  it("with tags=[] writes tags: [] (clear-semantics)", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "d_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_document", { documentId: "d_x", tags: [] });
    expect(lastFetchBody().tags).toEqual([]);
  });

  it("with stringified array tags: healed via coerceArray", async () => {
    fetchMock.mockResolvedValueOnce(
      OK_DATA({ id: "d_x", title: "T", currentVersion: 2 }),
    );
    await callTool("update_document", {
      documentId: "d_x",
      tags: '["alpha","beta"]',
    });
    expect(lastFetchBody().tags).toEqual(["alpha", "beta"]);
  });
});

// ---------------------------------------------------------------------------
// (4) Tool inputSchema source-shape pins (TOOLS array)
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const INDEX_JS = readFileSync(
  path.join(path.dirname(__filename), "..", "index.js"),
  "utf-8",
);

function toolSlice(name) {
  const re = new RegExp(`name:\\s*['"]${name}['"][\\s\\S]*?required:\\s*\\[`);
  const m = INDEX_JS.match(re);
  if (!m) {
    // Tool may have no `required` array; fall back to next tool boundary.
    const re2 = new RegExp(
      `name:\\s*['"]${name}['"][\\s\\S]*?(?=name:\\s*['"]|];)`,
    );
    return INDEX_JS.match(re2)?.[0] ?? "";
  }
  return m[0];
}

describe("Phase 4 — TOOLS inputSchema source-shape pins", () => {
  // Filter tools (4)
  it("search_prompts inputSchema declares tags as string[]", () => {
    expect(toolSlice("search_prompts")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("list_collections inputSchema declares tags as string[]", () => {
    expect(toolSlice("list_collections")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("list_documents inputSchema declares tags as string[]", () => {
    expect(toolSlice("list_documents")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("find_items inputSchema declares tags as string[]", () => {
    expect(toolSlice("find_items")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });

  // Write tools that gain tags in v2.0.4 (5)
  it("create_prompt inputSchema declares tags as string[]", () => {
    expect(toolSlice("create_prompt")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("update_prompt inputSchema declares tags as string[]", () => {
    expect(toolSlice("update_prompt")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("create_collection inputSchema declares tags as string[]", () => {
    expect(toolSlice("create_collection")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("update_collection inputSchema declares tags as string[]", () => {
    expect(toolSlice("update_collection")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
  it("update_document inputSchema declares tags as string[]", () => {
    expect(toolSlice("update_document")).toMatch(
      /tags:\s*\{\s*type:\s*['"]array['"],\s*items:\s*\{\s*type:\s*['"]string['"]/,
    );
  });
});
