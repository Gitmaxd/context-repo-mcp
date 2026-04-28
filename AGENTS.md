# context-repo-mcp

The official MCP (Model Context Protocol) server for
[Context Repo](https://contextrepo.com), an AI context management
platform for prompt templates, documents, and collections.

This `AGENTS.md` tells AI coding agents (Claude Code, Cursor,
Windsurf, Factory Droid, Codex, ChatGPT, etc.) how to use this MCP
server in another project.

## What this package is

Once connected to an MCP-capable client (Claude Desktop, Cursor,
Factory, ChatGPT Apps, etc.), agents can search, retrieve, version,
and persist prompts and documents in the user's Context Repo account.

## When agents should use it

Use `context-repo-mcp` when an agent needs to:

1. **Retrieve a versioned prompt template** for the current task
   (`search_prompts`, `read_prompt`, `get_prompt_versions`).
2. **Search the user's stored content** semantically or literally
   (`find_items`, `deep_search`).
3. **Persist a new prompt or document** for cross-tool reuse
   (`create_prompt`, `create_document`).
4. **Sync context across MCP clients** so the same prompt library is
   available in Claude, Cursor, ChatGPT, VS Code, Windsurf, Factory.
5. **Progressively navigate large documents** via the hierarchical
   chunk APIs (`deep_search`, `deep_read`, `deep_expand`).

## When agents should NOT use it

- It is **not a general web search engine** - it only searches the
  user's stored content.
- It is **not a high-volume vector database substitute** - storage
  limits apply per plan tier.
- It is **single-user per account** - not a multi-tenant team workspace.
- It is **not an LLM conversation history store** - prompts and
  documents are the primary storage abstractions.

## Installation

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": {
        "CONTEXT_REPO_API_KEY": "gm_..."
      }
    }
  }
}
```

### Cursor / Windsurf / Factory Droid

```bash
npx context-repo-mcp
```

### One-click installs

- Claude Desktop: https://contextrepo.com/docs/integrations/claude-desktop
- Cursor: https://contextrepo.com/docs/integrations/cursor
- ChatGPT Apps: https://contextrepo.com/chatgpt-app

## Authentication

Two equivalent auth modes:

- **API Key** (recommended for local CLI use): set
  `CONTEXT_REPO_API_KEY=gm_...` in env. Generate at
  https://contextrepo.com/dashboard/settings.
- **OAuth 2.0** (recommended for hosted clients like ChatGPT): the
  server advertises Clerk OAuth at
  `https://clerk.contextrepo.com`; discover via
  `https://contextrepo.com/.well-known/oauth-protected-resource/mcp`
  (RFC 9728).

## Tool inventory (28 tools)

All tool names use snake_case. The `tools/list` JSON-RPC method is
publicly callable without auth at
`https://contextrepo.com/mcp` so agents can introspect before
authenticating. `tools/call` requires auth.

### User
- `get_user_info`

### Prompts
- `search_prompts`, `read_prompt`, `create_prompt`, `update_prompt`,
  `delete_prompt`, `get_prompt_versions`, `restore_prompt_version`

### Documents
- `list_documents`, `get_document`, `create_document`,
  `update_document`, `delete_document`, `get_document_versions`,
  `restore_document_version`

### Collections
- `list_collections`, `get_collection`, `create_collection`,
  `update_collection`, `delete_collection`, `add_to_collection`,
  `remove_from_collection`

### Cross-cutting search
- `find_items` - item-level semantic/literal search across prompts,
  documents, collections.
- `deep_search` - chunk-level vector search inside documents.
- `deep_read` - retrieve a single document chunk by ID.
- `deep_expand` - navigate up/down/next/previous from a chunk.

### OpenAI Apps SDK Company-Knowledge pair
- `search`, `fetch`

## Coding conventions for agents working on this package

- **Package manager:** npm (this is a published library).
- **Node version:** >=18.0.0 (per `engines.node`).
- **Test runner:** Vitest (`npm test`).
- **Module type:** ES Modules (`"type": "module"`).
- **Entrypoint:** `src/index.js` (Node, plain JS — no TypeScript
  compile step).
- **Dependencies:** kept intentionally minimal — only
  `@modelcontextprotocol/sdk` and `zod`.

## Pull request checklist for agents

When proposing changes to this package:

1. Run `npm test` and verify all tests pass before opening the PR.
2. Bump the patch version with `npm version patch` if the change is
   user-visible.
3. Update the README's tool inventory if you add or remove tools.
4. Do **not** add transitive dependencies without a documented reason.
5. Match the existing JSDoc style on tool registrations.

## Reporting issues

- Bug reports / feature requests:
  https://github.com/Gitmaxd/context-repo-mcp/issues
- Security disclosures: support@contextrepo.com
- General questions: https://contextrepo.com/about

## Project home

- **Web:** https://contextrepo.com
- **Documentation:** https://contextrepo.com/docs
- **MCP server source (this repo):**
  https://github.com/Gitmaxd/context-repo-mcp
- **Status:** https://contextrepo.com/status
