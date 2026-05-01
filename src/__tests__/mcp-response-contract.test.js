/**
 * MCP npm CLI response-contract test.
 *
 * Mirrors the web `/mcp` contract test at
 * `convex/__tests__/mcp-response-contract.test.ts` in the GitMaxd-Prompts
 * repo. Locks two halves of the contract:
 *
 *   1. Formatter-level byte-identity. For every fixture in
 *      `_fixtures/canonical.json` (a copy of the cross-surface canonical),
 *      this test feeds the fixture's REST-mock payload through the matching
 *      pure formatter in `../_format.js` and asserts the resulting Markdown
 *      string equals `expected.text` byte-for-byte.
 *
 *   2. Source-shape regression. Each of the 26 npm tools registered in
 *      `src/index.js` must include `structuredContent:` in its return so
 *      the stdio handler emits typed JSON alongside `text`. The check is
 *      done via a per-tool slice + regex scan, mirroring the web suite.
 *
 *   3. Drift guard. The local fixture (`_fixtures/canonical.json`) is a
 *      copy of the canonical at
 *      `<CONTEXT_REPO_PATH>/documentation/05-api/mcp-response-fixtures/canonical.json`.
 *      When the canonical is reachable in dev (CONTEXT_REPO_PATH set OR
 *      sibling checkout exists), the test asserts SHA-256 equality. In
 *      npm-package CI the canonical is unreachable and the assertion is
 *      skipped -- the local copy is the source of truth there.
 *
 * `search` and `fetch` are exempt -- npm CLI doesn't expose them, so
 * those fixture entries are ignored entirely.
 */

import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatGetUserInfo,
  formatSearchPrompts,
  formatReadPrompt,
  formatCreatePrompt,
  formatUpdatePrompt,
  formatDeletePrompt,
  formatDeletePromptIdempotent,
  formatGetPromptVersions,
  formatRestorePromptVersion,
  formatListDocuments,
  formatGetDocument,
  formatCreateDocument,
  formatUpdateDocument,
  formatDeleteDocument,
  formatDeleteDocumentIdempotent,
  formatGetDocumentVersions,
  formatRestoreDocumentVersion,
  formatListCollections,
  formatGetCollection,
  formatCreateCollection,
  formatUpdateCollection,
  formatDeleteCollection,
  formatDeleteCollectionIdempotent,
  formatAddToCollection,
  formatRemoveFromCollection,
  formatFindItems,
  formatDeepSearch,
  formatDeepRead,
  formatDeepExpand,
  formatDeepExpandEmpty,
} from "../_format.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_FIXTURE_PATH = path.join(__dirname, "_fixtures", "canonical.json");
const INDEX_JS_PATH = path.join(__dirname, "..", "index.js");

const FIXTURE_FILE = JSON.parse(readFileSync(LOCAL_FIXTURE_PATH, "utf-8"));
const ALL_FIXTURES = FIXTURE_FILE.fixtures;

// npm CLI does NOT expose `search` and `fetch` (web-only OpenAI Apps SDK
// pair). Skip those entries entirely; this contract test does not
// assert anything about them.
const NPM_FIXTURES = ALL_FIXTURES.filter(
  (f) => !f.exempt && f.tool !== "search" && f.tool !== "fetch",
);
const NPM_FIXTURE_ROWS = NPM_FIXTURES.map((f) => [f.tool, f]);

/**
 * Dispatch a fixture through the matching formatter. Branch keys mirror
 * the canonical fixture's `tool` field, including synthetic branches
 * (`*_idempotent`, `get_collection_no_items`, `deep_expand_empty`).
 */
