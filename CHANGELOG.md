# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
