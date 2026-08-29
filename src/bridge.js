export const BRIDGE_FAILURE_MESSAGE =
  "Context Repo bridge could not reach the hosted MCP server";

function isJsonContentType(value) {
  const mediaType = value?.split(";", 1)[0].trim().toLowerCase();
  return /^application\/(?:[\w.-]+\+)?json$/.test(mediaType ?? "");
}

function isJsonRpcResponseObject(value) {
  const hasResult =
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "result");
  const hasError =
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "error");
  const validId =
    value !== null &&
    typeof value === "object" &&
    Object.hasOwn(value, "id") &&
    (typeof value.id === "string" ||
      typeof value.id === "number" ||
      value.id === null);
  const validError =
    !hasError ||
    (value.error !== null &&
      typeof value.error === "object" &&
      Number.isInteger(value.error.code) &&
      typeof value.error.message === "string");
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.jsonrpc === "2.0" &&
    validId &&
    hasResult !== hasError &&
    validError
  );
}

function isJsonRpcResponse(value) {
  return Array.isArray(value)
    ? value.length > 0 && value.every(isJsonRpcResponseObject)
    : isJsonRpcResponseObject(value);
}

function bridgeFailure() {
  return new Error(BRIDGE_FAILURE_MESSAGE);
}

export function isNotification(value) {
  return (
    !Array.isArray(value) &&
    value !== null &&
    typeof value === "object" &&
    !Object.hasOwn(value, "id")
  );
}

export async function forwardPayload(
  payload,
  config,
  { fetchImpl = fetch, timeoutMs = 30_000 } = {},
) {
  const input = JSON.parse(payload);
  const notification = isNotification(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let body;
  try {
    response = await fetchImpl(config.mcpUrl, {
      method: "POST",
      headers: {
        Authorization: `API-Key ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "context-repo-mcp",
      },
      redirect: "error",
      body: payload,
      signal: controller.signal,
    });
    body = await response.text();
  } catch {
    throw bridgeFailure();
  } finally {
    clearTimeout(timeout);
  }

  if (body === "") {
    if (response.status === 202 || (response.ok && notification)) return null;
    throw bridgeFailure();
  }

  if (
    !isJsonContentType(response.headers.get("content-type")) ||
    body.includes("\n") ||
    body.includes("\r")
  ) {
    throw bridgeFailure();
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw bridgeFailure();
  }
  if (!isJsonRpcResponse(parsed)) throw bridgeFailure();

  return body;
}
