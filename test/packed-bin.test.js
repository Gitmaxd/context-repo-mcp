import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const tarballArgument = process.argv[2];

if (!tarballArgument) {
  test("packed binary smoke requires an explicit tarball", { skip: true }, () => {});
} else {
  test("installed tarball bridges MCP messages without changing results", async (t) => {
    const tarball = resolve(tarballArgument);
    const installDirectory = mkdtempSync(join(tmpdir(), "context-repo-mcp-"));
    t.after(() => rmSync(installDirectory, { recursive: true, force: true }));

    execFileSync(
      process.env.npm_execpath || "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
      { cwd: installDirectory, stdio: "ignore" },
    );

    const preservationResult =
      '{"content":[{"type":"text","text":"packed\\nresult"}],"structuredContent":{"deep":{"cursor":"opaque"},"large":900719925474099312345},"_meta":{"source":"packed"},"unknown":{"kept":true}}';
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8").on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const message = JSON.parse(body);
        if (message.method === "notifications/initialized") {
          response.writeHead(202);
          response.end();
          return;
        }

        let result = "{}";
        if (message.method === "initialize") {
          result = '{"protocolVersion":"test","capabilities":{}}';
        } else if (message.method === "tools/list") {
          result = '{"tools":[{"name":"hosted_fixture"}]}';
        } else if (message.method === "tools/call") {
          result = preservationResult;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          `{"jsonrpc":"2.0","id":${JSON.stringify(message.id)},"result":${result}}`,
        );
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => server.close());
    const { port } = server.address();

    const binDirectory = join(installDirectory, "node_modules", ".bin");
    const child = spawn("context-repo-mcp", [], {
      env: {
        ...process.env,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
        CONTEXTREPO_API_KEY: "gm_packed_test",
        CONTEXTREPO_MCP_URL: `http://127.0.0.1:${port}/mcp`,
      },
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

    child.stdin.end(
      [
        '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
        '{"jsonrpc":"2.0","method":"notifications/initialized"}',
        '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}',
        '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"opaque","arguments":{}}}',
      ].join("\n") + "\n",
    );

    const timer = setTimeout(() => child.kill(), 5_000);
    const [code, signal] = await exit;
    clearTimeout(timer);

    assert.equal(signal, null);
    assert.equal(code, 0);
    assert.equal(stderr, "");
    const responses = stdout.trimEnd().split("\n");
    assert.equal(responses.length, 3);
    const byId = new Map(responses.map((line) => [JSON.parse(line).id, line]));
    assert.ok(byId.has(1));
    assert.ok(byId.has(2));
    assert.equal(
      byId.get(3),
      `{"jsonrpc":"2.0","id":3,"result":${preservationResult}}`,
    );
  });
}
