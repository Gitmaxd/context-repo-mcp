# Architecture

Architectural decisions, patterns discovered, and design notes.

**What belongs here:** Structural decisions, patterns, anti-patterns, module relationships.

---

## Server Architecture

Single-file MCP server (`src/index.js`):

1. **Configuration** (top): env vars, headers, API key validation
2. **apiRequest()**: shared HTTP client for all API calls (auth auto-attached)
3. **Server instance**: `new Server({ name: "context-repo", version })` with tools + resources capabilities
4. **TOOLS array**: JSON Schema tool definitions (name, description, inputSchema)
5. **Request handlers**: `ListToolsRequestSchema` returns TOOLS, `CallToolRequestSchema` dispatches via switch/case
6. **main()**: startup, transport connection

## Patterns

- **Tool definition**: Plain JSON Schema in TOOLS array (NOT Zod schemas)
- **Handler pattern**: `case "tool_name": { ... apiRequest() ... return { content: [{ type: "text", text }] } }`
- **Error handling**: Try/catch wrapper around switch, returns `{ isError: true }` on failure
- **API response unwrapping**: Different endpoints use different data shapes — always check the `data` wrapper
- **Logging**: `console.error()` only (stderr, required by MCP stdio transport)

## PD API Response Shapes

- Search: `{ data: { results: [...], meta: { query, totalResults, latencyMs } } }`
- Expand: `{ data: { chunks: [...] } }`
- Read: `{ data: { chunkId, content, level, hierarchy: {...}, metadata: {...} } }`
- Session: `{ data: { sessionId, createdAt, expiresAt } }`

## Field Name Mapping

- Search results use `chunkId` natively
- Expand chunks use `_id` (Convex convention) — must map to `chunkId` in formatted output
