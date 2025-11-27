# Context Repo MCP Server

[![npm version](https://badge.fury.io/js/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP (Model Context Protocol) server that enables [Claude Desktop](https://claude.ai/download) to interact with your [Context Repo](https://contextrepo.com) prompts, documents, and collections.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io/) is an open standard by Anthropic that allows AI assistants to securely connect to external data sources and tools. This server lets Claude Desktop manage your Context Repo content directly.

## Features

- **Prompt Management** - List, view, create, update, and delete prompts
- **Document Management** - List, view, and create documents
- **Collection Browsing** - List and search your collections
- **Secure Authentication** - API key-based authentication

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- [Claude Desktop](https://claude.ai/download)
- [Context Repo](https://contextrepo.com) account with an API key

## Installation

### Option 1: Install globally from npm

```bash
npm install -g context-repo-mcp
```

### Option 2: Run directly with npx

No installation needed - configure Claude Desktop to use `npx` (see below).

## Getting an API Key

1. Sign in to [Context Repo](https://contextrepo.com)
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Select permissions:
   - `prompts.read` - For prompt management
   - `documents.read` - For document and collection access
5. Copy the key (starts with `gm_`)

## Claude Desktop Configuration

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

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

### Using global installation

If you installed globally, use `node` directly:

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "context-repo-mcp",
      "env": {
        "CONTEXTREPO_API_KEY": "gm_your_api_key_here"
      }
    }
  }
}
```

After editing, **restart Claude Desktop completely** (Cmd+Q on macOS, Alt+F4 on Windows).

## Verify Connection

1. Open Claude Desktop
2. Look for the MCP indicator (hammer icon) in the bottom-right of the input box
3. Click it to see "context-repo" with a green status

## Available Tools

Once connected, Claude can use these tools:

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

## Example Prompts for Claude

Try these after connecting:

```
"List all my prompts"
"Search for prompts about code review"
"Create a prompt called 'Bug Report' for documenting software bugs"
"Show me the details of prompt [ID]"
"What collections do I have?"
"List documents in collection [ID]"
```

## Troubleshooting

### Server not appearing in Claude Desktop

1. Verify your config JSON is valid: `python3 -m json.tool < config.json`
2. Ensure you completely restarted Claude Desktop
3. Check logs: `tail -f ~/Library/Logs/Claude/mcp*.log` (macOS)

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
- [Claude Desktop](https://claude.ai/download)
