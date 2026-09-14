# Context Repo MCP stdio Bridge

[![npm version](https://img.shields.io/npm/v/context-repo-mcp.svg)](https://www.npmjs.com/package/context-repo-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`context-repo-mcp` is a stateless, network-dependent transport adapter for the
hosted [Context Repo MCP](https://contextrepo.com/mcp). It lets MCP clients that
require a local stdio command or API-key authentication use the hosted service.

```text
stdio MCP client
  -> context-repo-mcp
  -> HTTPS POST https://contextrepo.com/mcp
  -> hosted Context Repo MCP
```

This package does not implement or register Context Repo tools locally. The
hosted MCP owns its tools, prompts, resources, schemas, business behavior,
errors, and result shapes. The bridge frames stdio messages, authenticates
requests, validates hosted responses, and relays accepted JSON-RPC response
text without reserializing it.

## Choose the right connection

### Remote MCP with OAuth

If your client supports remote MCP servers and OAuth, connect directly to the
hosted MCP:

```json
{
  "mcpServers": {
    "context-repo": {
      "url": "https://contextrepo.com/mcp"
    }
  }
}
```

Client configuration locations and property names vary. Consult your MCP
client's documentation when adapting this generic example.

The npm bridge does not implement OAuth, open a browser, store OAuth tokens, or
expose a callback port.

### Local stdio with an API key

If your client requires a local command or API-key setup, launch the npm
bridge:

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

Generate an API key in
[Context Repo settings](https://contextrepo.com/dashboard/settings). Keep it
in your MCP client's secret or environment configuration. Never commit it to
source control.

`CONTEXTREPO_API_KEY` is the canonical environment variable. Its value must be
a non-empty string beginning with `gm_`.

`CONTEXT_REPO_API_KEY` remains available as a deprecated compatibility alias
and emits one warning to stderr. If both names are configured, their values
must match. The alias still emits its deprecation warning when both values are
present.

## Requirements

- Node.js 18 or later
- Network access to the configured hosted MCP endpoint
- A Context Repo API key for the npm/stdio connection path

## Installation

MCP clients can run the package without installing it:

```bash
npx -y context-repo-mcp
```

Or install it globally:

```bash
npm install --global context-repo-mcp
context-repo-mcp
```

The command is normally launched and controlled by an MCP client. It reads
JSON-RPC messages from stdin and writes responses to stdout rather than
providing an interactive shell interface.

## Agent skill

This repository also distributes [`SKILL.md`](SKILL.md), reusable guidance that
teaches compatible agents when and how to use Context Repo. It covers:

- item-level search across prompts, documents, and collections;
- hierarchical search and navigation within document content;
- cited, best-effort answers over stored documents with `reason`;
- revision-safe document updates and restores with required
  `expectedRevision`; and
- the distinction between direct OAuth connections and the API-key stdio
  bridge.

The skill is installed from this GitHub repository by the Skills CLI. It is
not bundled in the npm package, and running `npx context-repo-mcp` does not
install it.

Install the skill globally for supported agents:

```bash
npx skills add Gitmaxd/context-repo-mcp --global
```

Update an existing installation after a skill change is merged:

```bash
npx skills update context-repo-mcp
```

Installing the skill does not connect an MCP client, provide credentials, or
add tools by itself. Configure either the direct hosted connection or the
stdio bridge separately, as described above. Start a new agent session if an
updated skill is not yet visible.

## Capability ownership and discovery

The npm package deliberately contains no static tool inventory. After MCP
initialization, use the protocol's listing methods, including `tools/list`,
`prompts/list`, and `resources/list`, to discover the capabilities currently
provided by the hosted server.

Hosted capabilities and business behavior can evolve without a new npm package
release. Pinning this package pins the bridge implementation, not the hosted
tool surface.

## Runtime contract

### Input framing and dispatch

- Stdin is UTF-8 with one JSON-RPC payload per non-empty line.
- LF and CRLF line endings are accepted. A final line does not require a
  trailing newline.
- Empty lines are ignored.
- Malformed JSON produces a local JSON-RPC parse error with code `-32700` and
  `id: null`; later input lines continue to be processed.
- Successfully parsed lines are dispatched independently. Multiple requests
  may be in flight, so responses can arrive out of input order and must be
  correlated by JSON-RPC ID.
- On normal stdin EOF, the process waits for all in-flight requests to finish.

### Hosted request

Each successfully parsed input line is sent exactly once as the body of an
HTTP `POST` to the configured MCP endpoint with:

```text
Authorization: API-Key <configured key>
Content-Type: application/json
Accept: application/json
User-Agent: context-repo-mcp
```

The bridge applies a 90-second timeout to `reason` tool calls and a 30-second
timeout to other hosted responses. It does not follow redirects and does not
retry failed POST requests.

### Hosted response validation

A non-empty hosted response is accepted only when all of the following are
true:

- Its media type is `application/json` or an `application/*+json` type.
- Its body is a single line with no literal carriage return or newline.
- Its body parses as a JSON-RPC 2.0 response object or a non-empty batch of
  valid JSON-RPC 2.0 response objects.
- Every response has a string, number, or `null` ID and exactly one of
  `result` or `error`. Error objects require an integer `code` and string
  `message`.

HTTP status alone does not determine success. A valid JSON-RPC result or error
is relayed even when the HTTP status is non-2xx.

After validation, the original hosted response text is written to stdout
without reserializing it; the bridge appends only the terminating LF required
by the stdio line protocol. This preserves fields such as `content`,
`structuredContent`, `_meta`, numeric text, escaping, whitespace, and unknown
future fields.

An empty successful response is accepted only for a JSON-RPC notification,
which is an object without an `id`. It produces no stdout message.

### Bridge failures

Timeouts, redirects, network failures, empty request responses, unsupported
content types, SSE, multiline bodies, malformed JSON, and invalid JSON-RPC
responses all fail closed.

- For a request, the bridge writes one JSON-RPC error using the original valid
  ID (or `null`), code `-32000`, and this stable message:
  `Context Repo bridge could not reach the hosted MCP server`.
- For a notification, the bridge writes no JSON-RPC response and emits the
  same stable message to stderr.
- Raw network errors, upstream bodies, credentials, payloads, stack traces, and
  local filesystem paths are not copied into these diagnostics.

Stdout remains JSON-RPC-only. Configuration warnings and failure diagnostics
go to stderr.

## Development endpoint override

`CONTEXTREPO_MCP_URL` overrides `https://contextrepo.com/mcp` for development
and tests. The value must be an absolute URL:

- HTTPS is required for non-loopback hosts.
- Plain HTTP is allowed only for `localhost`, `127.0.0.1`, or `[::1]`.
- Embedded usernames, passwords, and URL fragments are rejected.

The bridge sends the configured API key to this endpoint. Only use an override
you control and trust. Prefer a disposable test key when the endpoint is not
the production Context Repo service.

The removed v2 variable `CONTEXTREPO_API_URL` points to the REST API and is not
supported by this bridge.

## Troubleshooting

### The process exits immediately

The bridge validates configuration before reading stdin. Confirm
`CONTEXTREPO_API_KEY` is present, begins with `gm_`, and does not conflict with
the deprecated alias.

### The client reports a bridge failure

The stable bridge-failure message intentionally hides raw upstream details. It
can indicate a network failure, timeout, redirect, empty request response,
unsupported content type, multiline or malformed body, or invalid JSON-RPC
response.

Valid hosted JSON-RPC errors, including authentication and business errors,
are relayed unchanged. Follow the error returned by the hosted MCP when one is
available.

Check [Context Repo status](https://contextrepo.com/status) when hosted calls
are unavailable. The package has no local or offline fallback.

### The client shows a deprecation warning

Replace `CONTEXT_REPO_API_KEY` with `CONTEXTREPO_API_KEY`. If both variables
are inherited from your environment, remove the deprecated alias after
confirming the canonical variable is configured.

## Development

```bash
npm ci
npm test
npm ls --all
npm pack --dry-run
```

The project uses ES modules and the built-in `node:test` runner. It has no
runtime or development dependencies. Automated tests use injected `fetch`
implementations or loopback HTTP servers and do not require a real API key or
contact `contextrepo.com`.

Source layout:

- `src/config.js` validates environment configuration.
- `src/index.js` frames stdio input, dispatches work, and writes output.
- `src/bridge.js` sends each hosted request and validates its response.
- `test/` covers configuration, transport, process behavior, and the packed
  npm artifact.

## Migrating from v2

Version 3 replaced the duplicated local MCP implementation with this hosted
stdio bridge. It therefore requires network access, and its MCP capabilities
come from the hosted server.

- Rename `CONTEXT_REPO_API_KEY` to `CONTEXTREPO_API_KEY`.
- Replace the removed REST override `CONTEXTREPO_API_URL` with
  `CONTEXTREPO_MCP_URL` only for development or testing.
- Prefer the direct hosted OAuth connection when your MCP client supports it.

If you need a temporary v2 fallback while migrating, pin the last v2 release
explicitly:

```bash
npx -y context-repo-mcp@2.2.4
```

## Links

- [Context Repo](https://contextrepo.com)
- [Context Repo MCP documentation](https://contextrepo.com/docs/mcp)
- [npm package](https://www.npmjs.com/package/context-repo-mcp)
- [Service status](https://contextrepo.com/status)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [GitHub repository](https://github.com/Gitmaxd/context-repo-mcp)
- [Issue tracker](https://github.com/Gitmaxd/context-repo-mcp/issues)
- [Support](mailto:support@contextrepo.com)

## License

MIT, see [LICENSE](LICENSE).
