# Context Repo MCP stdio Bridge

[![npm version](https://img.shields.io/npm/v/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`context-repo-mcp` is a network-dependent stdio bridge to the hosted
[Context Repo MCP](https://contextrepo.com/mcp). It lets stdio-only and
API-key-oriented MCP clients use the hosted service without duplicating its
tools or business logic in this npm package.

```text
stdio MCP client
  -> context-repo-mcp
  -> HTTPS POST https://contextrepo.com/mcp
  -> hosted Context Repo MCP
```

The hosted MCP defines all tools, prompts, resources, errors, and output
shapes. The bridge forwards newline-delimited JSON-RPC messages and relays
hosted JSON-RPC responses without reconstructing them. Result fields including
both `content` and `structuredContent` pass through unchanged.

## Choose the right connection

### Remote MCP with OAuth

OAuth-capable clients should connect directly to the hosted MCP:

```json
{
  "mcpServers": {
    "context-repo": {
      "url": "https://contextrepo.com/mcp"
    }
  }
}
```

The npm bridge does not implement OAuth, open a browser, store OAuth tokens, or
expose a callback port.

### stdio with an API key

Clients that require a local command or API-key setup can launch the bridge:

```json
{
  "mcpServers": {
    "context-repo": {
      "command": "npx",
      "args": ["-y", "context-repo-mcp"],
      "env": {
        "CONTEXTREPO_API_KEY": "gm_your_api_key"
      }
    }
  }
}
```

Generate an API key from
[Context Repo settings](https://contextrepo.com/dashboard/settings). The
canonical environment variable is `CONTEXTREPO_API_KEY`.
`CONTEXT_REPO_API_KEY` is accepted only as a deprecated compatibility alias
and emits one warning to stderr.

## Requirements

- Node.js 18 or later
- Network access to `https://contextrepo.com/mcp`
- A Context Repo API key for the stdio bridge path

## Installation

Run without installing:

```bash
npx -y context-repo-mcp
```

Or install globally:

```bash
npm install --global context-repo-mcp
context-repo-mcp
```

## Runtime behavior

- Reads one JSON-RPC payload per non-empty stdin line.
- Posts the original payload to the hosted MCP with
  `Authorization: API-Key gm_...`.
- Writes each hosted JSON-RPC response as one stdout line.
- Allows concurrent requests to finish out of order using JSON-RPC IDs.
- Writes diagnostics only to stderr and never logs keys or payloads.
- Uses a 30-second timeout, does not follow redirects, and does not retry.
- Requires JSON responses. SSE or malformed upstream responses fail closed.

Because the hosted MCP owns its protocol surface, use `tools/list`,
`prompts/list`, and `resources/list` to discover the current capabilities
rather than relying on a package-side inventory.

## Development endpoint override

`CONTEXTREPO_MCP_URL` overrides the hosted endpoint for development and tests.
It must be an absolute HTTPS URL. Plain HTTP is allowed only for `localhost`,
`127.0.0.1`, or `[::1]`.

The removed v2 variable `CONTEXTREPO_API_URL` points at the REST API and is not
supported by the bridge.

## Troubleshooting

### Configuration failure

Confirm that the key begins with `gm_` and that only the canonical variable is
configured:

```bash
CONTEXTREPO_API_KEY=gm_your_api_key npx -y context-repo-mcp
```

If both API-key variables are configured, their values must match.

### Remote clients

Do not launch this package for a client that supports remote MCP and OAuth.
Configure `https://contextrepo.com/mcp` directly instead.

### Service availability

The bridge has no local or offline implementation. Check
[Context Repo status](https://contextrepo.com/status) if hosted calls fail.

## Development

```bash
npm install
npm test
npm pack --dry-run
```

Tests use loopback HTTP servers and do not require a real API key.

## Rollback

The documented v2 rollback version is `2.2.4`. Release operators can restore
that version to the npm `latest` dist-tag without unpublishing v3.

## Links

- [Context Repo](https://contextrepo.com)
- [MCP documentation](https://modelcontextprotocol.io/)
- [GitHub repository](https://github.com/Gitmaxd/context-repo-mcp)
- [Issue tracker](https://github.com/Gitmaxd/context-repo-mcp/issues)

## License

MIT, see [LICENSE](LICENSE).
