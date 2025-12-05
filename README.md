# Context Repo MCP Server

[![npm version](https://img.shields.io/npm/v/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
[![Claude Desktop Extension](https://img.shields.io/badge/Claude%20Desktop-Extension-purple)](https://github.com/Gitmaxd/context-repo-mcp/releases)
[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-One%20Click-blue)](https://contextrepo.com/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP (Model Context Protocol) server that enables any MCP-compatible client to interact with your [Context Repo](https://contextrepo.com) prompts, documents, and collections.

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
- **Prompt Management** - Full CRUD: list, view, create, update, and delete prompts
- **Document Management** - Full CRUD: list, view, create, update, and delete documents
- **Collection Management** - Full CRUD: list, view, create, update, delete collections, plus add/remove items
- **Secure Authentication** - API key-based authentication

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- An MCP-compatible client application
- [Context Repo](https://contextrepo.com) account with an API key

## Installation

### Claude Desktop Extension (One-Click Install)

The easiest way to use Context Repo with Claude Desktop:

1. **Download** the latest `.mcpb` file from [Releases](https://github.com/Gitmaxd/context-repo-mcp/releases)
2. **Install** using one of these methods:
   - **Double-click** the `.mcpb` file to open Claude Desktop's install dialog
   - **Drag and drop** the file into Claude Desktop window
   - **File menu:** Developer → Extensions → Install Extension → select the file
3. **Enter your API key** when prompted (get one at [contextrepo.com/dashboard](https://contextrepo.com/dashboard))
4. **Done!** Start using Context Repo in any conversation

> The extension securely stores your API key in your system's credential manager.

---

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

### Prompts

| Tool | Description |
|------|-------------|
| `list_prompts` | List prompts with optional search |
| `get_prompt` | Get full prompt details by ID |
| `create_prompt` | Create a new prompt template |
| `update_prompt` | Update an existing prompt |
| `delete_prompt` | Permanently delete a prompt |

### Documents

| Tool | Description |
|------|-------------|
| `list_documents` | List documents (optionally filtered by collection) |
| `get_document` | Get full document content by ID |
| `create_document` | Create a new document |
| `update_document` | Update an existing document |
| `delete_document` | Permanently delete a document |

### Collections

| Tool | Description |
|------|-------------|
| `list_collections` | List all collections with optional search |
| `get_collection` | Get collection details (optionally include items) |
| `create_collection` | Create a new collection |
| `update_collection` | Update collection metadata |
| `delete_collection` | Delete a collection (items are preserved) |
| `add_to_collection` | Add documents or prompts to a collection |
| `remove_from_collection` | Remove items from a collection |

### Search

| Tool | Description |
|------|-------------|
| `search_context_repo` | Semantic search across all prompts, documents, and collections |

## Semantic Search

The `search_context_repo` tool enables natural language search across your entire Context Repo. Instead of requiring exact keyword matches, it understands the meaning of your query.

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
```

### Documents
```
"List all my documents"
"Show me document [ID]"
"Create a document called 'Meeting Notes' with today's discussion"
"Update the title of document [ID]"
"Delete document [ID]"
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
CONTEXTREPO_API_KEY=gm_your_key npm start
```

## License

MIT - see [LICENSE](LICENSE)

## Links

- [Context Repo](https://contextrepo.com)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [GitHub Repository](https://github.com/Gitmaxd/context-repo-mcp)
