# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.3] - 2026-04-27

### Fixed
- **`find_items` markdown output now surfaces `promptId` / `documentId` / `collectionId` per result line (M1, claim #4).** The streaming MCP server at `app/[transport]/route.ts:996-1028` and the npm CLI at `src/index.js:1141-1184` both formatted `find_items` results without IDs, contradicting the tool description's promise that the tool "returns titles, IDs, and relevance scores." Agents reading a `find_items` result then had to issue a second `list_*` / `search_*` call just to recover the ID. Each prompt / document / collection list line now includes an `(id: ...)` token, parenthesized to mirror the existing `(score: ...)` pattern. The change is **additive** — every previously rendered field stays in place, so external markdown parsers continue to work. Mirrors `Gitmaxd/gitmaxd-prompts` PR #139 (merge `e1416f5`).

### Changed
- **`create_prompt` description no longer claims `${variableName}` extraction (M1, claim #2).** The prose at `src/index.js:268` and `:276`, plus the tool short-description in `claude-extension/manifest.json`, advertised that the tool would parse `${variableName}` placeholders out of `content`. No layer in the system did so — the `prompts` table at `convex/schema.ts:36-40` stores `variables` as a user-curated `{ name, type, description? }[]` array, and neither the streaming MCP nor the npm CLI ever populated that array from `content`. Per Owner Q1 the schema's intent is the truth and the description was the lie; the prose now reads "Create a new prompt template." with `content` described as "(free-form text)." Existing `variables` round-trips on read are unaffected.
- **`find_items` description now discloses the 4 KiB literal-mode body-search cap (M1, claim #3).** Documents are FTS-indexed on `contentPreview` (capped at `MAX_CONTENT_PREVIEW_BYTES = 4_096` per `convex/lib/requestLimits.ts:82`), so unique tokens past byte 4096 of a long document are invisible to `find_items` literal mode even though `deep_search` (vector embeddings, full body) sees them. Per Owner Q2 the cap is a permanent design — the description now reads: "Literal mode (semantic=false) searches titles, descriptions, and the first ~4 KiB of document content; for full body-text search use deep_search." Steers callers to `deep_search` for full-body recall. No behavior change.

### Notes
- This release contains **npm-package-only changes**. The streaming MCP server (`app/[transport]/route.ts` in `Gitmaxd/gitmaxd-prompts`) shipped the same three fixes in PR #139 (merge `e1416f5`, 2026-04-27). 1.5.3 brings the npm CLI to parity so Claude Desktop `.mcpb` users see the corrected descriptions and ID-surfaced output.
- M1 source: `docs/MCP-Extension-Smoke-Test-Forensic-Verification-2026-04-27.md` (4-agent forensic report). Spec: `docs/mission-M1-mcp-pre-launch-honesty.md`. Owner answers locked the scope to Option A on Q1 (description honesty, no extraction feature) and "permanent design" on Q2 (no full-content FTS index).
- No new tests in this release. The streaming-MCP PR shipped 10 unit tests against an extracted formatter helper at `app/[transport]/find-items-formatter.ts`; the npm CLI's formatter remains inline (no extracted helper) per pre-launch policy ("do not over-engineer"). All 211 existing tests pass (4 skipped, unchanged from 1.5.2).

## [1.5.2] - 2026-04-26

### Fixed
- **`get_document_versions` now surfaces a real version ID per row (F-1).** Pre-1.5.2 the formatter at `src/index.js:1086` read `v._id` directly, but the server returns the canonical `{id, version, ...}` shape (`convex/http.ts` documents-versions handler), so every row rendered as `**ID:** undefined`. The shared `getId(v)` helper (introduced in 1.5.0) now backs this row, mirroring the `get_prompt_versions` fix shipped in 1.5.0 (TDD-H2). Restoring a specific historical version via `restore_document_version` now works end-to-end through the MCP surface; previously callers could only restore by guessing the ID from the Convex dashboard.

### Changed
- **`update_prompt` description tightened to reflect actual version-bump behavior (F-2).** The previous wording ("Each update automatically creates a new version") was true for the npm CLI's POV but masked the server-side rule that only `content` changes trigger a new version. Title-only and description-only updates do not bump the version. Description now states this explicitly so MCP clients (and ChatGPT/Claude users reading the tool list) set correct expectations.
- **`update_document` description tightened the same way (F-2).** Title-only updates do not bump the version; only `content` updates create a new version and re-trigger semantic-search re-indexing.
- **All five collection-write tools now document the `documents.write` API key scope requirement (F-3).** `create_collection`, `update_collection`, `delete_collection`, `add_to_collection`, and `remove_from_collection` are gated by the same scope as documents on the server side, but the tool descriptions never advertised this. Users hitting a 403 from a `prompts.write`-only key had no way to debug from the MCP surface alone. Each description now ends with: `"Requires `documents.write` API key scope (collections are gated by the same scope as documents)."`

### Added
- **`src/__tests__/get-document-versions.test.js`** — 5 new contract tests pinning F-1: real-ID rendering on canonical `{id}` shape, `(Current)` marker on the first row, `_id` legacy fallback (so the next backend rename does not silently break us again), `id` over `_id` preference, and the no-history empty-array path. Mirrors the `get-prompt-versions.test.js` pattern from 1.5.0.
- Test totals: **211 passed, 4 skipped** (was 206 + 5 new = 211).

### Notes
- This release contains **npm-package-only changes**. There are no Convex backend changes in 1.5.2; the canonical `{id}` shape was already shipped in the 9054a43 sanitization release (PR #135) on the server side, and the F-1 / F-2 / F-3 dual-codebase fix shipped on the streaming `app/[transport]/route.ts` server in PR #136 (1108c9e). 1.5.2 brings the npm CLI to parity.
- F-1 was found during a 26-tool MCP pre-launch lifecycle audit on 2026-04-26 (`docs/2026-04-27-mcp-pre-launch-findings-f-1-f-2-f-3-single-pr-three-commits.md` in the `GitMaxd-Prompts` repo); the audit initially pinned the bug to `app/[transport]/route.ts` but the npm CLI carries an independent copy of the formatter that needed the same fix.
- F-2 / F-3 are docstring-only clarifications. No behavior change in tool execution, only in how clients describe the tools.

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