function formatFixture(fixture) {
  const args = fixture.args ?? {};
  const response = fixture.rest?.response ?? {};
  const data = response.data;

  switch (fixture.tool) {
    case "get_user_info":
      return formatGetUserInfo(data);
    case "search_prompts":
      return formatSearchPrompts(response);
    case "read_prompt":
      return formatReadPrompt(data);
    case "create_prompt":
      return formatCreatePrompt(data);
    case "update_prompt":
      return formatUpdatePrompt(data);
    case "delete_prompt":
      return formatDeletePrompt(args.promptId);
    case "delete_prompt_idempotent":
      return formatDeletePromptIdempotent(args.promptId);
    case "get_prompt_versions":
      return formatGetPromptVersions(data ?? []);
    case "restore_prompt_version":
      return formatRestorePromptVersion(data);
    case "list_documents":
      return formatListDocuments(response);
    case "get_document":
      return formatGetDocument(data);
    case "create_document":
      return formatCreateDocument(data, {
        title: args.title,
        tags: args.tags,
      });
    case "update_document":
      return formatUpdateDocument(data);
    case "delete_document":
      return formatDeleteDocument(args.documentId);
    case "delete_document_idempotent":
      return formatDeleteDocumentIdempotent(args.documentId);
    case "get_document_versions":
      return formatGetDocumentVersions(data ?? []);
    case "restore_document_version":
      return formatRestoreDocumentVersion(data);
    case "list_collections":
      return formatListCollections(response);
    case "get_collection": {
      const items = fixture.rest?.itemsResponse?.data;
      return formatGetCollection(data, items);
    }
    case "get_collection_no_items":
      return formatGetCollection(data);
    case "create_collection":
      return formatCreateCollection(data, {
        name: args.name,
        icon: args.icon,
        color: args.color,
      });
    case "update_collection":
      return formatUpdateCollection(data);
    case "delete_collection":
      return formatDeleteCollection(args.collectionId);
    case "delete_collection_idempotent":
      return formatDeleteCollectionIdempotent(args.collectionId);
    case "add_to_collection":
      return formatAddToCollection(data, args.itemType);
    case "remove_from_collection":
      return formatRemoveFromCollection(data, args.itemType);
    case "find_items": {
      const useSemantic = args.semantic !== false;
      return formatFindItems({
        query: args.query,
        useSemantic,
        data,
      });
    }
    case "deep_search":
      return formatDeepSearch(data);
    case "deep_read":
      return formatDeepRead(data);
    case "deep_expand": {
      const chunks = data?.chunks ?? [];
      return formatDeepExpand({
        direction: args.direction,
        chunks,
      });
    }
    case "deep_expand_empty":
      return formatDeepExpandEmpty();
    default:
      throw new Error(`Unknown fixture tool: "${fixture.tool}"`);
  }
}

// ============================================================================
// (a) Formatter-level byte-identity
// ============================================================================

describe("MCP response contract -- formatter byte-identity (npm CLI)", () => {
  test("canonical fixture loads with at least one fixture per known npm branch", () => {
    expect(NPM_FIXTURES.length).toBeGreaterThanOrEqual(28);
    const tools = NPM_FIXTURES.map((f) => f.tool);
    for (const expected of [
      "get_user_info",
      "search_prompts",
      "read_prompt",
      "create_prompt",
      "update_prompt",
      "delete_prompt",
      "delete_prompt_idempotent",
      "get_prompt_versions",
      "restore_prompt_version",
      "list_documents",
      "get_document",
      "create_document",
      "update_document",
      "delete_document",
      "delete_document_idempotent",
      "get_document_versions",
      "restore_document_version",
      "list_collections",
      "get_collection",
      "get_collection_no_items",
      "create_collection",
      "update_collection",
      "delete_collection",
      "delete_collection_idempotent",
      "add_to_collection",
      "remove_from_collection",
      "find_items",
      "deep_search",
      "deep_read",
      "deep_expand",
      "deep_expand_empty",
    ]) {
      expect(tools).toContain(expected);
    }
  });

  test.each(NPM_FIXTURE_ROWS)(
    'formatter for "%s" emits canonical Markdown byte-identical to fixture',
    (_tool, fixture) => {
      const actual = formatFixture(fixture);
      expect(actual).toBe(fixture.expected.text);
    },
  );

  test.each(NPM_FIXTURE_ROWS)(
    'formatter for "%s" structuredContent mirror is JSON-serializable (sanity)',
    (_tool, fixture) => {
      // Spot check: every fixture's structuredContent is a JSON-serializable
      // object. The actual deep-equal check happens at the index.js callsite
      // (the source-shape suite below verifies the key is emitted; the
      // formatter test verifies the text part).
      expect(() => JSON.stringify(fixture.expected.structuredContent)).not.toThrow();
    },
  );
});

