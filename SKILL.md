---
name: context-repo-mcp
description: >
  Search, retrieve, version, and persist AI prompt templates, documents,
  and collections in the user's Context Repo account
  (https://contextrepo.com) via the official MCP server. Use this skill
  whenever the user mentions their saved prompts, prompt library, prompt
  templates, system prompts, "context repo", contextrepo, or wants to
  find, save, version, restore, or share a reusable prompt or document
  across their AI tools — even when they don't explicitly say "skill"
  or "MCP". Trigger on phrases like "find my prompt for ...", "use the
  system prompt I saved as ...", "save this as a reusable prompt",
  "what prompts do I have about ...", "version this prompt", "restore
  the previous version of ...", "search my context repo for ...", or
  "sync this prompt to my Cursor / Claude / ChatGPT setup". Also
  trigger when the user wants to navigate large documents
  hierarchically (deep_search -> deep_read -> deep_expand) or perform
  semantic search across their stored knowledge base.
version: 2.0.0
license: MIT
homepage: https://contextrepo.com
repository: https://github.com/Gitmaxd/context-repo-mcp
package: context-repo-mcp
runtime: node
engines:
  node: ">=18.0.0"
auth:
  - api-key
  - oauth2
tags:
  - mcp
  - prompts
  - prompt-management
  - knowledge-base
  - rag
  - claude
  - cursor
  - factory-droid
  - chatgpt-apps
---

# context-repo-mcp

Connect to a [Context Repo](https://contextrepo.com) account and act
on the user's saved prompts, documents, and collections through 28
MCP tools. The Context Repo platform stores reusable prompt
templates with version history, markdown documents with hierarchical
search, and collection-based organization — this skill is the
agent's read/write interface to that storage.

## Capabilities

Use these tool families for the corresponding intents:

- **Prompt retrieval** — `search_prompts`, `read_prompt`,
  `find_items` (semantic + literal cross-content search).
- **Prompt creation and versioning** — `create_prompt`,
  `update_prompt`, `get_prompt_versions`, `restore_prompt_version`,
  `delete_prompt`.
- **Document storage** — `list_documents`, `get_document`,
  `create_document`, `update_document`, `delete_document`,
  `get_document_versions`, `restore_document_version`.
- **Collection organization** — `list_collections`, `get_collection`,
  `create_collection`, `update_collection`, `delete_collection`,
  `add_to_collection`, `remove_from_collection`.
- **Hierarchical document navigation** — `deep_search` -> `deep_read`
  -> `deep_expand` (vector-backed chunk retrieval with parent /
  sibling navigation across `up`, `down`, `next`, `previous`,
  `surrounding` directions).
- **Account info** — `get_user_info`.

## Tool inventory (28 tools, snake_case)

| Category | Tools |
|---|---|
| User | `get_user_info` |
| Prompts | `search_prompts`, `read_prompt`, `create_prompt`, `update_prompt`, `delete_prompt`, `get_prompt_versions`, `restore_prompt_version` |
| Documents | `list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `get_document_versions`, `restore_document_version` |
| Collections | `list_collections`, `get_collection`, `create_collection`, `update_collection`, `delete_collection`, `add_to_collection`, `remove_from_collection` |
| Cross-search | `find_items`, `deep_search`, `deep_read`, `deep_expand` |
| OpenAI Apps SDK | `search`, `fetch` |

Read-only tools are annotated with `readOnlyHint: true` so safe-mode
agents can execute them without write confirmation.

## Output format

Every tool returns an MCP `CallToolResult` of shape
`{ content: [{ type: "text", text: <string> }] }`. The `text` payload
format depends on the tool family — agents must dispatch parsing
accordingly:

- **Read / list / create / update tools** (most tools, e.g.
  `read_prompt`, `search_prompts`, `list_documents`, `get_collection`,
  `update_prompt`, `add_to_collection`) return **stringified JSON**
  (pretty-printed, 2-space indent). Parse with
  `JSON.parse(result.content[0].text)` to consume.
- **Delete tools** (`delete_prompt`, `delete_document`,
  `delete_collection`) return a **plain success or no-op string**:
  `"✓ Deleted prompt <id>"` or `"<X> was already deleted (no-op)."`.
  Do not attempt to JSON-parse these.
- **Search and navigation tools** (`find_items`, `deep_search`,
  `deep_read`, `deep_expand`, `get_prompt_versions`,
  `get_document_versions`) return **human-readable markdown**
  intended for direct surface to the user. IDs needed for follow-up
  calls are embedded as bullet fields like `**chunkId:** <id>` or
  `**id:** <id>` — extract via regex when chaining calls.
- **Errors** return `"Error: <message>"` in the text block.

## Installation

```bash
npx context-repo-mcp
```

Or via Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": { "CONTEXT_REPO_API_KEY": "gm_..." }
    }
  }
}
```

Generate an API key at
https://contextrepo.com/dashboard/settings.

## Authentication

Two equivalent auth modes:

1. **API Key** (recommended for local agents): send
   `Authorization: API-Key gm_...`. Generate at
   https://contextrepo.com/dashboard/settings.
2. **OAuth 2.0** (recommended for hosted MCP clients): Clerk-issued
   bearer token. Discover via
   `https://contextrepo.com/.well-known/oauth-protected-resource/mcp`
   (RFC 9728).

The MCP server's `tools/list`, `initialize`, and `*/list` capability
methods are publicly callable, so agents can introspect this skill
before completing OAuth.

## Rate limits

Per authenticated user, sliding window:

- `scrape` family: 10 requests / 60s
- `api` family: 100 requests / 60s
- `readonly` family: 120 requests / 60s

Honor `Retry-After` headers on 429 responses.

## Examples

### Find and use a saved prompt

User input: *"find my code review prompt and use it for this PR"*

```
1. Call find_items(query="code review")
2. Parse JSON from content[0].text → extract prompt id from results
3. Call read_prompt(promptId=<id>)
4. Parse JSON from content[0].text → use returned `content` field as
   the system message for the PR review.
```

### Save a new reusable prompt

User input: *"save this as my standard bug triage prompt"*

```
1. Call create_prompt(
     title="Bug triage",
     description="Standard bug triage workflow",
     content=<the prompt body>,
     engine="claude-3"
   )
2. Parse JSON from content[0].text → confirm new prompt id to user.
```

### Navigate a large document hierarchically

User input: *"summarize chapter 5 of my onboarding doc"*

```
1. Call deep_search(query="chapter 5 onboarding")
   → returns markdown listing chunks; extract chunkId via
     `**chunkId:** <id>` line.
2. Call deep_read(chunkId=<id>)
   → returns markdown chunk detail with hierarchy.
3. Call deep_expand(chunkId=<id>, direction="down")
   → returns child chunks for the full chapter.
4. Synthesize summary from concatenated chunk content.
```

## Documentation

- Full MCP guide: https://contextrepo.com/docs/mcp-server
- Tool reference: https://contextrepo.com/docs/mcp-server/tools-reference
- Integration guides:
  - Claude Desktop: https://contextrepo.com/docs/integrations/claude-desktop
  - Cursor: https://contextrepo.com/docs/integrations/cursor
  - ChatGPT Apps: https://contextrepo.com/chatgpt-app

## Support

- Issues: https://github.com/Gitmaxd/context-repo-mcp/issues
- Email: support@contextrepo.com
- Status: https://contextrepo.com/status
