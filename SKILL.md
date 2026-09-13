---
name: context-repo-mcp
description: >
  Search, retrieve, version, and persist prompts, documents, and collections
  through the hosted Context Repo MCP. Use this skill whenever the user
  mentions Context Repo, saved prompts, prompt templates, stored documents,
  collections, semantic search, hierarchical document navigation, cited
  answers over stored documents, or revision-safe document writes.
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
shapes. Call `tools/list`, `prompts/list`, and `resources/list` to discover the
active surface rather than relying on a static inventory in this skill.

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

- Use `find_items` to locate prompts, documents, or collections. It is the
  semantic search path that includes prompts.
- Use `deep_search` -> `deep_read` -> `deep_expand` for passage-level retrieval
  and hierarchical navigation inside document content.
- Use `reason` when the user wants one best-effort synthesized answer over
  stored document content. Preserve its inline citations and report its
  non-exhaustive limitations. It is read-only, uses document content only, and
  does not search prompts or persist its answer.
- Use `search` and `fetch` only for the OpenAI Apps SDK Company Knowledge
  compatibility workflow.
- Read before updating or deleting stored content.
- Treat create, update, restore, collection membership, and delete calls as
  writes that require user intent.
- Follow IDs and cursors from typed output when chaining calls.

## Revision-safe document writes

- Before `update_document` or `restore_document_version`, call `get_document`
  and use its current numeric `revision` as the required `expectedRevision`.
  The latest successful document acknowledgement can supply the next revision
  for a subsequent write without another read.
- For restore, pass the current document revision, not the target version
  number returned by `get_document_versions`.
- Each update or restore performs one atomic write with no hidden preflight
  read or retry.
- On `REVISION_MISMATCH`, call `get_document` again. If the intended state is
  already present, stop. Otherwise, reconcile the requested change with the
  latest document and retry using the returned revision.
- Documents using `lease_required` managed editing must use the REST
  coordination workflow. MCP does not accept lease IDs, lease fences, or
  idempotency keys.

## Documentation

- MCP guide: https://contextrepo.com/docs/mcp-server
- Status: https://contextrepo.com/status
- Support: support@contextrepo.com
