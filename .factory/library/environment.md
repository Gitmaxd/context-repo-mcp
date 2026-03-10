# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONTEXTREPO_API_KEY` | Yes | — | API key for Context Repo (must start with `gm_`) |
| `CONTEXTREPO_API_URL` | No | `https://api.contextrepo.com` | Override API base URL |

## Dependencies

- Node.js >= 18.0.0
- `@modelcontextprotocol/sdk` ^1.17.0
- `zod` ^3.25.0 (SDK dependency, not used directly)
- `vitest` (dev dependency, added by this mission)

## Notes

- This is an ESM project (`"type": "module"` in package.json). Use `import` syntax only.
- The server uses stdio transport (stdin/stdout for MCP protocol, stderr for logging).
- No `.env` file exists or is needed — env vars are set by the MCP client configuration.
