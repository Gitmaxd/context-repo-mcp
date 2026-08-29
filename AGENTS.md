<coding_guidelines>
# context-repo-mcp

This package is the official network-dependent stdio bridge to the hosted
Context Repo MCP at `https://contextrepo.com/mcp`.

## Architecture

```text
stdio MCP client
  -> src/index.js
  -> src/bridge.js
  -> https://contextrepo.com/mcp
```

- `src/config.js` resolves and validates environment configuration.
- `src/index.js` frames newline-delimited stdin, dispatches concurrently, and
  writes JSON-RPC responses to stdout.
- `src/bridge.js` performs one opaque HTTP POST and classifies the response.

The hosted MCP is the only owner of tools, prompts, resources, schemas,
business errors, and output shapes. Do not add local registrations, REST
dispatch, formatters, or Context Repo business behavior.

## Build and test

```bash
npm install
npm test
npm ls --all
npm pack --dry-run
```

- Package manager: npm
- Runtime: Node.js 18 or later
- Modules: ES modules
- Tests: built-in `node:test`
- Dependencies: none

Tests must use injected `fetch` or loopback servers bound to `127.0.0.1`.
Automated tests must not call `contextrepo.com` or require a real API key.

## Transport invariants

- Send the exact input line as the HTTP body.
- Relay valid hosted JSON-RPC text without parsing and reserializing it.
- Preserve `content`, `structuredContent`, `_meta`, and unknown fields.
- Append only the terminating LF on stdout.
- Keep stdout JSON-only; diagnostics belong on stderr.
- Never log keys, authorization headers, request bodies, response bodies,
  stack traces, filesystem paths, or raw network errors.
- Do not retry POST requests.
- Use `redirect: "error"` and the 30-second abort timeout.
- Treat SSE, multiline JSON, malformed JSON, and non-JSON responses as
  failures. Do not add an SSE parser.

## Configuration

- `CONTEXTREPO_API_KEY`: canonical API key.
- `CONTEXT_REPO_API_KEY`: deprecated compatibility alias.
- `CONTEXTREPO_MCP_URL`: development/test MCP endpoint override.
- Default endpoint: `https://contextrepo.com/mcp`.

The npm bridge does not implement OAuth. OAuth-capable clients should connect
directly to the hosted endpoint.

## Release checklist

1. Run `npm test`.
2. Run the suite on Node 18, 20, and 22.
3. Test the exact `npm pack` tarball with `test/packed-bin.test.js`.
4. Confirm the tarball contains no tests, fixtures, secrets, or environment
   files.
5. Keep the published artifact identical to the tested artifact.

The rollback target is `2.2.4`. Do not unpublish v3.
</coding_guidelines>
