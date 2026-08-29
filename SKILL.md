---
name: context-repo-mcp
description: >
  Search, retrieve, version, and persist prompts, documents, and collections
  through the hosted Context Repo MCP. Use this skill whenever the user
  mentions Context Repo, saved prompts, prompt templates, stored documents,
  collections, semantic search, or hierarchical document navigation.
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
---

# Context Repo MCP

Context Repo stores reusable prompt templates, documents, and collections.
Its hosted MCP owns the current tools, prompts, resources, errors, and output
shapes. Discover the active surface through MCP protocol listing methods
rather than a static inventory in this skill.

Tool results can contain human-readable `content`, typed
`structuredContent`, metadata, and future fields. Preserve and use both output
forms rather than parsing text when structured data is available.

## Connection choices

OAuth-capable remote MCP clients should connect directly:

```json
{
  "mcpServers": {
    "context-repo": {
      "url": "https://contextrepo.com/mcp"
    }
  }
}
```

The npm package is a network-dependent stdio bridge for clients that require a
local command or API-key setup:

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": {
        "CONTEXTREPO_API_KEY": "gm_..."
      }
    }
  }
}
```

`CONTEXTREPO_API_KEY` is canonical. `CONTEXT_REPO_API_KEY` is a deprecated
compatibility alias.

The npm bridge does not implement OAuth or any local Context Repo tools. It
forwards stdio JSON-RPC messages to `https://contextrepo.com/mcp`, so it
requires network access and Node.js 18 or later.

## Usage guidance

- Use item-level search to locate prompts, documents, or collections.
- Use document chunk search and navigation for large-document exploration.
- Read before updating or deleting stored content.
- Treat create, update, restore, collection membership, and delete calls as
  writes that require user intent.
- Follow IDs and cursors from typed output when chaining calls.

## Documentation

- MCP guide: https://contextrepo.com/docs/mcp-server
- Status: https://contextrepo.com/status
- Support: support@contextrepo.com
