# Context Repo MCP Server

[![npm version](https://img.shields.io/npm/v/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-One%20Click-blue)](https://contextrepo.com/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP (Model Context Protocol) server that enables any MCP-compatible client to interact with your [Context Repo](https://contextrepo.com) prompts, documents, and collections — with progressive disclosure search for hierarchical document navigation.

## Compatible MCP Clients

This server works with any MCP-compatible application, including:

- **[Claude Desktop](https://claude.ai/download)** - Anthropic's desktop app
- **[Cursor IDE](https://cursor.sh)** - AI-powered code editor
- **[Factory Droid CLI](https://factory.ai)** - AI coding agent
- Any other application supporting the [Model Context Protocol](https://modelcontextprotocol.io/)

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard that allows AI assistants to securely connect to external data sources and tools. This server enables MCP clients to manage your Context Repo content directly.

## Features

- **Semantic Search** - Natural language search across all your content with AI-powered relevance matching
- **Prompt Management** - Full CRUD with version history: list, view, create, update, delete, and restore prompts
- **Document Management** - Full CRUD with version history: list, view, create, update, delete, and restore documents
- **Collection Management** - Full CRUD: list, view, create, update, delete collections, plus add/remove items
- **Version History** - View and restore previous versions of prompts and documents
- **Progressive Disclosure Search** - Hierarchical document search with 3-level chunking (document → section → paragraph) and directional navigation
- **Secure Authentication** - API key-based authentication

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- An MCP-compatible client application
- [Context Repo](https://contextrepo.com) account with an API key

## Installation

### Option 1: Install globally from npm

```bash
npm install -g context-repo-mcp
```

### Option 2: Run directly with npx

No installation needed - configure your MCP client to use `npx` (see configuration examples below).

## Getting an API Key

1. Sign in to [Context Repo](https://contextrepo.com)
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Select permissions:
   - `prompts.read` - For prompt management
   - `documents.read` - For document and collection access
5. Copy the key (starts with `gm_`)

## Client Configuration

### Claude Desktop

#### Step 1: Locate the Configuration File

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

#### Step 2: Open the Configuration File

**macOS:**
```bash
# Open in your default editor
open -e "$HOME/Library/Application Support/Claude/claude_desktop_config.json"

# Or create it if it doesn't exist
mkdir -p "$HOME/Library/Application Support/Claude"
touch "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

**Windows:**
Navigate to `%APPDATA%\Claude\` in File Explorer and open or create `claude_desktop_config.json`.

#### Step 3: Add the Context Repo Server

Add the `context-repo` entry to your `mcpServers` object:

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": {
        "CONTEXTREPO_API_KEY": "gm_your_api_key_here"
      }
    }
  }
}
```

If you already have other MCP servers configured, add `context-repo` alongside them:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": ["..."]
    },
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": {
        "CONTEXTREPO_API_KEY": "gm_your_api_key_here"
      }
    }
  }
}
```

#### Step 4: Restart Claude Desktop

**macOS:** Press `Cmd+Q` to fully quit, then reopen Claude Desktop.

**Windows:** Press `Alt+F4` or right-click the system tray icon and quit, then reopen.

#### Step 5: Verify Connection

1. Open a new conversation in Claude Desktop
2. Look for the MCP tools indicator (hammer icon 🔨) in the bottom-right of the input box
3. Click it to see "context-repo" listed with a green status

### Cursor IDE

**One-Click Install:** Visit [contextrepo.com/mcp-server](https://contextrepo.com/mcp-server) and click the "Install to Cursor" button.

**Manual Configuration:**

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": {
        "CONTEXTREPO_API_KEY": "gm_your_api_key_here"
      }
    }
  }
}
```

### Factory.ai Droid CLI

Factory's Droid CLI can auto-install MCP servers directly from a prompt. Simply paste this into any Droid session:

```
Install the following MCP Server to Droid using the NPX method.  
MCP: https://github.com/Gitmaxd/context-repo-mcp
API Key: <YOUR CONTEXT REPO API KEY>
```

Replace `<YOUR CONTEXT REPO API KEY>` with your actual API key (starts with `gm_`).

Droid will automatically install and configure the MCP server - no restart required.

> **Prefer manual configuration?** You can add the Context Repo MCP server directly to your Droid MCP configuration file using the same JSON format shown in the [Other MCP Clients](#other-mcp-clients) section below.

### Other MCP Clients

The general configuration pattern for any MCP client:

```json
{
  "command": "npx",
  "args": ["-y", "context-repo-mcp"],
  "env": {
    "CONTEXTREPO_API_KEY": "gm_your_api_key_here"
  }
}
```

Or if installed globally:

```json
{
  "command": "context-repo-mcp",
  "env": {
    "CONTEXTREPO_API_KEY": "gm_your_api_key_here"
  }
}
```

## Available Tools

Once connected, your MCP client can use these tools:

### Prompts (7 tools)

| Tool | Description |
|------|-------------|
| `search_prompts` | List all prompts belonging to the authenticated user with optional keyword search |
| `read_prompt` | Get full prompt details including content, variables, and engine target |
| `create_prompt` | Create a new prompt template with `${variableName}` syntax support |
| `update_prompt` | Update an existing prompt with automatic version history tracking |
| `delete_prompt` | Permanently delete a prompt and all its version history |
| `get_prompt_versions` | Get version history with change logs, timestamps, and version IDs |
| `restore_prompt_version` | Restore a prompt to a previous version (non-destructive, creates new version) |

### Documents (7 tools)

| Tool | Description |
|------|-------------|
| `list_documents` | List all documents with optional collection filter and keyword search |
| `get_document` | Get full document content, title, tags, and metadata |
| `create_document` | Create a new text or markdown document with optional tags |
| `update_document` | Update a document with automatic version history and re-indexing |
| `delete_document` | Permanently delete a document, its versions, and search index entries |
| `get_document_versions` | Get version history with change logs, timestamps, and version IDs |
| `restore_document_version` | Restore a document to a previous version with re-indexing (non-destructive) |

### Collections (7 tools)

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections with names, descriptions, item counts, and IDs |
| `get_collection` | Get collection details with optional item membership list |
| `create_collection` | Create a new collection with optional color and emoji icon |
| `update_collection` | Update collection name, description, color, or icon |
| `delete_collection` | Delete a collection (items are preserved, only the folder is removed) |
| `add_to_collection` | Add documents or prompts to a collection (items can belong to multiple) |
| `remove_from_collection` | Remove items from a collection (items themselves are not deleted) |

### Search (1 tool)

| Tool | Description |
|------|-------------|
| `find_items` | Discover prompts, documents, and collections by semantic similarity or keyword match |

### Progressive Disclosure (3 tools)

| Tool | Description |
|------|-------------|
| `deep_search` | Search within document content returning ranked, hierarchical chunks with session deduplication |
| `deep_read` | Retrieve a single chunk with full content, hierarchy metadata, and navigation IDs |
| `deep_expand` | Navigate the document hierarchy in 5 directions (up, down, next, previous, surrounding) |

## Semantic Search

The `find_items` tool enables natural language search across your entire Context Repo. Instead of requiring exact keyword matches, it understands the meaning of your query.

### How It Works

Semantic search uses AI embeddings to understand the meaning behind your query:

1. **Your query is converted** to a vector embedding (numerical representation of meaning)
2. **Content is matched** against document/prompt embeddings stored in Context Repo
3. **Results are ranked** by semantic similarity (relevance score 0-1)
4. **Collections are scored** based on the relevance of their contained items

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | Natural language search query |
| `type` | string | No | `"all"` | Filter: `"prompts"`, `"documents"`, `"collections"`, or `"all"` |
| `semantic` | boolean | No | `true` | Use semantic search. Set `false` for literal matching |

### Relevance Scoring

Results are filtered by relevance score (0.0 to 1.0):

| Score | Interpretation |
|-------|----------------|
| 0.7+ | Excellent match - highly relevant |
| 0.5-0.7 | Good match - likely relevant |
| 0.35-0.5 | Moderate match - possibly relevant |
| < 0.35 | Filtered out (below threshold) |

**Default threshold: 0.35** - Results below this score are not returned.

### Example Queries

**Finding related content:**
```
"Search for my meeting notes"
"Find prompts about code review"
"What documents do I have about API design?"
```

**Filtering by type:**
```
"Search for 'project planning' in documents only"
"Find collection with my research materials"
```

**Literal search (exact match):**
```
"Search for 'README.md' with semantic disabled"
```

### Tips for Better Results

1. **Be descriptive** - "prompts for writing technical documentation" works better than "docs"
2. **Use natural language** - Ask questions like you would to a colleague
3. **Include context** - "meeting notes from last sprint" is more precise than "notes"

## Progressive Disclosure Search

The `deep_search`, `deep_expand`, and `deep_read` tools enable hierarchical document exploration. Instead of returning whole documents, progressive disclosure returns the most specific matching chunk (paragraph, section, or document level) and lets you navigate the hierarchy around it.

### How It Works

Documents are organized into a 3-level hierarchy:

```
Document → Section → Paragraph
```

1. **Documents are chunked** into a 3-level hierarchy (document, section, paragraph)
2. **Vector search finds** the most specific matching level for your query
3. **Navigate the hierarchy** using expand directions (up, down, next, previous, surrounding)
4. **Sessions track seen chunks** for deduplication across iterative searches

### The Three-Tool Workflow

- **Step 1: `deep_search`** — Find relevant chunks matching your query
- **Step 2: `deep_expand`** — Navigate to related content (parent sections, child paragraphs, siblings)
- **Step 3: `deep_read`** — Get full details and metadata on a specific chunk

### `deep_search` Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | - | The search query for vector similarity matching |
| `limit` | number | No | 10 | Maximum number of results to return |
| `sessionId` | string | No | auto-created | Session ID for result deduplication across searches |
| `collectionId` | string | No | - | Filter results to a specific collection |
| `documentId` | string | No | - | Filter results to a specific document |

### `deep_expand` Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `chunkId` | string | Yes | - | The chunk ID to expand from (from `deep_search` or `deep_expand` results) |
| `direction` | string | Yes | - | Navigation direction: `up`, `down`, `next`, `previous`, or `surrounding` |
| `count` | number | No | server default | Number of chunks to return |

### `deep_read` Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `chunkId` | string | Yes | - | The chunk ID to read (from `deep_search` or `deep_expand` results) |

### Direction Reference

| Direction | Description |
|-----------|-------------|
| `up` | Get the parent chunk (paragraph → section → document) |
| `down` | Get child chunks (document → sections, section → paragraphs) |
| `next` | Get next sibling at the same level |
| `previous` | Get previous sibling at the same level |
| `surrounding` | Get nearby chunks for a context window |

### Auto-Session Deduplication

`deep_search` automatically creates a session on the first call. Subsequent searches within the same connection exclude previously returned chunks, enabling iterative refinement without seeing duplicate results. Providing an explicit `sessionId` overrides the auto-session behavior.

### Difference from `find_items`

| | `find_items` | `deep_search` |
|---|---|---|
| **Results** | Flat matches across prompts, documents, and collections | Hierarchical chunk results within documents |
| **Best for** | Finding which document contains something | Finding the exact paragraph or section and navigating around it |
| **Navigation** | None — returns top-level matches | Full hierarchy navigation via `deep_expand` |

### Example Queries

**Finding content:**
```
"Search for chunks about authentication"
"Find paragraphs mentioning API rate limits"
```

**Navigating:**
```
"Expand down from this section to see its paragraphs"
"Go up from this paragraph to see the full section"
```

**Deep inspection:**
```
"Read chunk [chunkId] for full details"
```

### Tips for Best Results

1. **Start with `deep_search`** then use `deep_expand` to navigate the hierarchy
2. **Use sessions for iterative refinement** — auto-created by default, so repeated searches automatically skip already-seen chunks
3. **Use `deep_read` when you need full metadata** — section path, word count, heading text, and navigation IDs
4. **Filter by `collectionId` or `documentId`** to narrow scope before searching

## Example Usage

Try these commands with your MCP client:

### Prompts
```
"List all my prompts"
"Search for prompts about code review"
"Create a prompt called 'Bug Report' for documenting software bugs"
"Show me the details of prompt [ID]"
"Update prompt [ID] with a new description"
"Delete prompt [ID]"
"Show me the version history of prompt [ID]"
"Restore prompt [ID] to version [VERSION_ID]"
```

### Documents
```
"List all my documents"
"Show me document [ID]"
"Create a document called 'Meeting Notes' with today's discussion"
"Update the title of document [ID]"
"Delete document [ID]"
"Show me the version history of document [ID]"
"Restore document [ID] to version [VERSION_ID]"
```

### Collections
```
"What collections do I have?"
"Create a collection called 'Project Alpha' with a blue color"
"Show me collection [ID] with all its items"
"Add document [ID] to collection [ID]"
"Remove prompt [ID] from collection [ID]"
"Delete collection [ID]"
```

### Search
```
"Search for documents about authentication"
"Find prompts related to code review"
"What do I have about project planning?"
"Search my collections for research materials"
```

### Progressive Disclosure
```
"Search for chunks about API authentication"
"Expand down from chunk [ID] to see child paragraphs"
"Expand up from this paragraph to see the full section"
"Read chunk [ID] for full details and hierarchy metadata"
"Search for more results about authentication" (with auto-session dedup)
```

## Troubleshooting

### Server not connecting

1. Verify your config JSON is valid
2. Ensure you completely restarted your MCP client
3. Check that Node.js 18+ is installed: `node --version`

### Authentication errors

- Verify your API key starts with `gm_`
- Check the key hasn't expired in Context Repo dashboard
- Ensure the key has required permissions

### Test manually

```bash
CONTEXTREPO_API_KEY=gm_your_key_here npx context-repo-mcp
```

You should see the startup banner. Press Ctrl+C to exit.

## Development

```bash
git clone https://github.com/Gitmaxd/context-repo-mcp.git
cd context-repo-mcp
npm install
npm test                                    # Run test suite (Vitest)
CONTEXTREPO_API_KEY=gm_your_key npm start
```

## License

MIT - see [LICENSE](LICENSE)

## Links

- [Context Repo](https://contextrepo.com)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [GitHub Repository](https://github.com/Gitmaxd/context-repo-mcp)
