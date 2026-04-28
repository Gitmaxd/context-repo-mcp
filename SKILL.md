---
name: context-repo-mcp
description: Search, retrieve, version, and persist AI prompt templates, documents, and collections via the Context Repo MCP server.
version: 1.5.4
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
  - knowledge
  - rag
  - context
  - claude
  - cursor
  - factory
  - chatgpt-apps
---

## What this skill does

Connects an AI agent or coding assistant to a **Context Repo** account
(https://contextrepo.com) so the agent can:

- **Find prompts by name or topic** with semantic and literal search.
- **Retrieve versioned prompt templates** with full history.
- **Persist new prompts or documents** so they can be reused across
  every MCP-compatible tool (Claude Desktop, Cursor, ChatGPT Apps,
  Factory Droid, Windsurf, VS Code, etc.).
- **Navigate large documents** via hierarchical chunk APIs
  (`deep_search` -> `deep_read` -> `deep_expand`).

The skill exposes **28 MCP tools** under one server connection.

## When to invoke this skill

Trigger this skill when the agent's task includes phrases like:

- "find my prompt for ..."
- "use the system prompt I saved as ..."
- "save this as a reusable prompt"
- "search my context repo for ..."
- "what prompts do I have about ..."
- "version this prompt"
- "share this prompt with my Cursor / Claude / ChatGPT setup"

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

## Tool inventory

| Category | Tools |
|---|---|
| User | `get_user_info` |
| Prompts | `search_prompts`, `read_prompt`, `create_prompt`, `update_prompt`, `delete_prompt`, `get_prompt_versions`, `restore_prompt_version` |
| Documents | `list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `get_document_versions`, `restore_document_version` |
| Collections | `list_collections`, `get_collection`, `create_collection`, `update_collection`, `delete_collection`, `add_to_collection`, `remove_from_collection` |
| Cross-search | `find_items`, `deep_search`, `deep_read`, `deep_expand` |
| OpenAI Apps SDK | `search`, `fetch` |

All tool names use snake_case. Read-only tools are annotated with
`readOnlyHint: true` so safe-mode agents can execute them without
write confirmation.

## Authentication

The skill supports two equivalent auth modes:

1. **API Key** (recommended for local agents): `Authorization: API-Key gm_...`
2. **OAuth 2.0** (recommended for hosted MCP clients): Clerk-issued
   bearer token. Discovery at
   `https://contextrepo.com/.well-known/oauth-protected-resource/mcp`
   (RFC 9728).

The MCP server's `tools/list`, `initialize`, and `*/list` capability
methods are publicly callable so agents can introspect the skill
before completing OAuth.

## Rate limits

Per authenticated user, sliding window:

- `scrape` family: 10 requests / 60s
- `api` family: 100 requests / 60s
- `readonly` family: 120 requests / 60s

`Retry-After` headers on 429.

## Examples

### Search and retrieve a prompt

```
> "find my code review prompt and use it for this PR"

agent calls: find_items(query="code review")
agent calls: read_prompt(promptId="kh7abc")
agent uses returned prompt body as system message
```

### Save a new template

```
> "save this as my standard bug triage prompt"

agent calls: create_prompt(
  title="Bug triage",
  description="Standard bug triage workflow",
  content="<the prompt>",
  engine="claude-3"
)
```

### Navigate a large document

```
> "summarize chapter 5 of my onboarding doc"

agent calls: deep_search(query="chapter 5 onboarding")
            -> returns chunkId
agent calls: deep_read(chunkId="...")
agent calls: deep_expand(chunkId="...", direction="down")
            -> returns child chunks for full chapter
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
