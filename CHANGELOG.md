# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.1] - 2026-04-26

### Fixed
- **`deep_expand` now renders the `Parent:` line in tool output (M-049, TDD-M1, R-08).** The server's `/v1/pd/expand` endpoint emits each chunk's parent linkage as `parentId` (per `convex/pdHttp.ts` `expandedChunkValidator`), but the formatter at `src/index.js:1341` previously read `chunk.parentChunkId`. The field-name mismatch meant the `if` branch never fired against real server payloads and the `Parent:` line silently never appeared. Three new contract tests pin the fix and the previously deferred `it.todo` placeholders are now real, passing tests.

### Changed
- **`get_collection.includeItems` default flipped to `true` to match the streaming MCP server (M-050).** Pre-1.5.1 the npm CLI defaulted to `false` while `httpStreamableServer` (`app/[transport]/route.ts:739`) defaulted to `true`, so the same `get_collection` call against the same collection returned different shapes depending on which client a user was on. Now both clients agree: items are included by default; callers wanting metadata only must pass `includeItems: false` explicitly. Tool-schema description updated to advertise the new default.
- **`deep_expand` description refreshed to surface the M-046 / M-047 sparse-hierarchy `surrounding` fallback (M-050).** The streaming server's wording was updated when those fixes shipped; the npm CLI description was never synced. Both the top-level description and the `count` arg description now match `route.ts` so MCP clients reading the tool list see the correct behavior.

### Added
- **`src/__tests__/get-collection.test.js`** — 5 new tests pinning omit / `true` / `false` fetch behavior plus tool-schema description assertions.
- **+1 assertion in `src/__tests__/tool-list-snapshot.test.js`** pinning the refreshed `deep_expand` description so future drift is caught at CI.
- Test totals: **206 passed, 4 skipped** (was 197 + 9 new = 206).

### Notes
- This release contains npm-package-only changes. There are **no Convex backend changes** in 1.5.1.
- Behavior change for `get_collection.includeItems` default is technically a minor-bump signal under strict semver, but per pre-launch project calibration (zero published-package users hitting it yet) this is shipped as a patch alongside the M-049 fix. Future API behavior changes will follow strict semver as user uptake grows.
- Cross-implementation audit details: `GitMaxd-Prompts/docs/API-Reports/2026-04-26-mcp-cross-implementation-audit.md`.

## [1.5.0] - 2026-04-24

### Fixed
- **`search_prompts` no longer returns `id: undefined`** — handler now reads the canonical `id` field from the API response (TDD-H3). Fixes the silent identifier-rendering regression that broke downstream `read_prompt` / `update_prompt` chaining.
- **`tools/list` and the legacy `prompts/list` MCP protocol method** now emit consistent prompt identifiers via a shared `getId()` helper, eliminating the `id` vs `_id` schism between the two surfaces (TDD-H1, H4).
- **`create_prompt`, `create_collection`, `create_document`** now consistently emit the new resource's `id` in tool output (was sometimes `undefined`) (TDD-H1, H5).
- **`get_prompt_versions`** correctly renders the `versionId` of each historical entry (TDD-H2).
- **API error messages are now category-prefixed and informative** rather than the opaque "Internal Server Error" surfaced by some 4xx paths (TDD-H6, H7). 5xx bodies are logged server-side via `console.error` and replaced with a generic "Server error (status N). Please retry shortly." in the client surface (defense-in-depth against backend payload leakage).
- **All API requests now have a 30-second timeout** via `AbortSignal.timeout`. Hung requests no longer leak file descriptors or block the MCP transport indefinitely. Timeout aborts surface as "Request timed out after 30s..." (TDD-H8).

### Added
- **CI pipeline** (`.github/workflows/ci.yml`): every PR and every push to `main` now runs the full unit suite on Node 18, 20, and 22, plus a `.mcpb` build sanity check.
- **Pre-publish gate**: `publish.yml` now requires a green test run before `npm publish` and `.mcpb` upload. `package.json` also wires `prepublishOnly: npm test` as a belt-and-braces guard.
- **Env-gated integration smoke** (`src/__tests__/integration-smoke.test.js`): live-backend smoke that runs against dev when `CONTEXTREPO_INTEGRATION=1` is set. Skipped by default to keep unit runs hermetic.
- **62 new regression assertions** across 9 new test files, including snapshot-style pinning of the 26-tool `tools/list` contract (R-11), idempotent-delete contract for all three delete tools (R-09), restore-version cascade containment (R-03), and `deep_expand` parent-field contract todos (R-08, deferred to v1.5.1).

