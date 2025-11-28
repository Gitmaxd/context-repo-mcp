# Context Repo MCP Server

[![npm version](https://img.shields.io/npm/v/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-Click%20Here-blue)](cursor://anysphere.cursor-deeplink/mcp/install?name=context-repo&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvbnRleHQtcmVwby1tY3AiXSwiZW52Ijp7IkNPTlRFWFRSRVBPX0FQSV9LRVkiOiIifX0%3D)
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

- **Prompt Management** - Full CRUD: list, view, create, update, and delete prompts
- **Document Management** - Full CRUD: list, view, create, update, and delete documents
- **Collection Management** - Full CRUD: list, view, create, update, delete collections, plus add/remove items
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

**One-Click Install:**

[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-Click%20Here-blue)](cursor://anysphere.cursor-deeplink/mcp/install?name=context-repo&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImNvbnRleHQtcmVwby1tY3AiXSwiZW52Ijp7IkNPTlRFWFRSRVBPX0FQSV9LRVkiOiIifX0%3D)

> After clicking, open Cursor Settings → MCP and add your API key to the `CONTEXTREPO_API_KEY` environment variable.

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

## Rate Limits

| Operation | Limit |
|-----------|-------|
| Read operations | 120/minute |
| Write operations | 100/minute |

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