// ============================================================================
// (b) Source-shape regression: every tool callback returns structuredContent
// ============================================================================

const TOOLS_WITH_STRUCTURED_CONTENT = [
  "get_user_info",
  "search_prompts",
  "read_prompt",
  "create_prompt",
  "update_prompt",
  "delete_prompt",
  "get_prompt_versions",
  "restore_prompt_version",
  "list_documents",
  "get_document",
  "create_document",
  "update_document",
  "delete_document",
  "get_document_versions",
  "restore_document_version",
  "list_collections",
  "get_collection",
  "create_collection",
  "update_collection",
  "delete_collection",
  "add_to_collection",
  "remove_from_collection",
  "find_items",
  "deep_search",
  "deep_read",
  "deep_expand",
];

describe("MCP response contract -- source-shape (index.js) regression", () => {
  test("index.js handles every tracked tool in the CallToolRequest switch", () => {
    const src = readFileSync(INDEX_JS_PATH, "utf-8");
    for (const tool of TOOLS_WITH_STRUCTURED_CONTENT) {
      const re = new RegExp(`case\\s+['"]${tool}['"]\\s*:`);
      expect(src, `cannot locate "case '${tool}':" in index.js`).toMatch(re);
    }
  });

  test.each(TOOLS_WITH_STRUCTURED_CONTENT)(
    "tool `%s` case body contains a `structuredContent:` return key",
    (tool) => {
      const src = readFileSync(INDEX_JS_PATH, "utf-8");

      // Slice from this tool's `case "<tool>":` clause up to the next
      // `case ` clause (or the final `default:`). The slice covers all
      // return paths inside the tool body -- including idempotent-404
      // branches -- so the assertion fires per-tool, not per-callback.
      const startMarker = new RegExp(`case\\s+['"]${tool}['"]\\s*:`).exec(src);
      expect(startMarker, `cannot locate case '${tool}' in index.js`).not.toBeNull();
      const start = startMarker.index;
      const remainder = src.slice(start + 1);
      const nextCaseIdx = remainder.search(/case\s+['"][a-z_]+['"]\s*:/);
      const nextDefaultIdx = remainder.search(/default\s*:/);
      const candidates = [nextCaseIdx, nextDefaultIdx].filter((n) => n >= 0);
      const offset = candidates.length > 0 ? Math.min(...candidates) : remainder.length;
      const slice = src.slice(start, start + 1 + offset);

      expect(slice).toMatch(/structuredContent\s*:/);
    },
  );
});

// ============================================================================
// (c) Drift guard: local fixture matches canonical SHA-256 when both present
// ============================================================================

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function resolveCanonicalPath() {
  const envPath = process.env.CONTEXT_REPO_PATH;
  const candidates = [];
  if (envPath) {
    candidates.push(
      path.resolve(envPath, "documentation/05-api/mcp-response-fixtures/canonical.json"),
    );
  }
  // Sibling checkout: ../GitMaxd-Prompts relative to this package's root.
  candidates.push(
    path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "GitMaxd-Prompts",
      "documentation/05-api/mcp-response-fixtures/canonical.json",
    ),
  );
  return candidates.find((p) => existsSync(p)) ?? null;
}

describe("MCP response contract -- fixture drift guard", () => {
  test("local fixture matches canonical SHA-256 when both present", () => {
    // Skip in CI by design: npm-package CI checks out only this repo and
    // cannot reach the canonical. The local copy is the source of truth
    // there; drift is caught by maintainers running `pnpm test` locally
    // before publishing.
    if (process.env.CI === "true" && !process.env.CONTEXT_REPO_PATH) {
      return;
    }

    const canonicalPath = resolveCanonicalPath();
    if (!canonicalPath) {
      // No canonical reachable. Treat as soft-skip so dev workstations
      // without a sibling checkout still pass; a maintainer running the
      // sync script will see the mismatch the moment they edit either file.
      return;
    }

    const localBuf = readFileSync(LOCAL_FIXTURE_PATH);
    const canonicalBuf = readFileSync(canonicalPath);
    expect(sha256(localBuf)).toBe(sha256(canonicalBuf));
  });
});
