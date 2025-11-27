# Context Repo MCP Server

[![npm version](https://badge.fury.io/js/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
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

- **Prompt Management** - List, view, create, update, and delete prompts
- **Document Management** - List, view, and create documents
- **Collection Browsing** - List and search your collections
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

**macOS:** Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** Edit `%APPDATA%\Claude\claude_desktop_config.json`

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

After editing, restart the application completely.

### Cursor IDE

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

| Tool | Description |
|------|-------------|
| `list_prompts` | List prompts with optional search |
| `get_prompt` | Get full prompt details by ID |
| `create_prompt` | Create a new prompt |
| `update_prompt` | Update an existing prompt |
| `delete_prompt` | Delete a prompt |
| `list_collections` | List your collections |
| `list_documents` | List documents (optionally by collection) |
| `get_document` | Get full document content |
| `create_document` | Create a new document |

## Example Usage

Try these commands with your MCP client:

```
"List all my prompts"
"Search for prompts about code review"
"Create a prompt called 'Bug Report' for documenting software bugs"
"Show me the details of prompt [ID]"
"What collections do I have?"
"List documents in collection [ID]"
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
