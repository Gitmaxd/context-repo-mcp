import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { test } from "node:test";

const BIN = fileURLToPath(new URL("../src/index.js", import.meta.url));

async function listen(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    server,
    url: `http://127.0.0.1:${port}/mcp`,
  };
}

async function runBin({ input = "", chunks, env = {}, unset = [] }) {
  const childEnv = { ...process.env, ...env };
  for (const name of unset) delete childEnv[name];
  const child = spawn(process.execPath, [BIN], {
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exit = once(child, "exit");
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  if (chunks) {
    for (const chunk of chunks) {
      child.stdin.write(chunk);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    child.stdin.end();
  } else {
    child.stdin.end(input);
  }

  const timer = setTimeout(() => child.kill(), 2_000);
  const [code, signal] = await exit;
  clearTimeout(timer);
  return { code, signal, stdout, stderr };
}

async function withRelayServer(t, responseLine, run) {
  const requests = [];
  const { server, url } = await listen((request, response) => {
    let body = "";
    request.setEncoding("utf8").on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(body);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(responseLine);
    });
  });
  t.after(() => server.close());
  const result = await run(url);
  return { requests, result };
}

test("posts an opaque initialize line to hosted MCP and relays its response", async (t) => {
  const requestLine =
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"opaque":true}}';
  const responseLine =
    '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"test"}}';
  let received;
  const { server, url } = await listen((request, response) => {
    let body = "";
    request.setEncoding("utf8").on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received = {
        method: request.method,
        headers: request.headers,
        body,
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(responseLine);
    });
  });
  t.after(() => server.close());

  const result = await runBin({
    input: `${requestLine}\n`,
    env: {
      CONTEXTREPO_API_KEY: "gm_test",
      CONTEXTREPO_MCP_URL: url,
    },
  });

  assert.equal(result.signal, null);
  assert.equal(result.code, 0);
  assert.equal(received.method, "POST");
  assert.equal(received.body, requestLine);
  assert.equal(received.headers.authorization, "API-Key gm_test");
  assert.equal(received.headers["content-type"], "application/json");
  assert.equal(received.headers.accept, "application/json");
  assert.equal(result.stdout, `${responseLine}\n`);
});

test("writes no startup banner to stdout", async (t) => {
  const responseLine = '{"jsonrpc":"2.0","id":2,"result":{}}';
  const { result } = await withRelayServer(t, responseLine, (url) =>
    runBin({
      input: '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n',
      env: { CONTEXTREPO_API_KEY: "gm_test", CONTEXTREPO_MCP_URL: url },
    }),
  );
  assert.equal(result.stdout, `${responseLine}\n`);
});

test("missing configuration exits nonzero before reading stdin", async () => {
  const result = await runBin({
    unset: ["CONTEXTREPO_API_KEY", "CONTEXT_REPO_API_KEY"],
  });
  assert.notEqual(result.code, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /CONTEXTREPO_API_KEY/);
});

for (const [name, input] of [
  ["blank lines", '\n\r\n{"jsonrpc":"2.0","id":3,"method":"tools/list"}\n\n'],
  ["CRLF input", '{"jsonrpc":"2.0","id":3,"method":"tools/list"}\r\n'],
  ["a final line without LF", '{"jsonrpc":"2.0","id":3,"method":"tools/list"}'],
]) {
  test(`supports ${name}`, async (t) => {
    const responseLine = '{"jsonrpc":"2.0","id":3,"result":{}}';
    const { requests, result } = await withRelayServer(t, responseLine, (url) =>
      runBin({
        input,
        env: { CONTEXTREPO_API_KEY: "gm_test", CONTEXTREPO_MCP_URL: url },
      }),
    );
    assert.deepEqual(requests, [
      '{"jsonrpc":"2.0","id":3,"method":"tools/list"}',
    ]);
    assert.equal(result.stdout, `${responseLine}\n`);
  });
}

test("returns a parse error and continues after malformed JSON", async (t) => {
  const responseLine = '{"jsonrpc":"2.0","id":4,"result":{"ok":true}}';
  const { requests, result } = await withRelayServer(t, responseLine, (url) =>
    runBin({
      input: 'not-json\n{"jsonrpc":"2.0","id":4,"method":"tools/list"}\n',
      env: { CONTEXTREPO_API_KEY: "gm_test", CONTEXTREPO_MCP_URL: url },
    }),
  );
  assert.deepEqual(requests, [
    '{"jsonrpc":"2.0","id":4,"method":"tools/list"}',
  ]);
  const lines = result.stdout.trimEnd().split("\n").map(JSON.parse);
  assert.deepEqual(lines[0], {
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: "Parse error" },
  });
  assert.deepEqual(lines[1], JSON.parse(responseLine));
  assert.equal(result.code, 0);
});