### Changed
- Internal helpers refactored: shared `getId(obj)`, shared `buildApiError(status, body, statusText)`, and a top-level `REQUEST_TIMEOUT_MS = 30_000` constant. No external API surface changes.
- Renamed `src/__tests__/smoke.test.js` to `framework-sanity.test.js` to avoid conflating vitest/ESM sanity with product-level smoke (R-12). Three assertions unchanged.

### Notes
- TDD-M1 (`deep_expand` reads `chunk.parentChunkId` but the server emits `parentId`) is documented as `it.todo` in the test suite and deferred to v1.5.1. The surface-level effect is that the "Parent:" line is silently omitted from `deep_expand` output for `up`/`down` navigation; correctness of the chunks themselves is unaffected.

## [1.4.2] - 2026-04-17

### Fixed
- `delete_document`, `delete_prompt`, and `delete_collection` are now truly idempotent: calling delete on an already-deleted item returns an `"already deleted (no-op)"` success message instead of surfacing the raw backend `"Document not found"` / `"Prompt not found"` / `"Collection not found"` error. Mirrors the fix shipped in the web MCP server (gitmaxd-prompts PR #126). Non-"not-found" errors still surface normally as tool errors.

## [1.3.2] - 2026-03-17

### Changed
- Updated README to accurately reflect 25 tools (removed phantom get_user_info listing)
- Removed deprecated Claude Desktop Extension (.mcpb) install section from README
- Updated all tool descriptions in README tables to match enriched v1.3.1 source code

## [1.3.1] - 2026-03-16

### Changed
- Enriched all 21 CRUD tool descriptions with distinctive keywords, cross-references, and use-case language to improve tool discovery via Claude Desktop Extension's tool_search system
- Updated manifest.json tool descriptions to match enriched server descriptions
- Fixed server version string consistency (was showing v1.2.0/v1.2.1 in banner and server config)

## [1.3.0] - 2026-03-11

### Changed
- Renamed `search_context_repo` to `find_items` -- catalog/discovery search across all content types
- Renamed `pd_search` to `deep_search` -- document content exploration via hierarchical chunks
- Renamed `pd_read` to `deep_read` -- single chunk inspection with hierarchy metadata
- Renamed `pd_expand` to `deep_expand` -- 5-direction document tree navigation
- Rewrote all search tool descriptions for clearer agent guidance, explicitly contrasting catalog search vs progressive disclosure search
- Aligns tool names with web-hosted MCP server (PR #84 in main app repo)

## [1.2.1] - 2026-03-10

### Changed
- Updated README with comprehensive progressive disclosure documentation (parameter tables, workflow guide, direction reference, examples)

## [1.2.0] - 2026-03-10

### Added
- `pd_search` tool - Search documents using vector similarity and return hierarchical chunk results for progressive disclosure navigation. Includes auto-session management for result deduplication across searches.
- `pd_expand` tool - Navigate the document hierarchy from a specific chunk in 5 directions: up (parent), down (children), next/previous (siblings), and surrounding (context window).
- `pd_read` tool - Retrieve a single document chunk with full hierarchy metadata (section path, position, navigation IDs, word count) for deep inspection.

## [1.1.0] - 2025-12-07

### Added
- `get_prompt_versions` tool - View version history of prompts with change logs
- `restore_prompt_version` tool - Restore prompts to previous versions
- `get_document_versions` tool - View version history of documents with change logs
- `restore_document_version` tool - Restore documents to previous versions
- Full feature parity with App MCP Server (22 tools total, excluding `get_user_info` per security review)

## [1.0.2] - 2025-11-28

### Added
- `update_document` tool - Update existing documents
- `delete_document` tool - Permanently delete documents
- Full CRUD parity across Prompts, Documents, and Collections

## [1.0.1] - 2025-11-28

### Added
- `get_collection` tool - Get collection details with optional items
- `create_collection` tool - Create new collections
- `update_collection` tool - Update collection metadata
- `delete_collection` tool - Delete collections
- `add_to_collection` tool - Add documents/prompts to collections
- `remove_from_collection` tool - Remove items from collections

## [1.0.0] - 2025-11-27

### Added
- Initial release
- Prompt management tools (list, get, create, update, delete)
- Collection listing tool
- Document management tools (list, get, create)
- MCP capabilities resource
- Claude Desktop integration support
