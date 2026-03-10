---
name: mcp-tool-worker
description: Implements MCP tool features with TDD in the context-repo-mcp single-file server
---

# MCP Tool Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that add, modify, or test MCP tools in the `context-repo-mcp` server. This includes:
- Adding new tool schemas to the TOOLS array
- Adding case handlers in the CallToolRequestSchema switch
- Writing Vitest unit tests for tool behavior
- Updating distribution files (manifest, changelog, version)

## Work Procedure

### Step 1: Read Feature Requirements

Read the feature description, expectedBehavior, and preconditions carefully. Identify:
- Which tool(s) to implement
- What API endpoint(s) they call
- What the response format should be
- What edge cases need handling

### Step 2: Read Existing Patterns

Read `src/index.js` to understand:
- How existing tools are defined in the TOOLS array (schema format)
- How existing case handlers work (apiRequest calls, response formatting)
- The error handling pattern (try/catch wrapper)
- The apiRequest() function signature and behavior

Read `.factory/library/architecture.md` for API response shapes and field mappings.
Read `.factory/missions/*/AGENTS.md` for boundaries and conventions.

### Step 3: Write Tests First (RED)

Create or update test files in `src/__tests__/`. For each tool:

1. **Mock apiRequest**: Create a mock that captures calls and returns controlled responses.
   Since `apiRequest` is a module-level function in `src/index.js` and the server is a single file,
   you need to structure tests to mock the fetch layer or extract testable functions.
   
   Recommended approach: Mock the global `fetch` function since `apiRequest()` uses native fetch.
   This lets you control API responses without modifying the source.

2. **Write schema tests**: Verify the tool exists in TOOLS with correct name, description, and inputSchema properties.

3. **Write handler tests**: For each expectedBehavior item:
   - Set up the mock to return the appropriate API response
   - Call the handler (or simulate the tool call)
   - Assert the response format, content, and error handling

4. **Run tests**: `npx vitest run` — they should FAIL (red phase).

### Step 4: Implement (GREEN)

Add to `src/index.js`:

1. **Tool schema**: Add to TOOLS array following existing pattern. Place new tools after the last existing tool (after `search_context_repo`).

2. **Case handler**: Add `case "tool_name":` to the switch statement. Follow the pattern:
   ```js
   case "pd_search": {
     const result = await apiRequest("POST", "/v1/pd/search", { ... });
     // Format response
     return { content: [{ type: "text", text: formattedOutput }] };
   }
   ```

3. **Auto-session** (pd_search only): Add module-level `let currentSessionId = null;` near the top. In the pd_search handler, check if sessionId was provided; if not, create one via apiRequest and store it.

4. **Run tests**: `npx vitest run` — they should PASS (green phase).

### Step 5: Verify

1. Run full test suite: `npx vitest run`
2. Check that ALL tests pass (not just new ones)
3. Verify the tool count: new tools + 22 existing = expected total

### Step 6: Manual Verification (if applicable)

For distribution features:
- Verify manifest.json has correct tool entries
- Verify CHANGELOG.md entry is well-formatted
- Verify package.json version is correct
- Verify claude-extension/server/index.js matches src/index.js

## Example Handoff

```json
{
  "salientSummary": "Implemented pd_search tool with auto-session management. Added tool schema to TOOLS array, case handler calling POST /v1/pd/search with session creation fallback. Wrote 12 tests covering: schema validation, query forwarding, response formatting with hierarchy metadata, empty results, error propagation (401/403/429/500), empty query handling, data unwrapping, and auto-session create/reuse/override/failure. All 14 tests pass (2 existing + 12 new).",
  "whatWasImplemented": "pd_search tool schema in TOOLS array with query/limit/sessionId/collectionId/documentId params. Case handler in switch statement that: (1) auto-creates session on first call if no sessionId provided, (2) calls POST /v1/pd/search with all params, (3) formats response as structured text with hierarchy metadata (level, score, chunkId, documentTitle, siblingIds). Module-level currentSessionId variable for session persistence. Graceful degradation if session creation fails.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run", "exitCode": 0, "observation": "14 tests pass (2 smoke + 12 pd_search)" },
      { "command": "grep -c 'pd_search' src/index.js", "exitCode": 0, "observation": "Found in TOOLS array and switch case" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "src/__tests__/pd-search.test.js",
        "cases": [
          { "name": "tool schema has correct properties", "verifies": "VAL-SEARCH-001" },
          { "name": "forwards query and params to API", "verifies": "VAL-SEARCH-002" },
          { "name": "formats response with hierarchy metadata", "verifies": "VAL-SEARCH-003" },
          { "name": "handles empty results gracefully", "verifies": "VAL-SEARCH-004" },
          { "name": "propagates API errors", "verifies": "VAL-SEARCH-005" },
          { "name": "rejects empty query", "verifies": "VAL-SEARCH-007" },
          { "name": "unwraps data.results correctly", "verifies": "VAL-SEARCH-008" },
          { "name": "auto-creates session on first call", "verifies": "VAL-SESSION-001" },
          { "name": "reuses session on second call", "verifies": "VAL-SESSION-002" },
          { "name": "explicit sessionId overrides auto", "verifies": "VAL-SESSION-003" },
          { "name": "search continues if session creation fails", "verifies": "VAL-SESSION-005" },
          { "name": "response matches MCP envelope", "verifies": "VAL-CROSS-004" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The existing `apiRequest()` function doesn't support a needed HTTP method or pattern
- The TOOLS array or switch statement structure has changed from what was documented
- Tests require a pattern that can't work with global fetch mocking in this ESM setup
- A precondition is not met (e.g., Vitest not installed when expected)