test("notification failures emit no JSON-RPC response", async (t) => {
  const { server, url } = await listen((_request, response) => {
    response.writeHead(500, { "content-type": "text/html" });
    response.end("<html>upstream failure</html>");
  });
  t.after(() => server.close());

  const result = await runBin({
    input: '{"jsonrpc":"2.0","method":"notifications/example"}\n',
    env: { CONTEXTREPO_API_KEY: "gm_secret", CONTEXTREPO_MCP_URL: url },
  });
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /could not reach the hosted MCP server/);
  assert.doesNotMatch(result.stderr, /gm_secret|upstream failure|<html>/);
});

test("request failures emit one stable bridge error with the original ID", async (t) => {
  const { server, url } = await listen((_request, response) => {
    response.writeHead(401, { "content-type": "text/html" });
    response.end("<html>gm_submitted_secret</html>");
  });
  t.after(() => server.close());

  const result = await runBin({
    input: '{"jsonrpc":"2.0","id":"safe-id","method":"tools/call"}\n',
    env: {
      CONTEXTREPO_API_KEY: "gm_submitted_secret",
      CONTEXTREPO_MCP_URL: url,
    },
  });
  assert.deepEqual(JSON.parse(result.stdout), {
    jsonrpc: "2.0",
    id: "safe-id",
    error: {
      code: -32000,
      message: "Context Repo bridge could not reach the hosted MCP server",
    },
  });
  assert.doesNotMatch(result.stdout + result.stderr, /gm_submitted_secret|<html>/);
});

test("concurrent responses may finish in reverse order and retain IDs", async (t) => {
  const { server, url } = await listen((request, response) => {
    let body = "";
    request.setEncoding("utf8").on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const { id } = JSON.parse(body);
      setTimeout(
        () => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(`{"jsonrpc":"2.0","id":${id},"result":{}}`);
        },
        id === 1 ? 60 : 5,
      );
    });
  });
  t.after(() => server.close());

  const result = await runBin({
    input:
      '{"jsonrpc":"2.0","id":1,"method":"slow"}\n' +
      '{"jsonrpc":"2.0","id":2,"method":"fast"}\n',
    env: { CONTEXTREPO_API_KEY: "gm_test", CONTEXTREPO_MCP_URL: url },
  });
  assert.deepEqual(
    result.stdout.trimEnd().split("\n").map((line) => JSON.parse(line).id),
    [2, 1],
  );
});

test("split stdin chunks do not split a logical line", async (t) => {
  const responseLine = '{"jsonrpc":"2.0","id":14,"result":{}}';
  const { requests, result } = await withRelayServer(t, responseLine, (url) =>
    runBin({
      chunks: [
        '{"jsonrpc":"2.0","id":14,',
        '"method":"tools/',
        'list"}\n',
      ],
      env: { CONTEXTREPO_API_KEY: "gm_test", CONTEXTREPO_MCP_URL: url },
    }),
  );
  assert.deepEqual(requests, [
    '{"jsonrpc":"2.0","id":14,"method":"tools/list"}',
  ]);
  assert.equal(result.stdout, `${responseLine}\n`);
});

test("waits for in-flight work before normal EOF shutdown", async (t) => {
  const responseLine = '{"jsonrpc":"2.0","id":15,"result":{"done":true}}';
  const { server, url } = await listen((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(responseLine);
    }, 75);
  });
  t.after(() => server.close());

  const result = await runBin({
    input: '{"jsonrpc":"2.0","id":15,"method":"slow"}\n',
    env: { CONTEXTREPO_API_KEY: "gm_test", CONTEXTREPO_MCP_URL: url },
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, `${responseLine}\n`);
});

test("a closed stdout pipe does not expose a stack trace or local path", async (t) => {
  const { server, url } = await listen((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"jsonrpc":"2.0","id":16,"result":{}}');
    }, 20);
  });
  t.after(() => server.close());

  const child = spawn(process.execPath, [BIN], {
    env: {
      ...process.env,
      CONTEXTREPO_API_KEY: "gm_test",
      CONTEXTREPO_MCP_URL: url,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exit = once(child, "exit");
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdout.destroy();
  child.stdin.end('{"jsonrpc":"2.0","id":16,"method":"example"}\n');

  const timer = setTimeout(() => child.kill(), 2_000);
  const [code, signal] = await exit;
  clearTimeout(timer);
  assert.equal(signal, null);
  assert.equal(code, 0);
  assert.equal(stderr, "");
});
