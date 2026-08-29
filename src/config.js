const DEFAULT_MCP_URL = "https://contextrepo.com/mcp";

function resolveApiKey(env, warn) {
  const hasCanonical = Object.hasOwn(env, "CONTEXTREPO_API_KEY");
  const hasAlias = Object.hasOwn(env, "CONTEXT_REPO_API_KEY");
  const canonical = env.CONTEXTREPO_API_KEY;
  const alias = env.CONTEXT_REPO_API_KEY;

  if (hasCanonical && hasAlias && canonical !== alias) {
    throw new Error(
      "CONTEXTREPO_API_KEY and CONTEXT_REPO_API_KEY must contain the same value",
    );
  }

  const apiKey = hasCanonical ? canonical : alias;
  if (!hasCanonical && !hasAlias) {
    throw new Error("CONTEXTREPO_API_KEY is required");
  }
  if (typeof apiKey !== "string" || !apiKey.startsWith("gm_")) {
    const variable = hasCanonical
      ? "CONTEXTREPO_API_KEY"
      : "CONTEXT_REPO_API_KEY";
    throw new Error(`${variable} must be a non-empty value beginning with gm_`);
  }

  if (hasAlias) {
    warn("CONTEXT_REPO_API_KEY is deprecated; use CONTEXTREPO_API_KEY instead");
  }
  return apiKey;
}

function resolveMcpUrl(value) {
  if (value === undefined) return DEFAULT_MCP_URL;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CONTEXTREPO_MCP_URL must be a valid absolute URL");
  }

  if (url.username || url.password || url.hash) {
    throw new Error(
      "CONTEXTREPO_MCP_URL must not contain credentials or a fragment",
    );
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const isAllowedHttp =
    url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (url.protocol !== "https:" && !isAllowedHttp) {
    throw new Error(
      "CONTEXTREPO_MCP_URL must use HTTPS, except for loopback HTTP",
    );
  }

  return value;
}

export function resolveConfig(env = process.env, warn = console.error) {
  return {
    apiKey: resolveApiKey(env, warn),
    mcpUrl: resolveMcpUrl(env.CONTEXTREPO_MCP_URL),
  };
}
