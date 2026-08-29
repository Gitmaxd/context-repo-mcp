import assert from "node:assert/strict";
import { test } from "node:test";

import { forwardPayload } from "../src/bridge.js";

const config = {
  apiKey: "gm_test",
  mcpUrl: "https://example.test/mcp",
};

function jsonResponse(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("sends the exact hosted request contract", async () => {
  const payload = '{"jsonrpc":"2.0","id":1,"method":"example","params":{}}';
  let call;
  const fetchImpl = async (...args) => {
    call = args;
    return jsonResponse('{"jsonrpc":"2.0","id":1,"result":{}}');
  };

  await forwardPayload(payload, config, { fetchImpl });

  assert.equal(call[0], config.mcpUrl);
  assert.equal(call[1].method, "POST");
  assert.deepEqual(call[1].headers, {
    Authorization: "API-Key gm_test",
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "context-repo-mcp",
  });
  assert.equal(call[1].redirect, "error");
  assert.equal(call[1].body, payload);
  assert.ok(call[1].signal instanceof AbortSignal);
});

test("returns no stdio payload for an empty 202 notification response", async () => {
  const result = await forwardPayload(
    '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    config,
    {
      fetchImpl: async () =>
        new Response(null, {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
    },
  );
  assert.equal(result, null);
});

test("rejects an empty 202 response to a JSON-RPC request", async () => {
  await assert.rejects(
    forwardPayload(
      '{"jsonrpc":"2.0","id":18,"method":"tools/list","params":{}}',
      config,
      {
        fetchImpl: async () =>
          new Response(null, {
            status: 202,
            headers: { "content-type": "application/json" },
          }),
      },
    ),
    /^Error: Context Repo bridge could not reach the hosted MCP server$/,
  );
});

test("relays a hosted JSON-RPC error unchanged", async () => {
  const body =
    '{"jsonrpc":"2.0","id":"request-1","error":{"code":-32601,"message":"No such method"}}';
  const result = await forwardPayload(
    '{"jsonrpc":"2.0","id":"request-1","method":"unknown"}',
    config,
    {
      fetchImpl: async () => jsonResponse(body, { status: 404 }),
    },
  );
  assert.equal(result, body);
});

test("preserves content, structuredContent, metadata, unknown fields, and bytes", async () => {
  const hostedResponseText =
    '{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"héllo\\n世界"},{"type":"image","data":"opaque","mimeType":"image/png"}],"structuredContent":{"deep":{"array":[1,{"cursor":"next_opaque"}]},"large":900719925474099312345},"_meta":{"trace":"abc"},"futureField":{"nested":true}},"futureTopLevel":"preserve"}';
  const result = await forwardPayload(
    '{"jsonrpc":"2.0","id":7,"method":"tools/call"}',
    config,
    {
      fetchImpl: async () => jsonResponse(hostedResponseText),
    },
  );
  assert.equal(result, hostedResponseText);
  assert.equal(`${result}\n`, `${hostedResponseText}\n`);
});

test("does not parse and reserialize a valid hosted response", async () => {
  const body =
    '{ "jsonrpc" : "2.0", "id" : 9, "result" : { "escaped" : "\\u0061" } }';
  const result = await forwardPayload(
    '{"jsonrpc":"2.0","id":9,"method":"example"}',
    config,
    { fetchImpl: async () => jsonResponse(body) },
  );
  assert.equal(result, body);
});

test("does not retry a failed POST", async () => {
  let calls = 0;
  await assert.rejects(
    forwardPayload('{"jsonrpc":"2.0","id":10,"method":"write"}', config, {
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      },
    }),
    /hosted MCP server/,
  );
  assert.equal(calls, 1);
});

test("times out the complete response and emits no late result", async () => {
  let lateResolutionAttempted = false;
  const fetchImpl = async (_url, options) => ({
    status: 200,
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    text: () =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
        setTimeout(() => {
          lateResolutionAttempted = true;
          resolve('{"jsonrpc":"2.0","id":11,"result":{"late":true}}');
        }, 40);
      }),
  });

  await assert.rejects(
    forwardPayload('{"jsonrpc":"2.0","id":11,"method":"slow"}', config, {
      fetchImpl,
      timeoutMs: 10,
    }),
    /^Error: Context Repo bridge could not reach the hosted MCP server$/,
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(lateResolutionAttempted, true);
});

test("does not retry redirect or network failures and exposes no raw error", async () => {
  for (const rawError of [
    "redirect mode is set to error",
    "getaddrinfo ENOTFOUND private-host",
  ]) {
    let calls = 0;
    await assert.rejects(
      forwardPayload('{"jsonrpc":"2.0","id":12,"method":"example"}', config, {
        fetchImpl: async () => {
          calls += 1;
          throw new TypeError(rawError);
        },
      }),
      (error) => {
        assert.equal(
          error.message,
          "Context Repo bridge could not reach the hosted MCP server",
        );
        assert.doesNotMatch(error.message, /redirect|ENOTFOUND|private-host/);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

for (const [name, body, contentType] of [
  ["HTML", "<html>gm_submitted_secret</html>", "text/html"],
  ["plain text", "upstream failed", "text/plain"],
  ["malformed JSON", '{"jsonrpc":', "application/json"],
  [
    "multiline JSON",
    '{\n"jsonrpc":"2.0","id":13,"result":{}}',
    "application/json",
  ],
  [
    "SSE",
    'event: message\ndata: {"jsonrpc":"2.0","id":13,"result":{}}\n\n',
    "text/event-stream",
  ],
]) {
  test(`rejects ${name} without copying the upstream body`, async () => {
    await assert.rejects(
      forwardPayload('{"jsonrpc":"2.0","id":13,"method":"example"}', config, {
        fetchImpl: async () =>
          new Response(body, {
            status: 401,
            headers: { "content-type": contentType },
          }),
      }),
      (error) => {
        assert.equal(
          error.message,
          "Context Repo bridge could not reach the hosted MCP server",
        );
        assert.doesNotMatch(error.message, /gm_submitted_secret|upstream failed/);
        return true;
      },
    );
  });
}

test("allows an empty successful notification response", async () => {
  const result = await forwardPayload(
    '{"jsonrpc":"2.0","method":"notifications/example"}',
    config,
    {
      fetchImpl: async () => new Response(null, { status: 204 }),
    },
  );
  assert.equal(result, null);
});

for (const [name, body] of [
  ["missing response ID", '{"jsonrpc":"2.0","result":{}}'],
  [
    "both result and error",
    '{"jsonrpc":"2.0","id":17,"result":{},"error":{"code":-32000,"message":"bad"}}',
  ],
  [
    "malformed error object",
    '{"jsonrpc":"2.0","id":17,"error":{"code":"bad","message":7}}',
  ],
  [
    "nested batch response",
    '[[{"jsonrpc":"2.0","id":17,"result":{}}]]',
  ],
]) {
  test(`rejects a JSON-RPC response with ${name}`, async () => {
    await assert.rejects(
      forwardPayload('{"jsonrpc":"2.0","id":17,"method":"example"}', config, {
        fetchImpl: async () => jsonResponse(body),
      }),
      /Context Repo bridge could not reach the hosted MCP server/,
    );
  });
}
