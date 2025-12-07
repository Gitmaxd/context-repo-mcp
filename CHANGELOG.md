# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
