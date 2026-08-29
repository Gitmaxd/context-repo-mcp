import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveConfig } from "../src/config.js";

const SECRET_A = "gm_secret_a";
const SECRET_B = "gm_secret_b";

function resolve(env) {
  const warnings = [];
  const config = resolveConfig(env, (message) => warnings.push(message));
  return { config, warnings };
}

test("accepts the canonical API key and exact default endpoint", () => {
  const { config, warnings } = resolve({ CONTEXTREPO_API_KEY: SECRET_A });
  assert.equal(config.apiKey, SECRET_A);
  assert.equal(config.mcpUrl, "https://contextrepo.com/mcp");
  assert.deepEqual(warnings, []);
});

test("accepts the compatibility alias with one deprecation warning", () => {
  const { config, warnings } = resolve({ CONTEXT_REPO_API_KEY: SECRET_A });
  assert.equal(config.apiKey, SECRET_A);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /CONTEXT_REPO_API_KEY.*deprecated/i);
});

test("accepts equal dual values with one deprecation warning", () => {
  const { config, warnings } = resolve({
    CONTEXTREPO_API_KEY: SECRET_A,
    CONTEXT_REPO_API_KEY: SECRET_A,
  });
  assert.equal(config.apiKey, SECRET_A);
  assert.equal(warnings.length, 1);
});

test("rejects conflicting dual values without exposing either value", () => {
  assert.throws(
    () =>
      resolve({
        CONTEXTREPO_API_KEY: SECRET_A,
        CONTEXT_REPO_API_KEY: SECRET_B,
      }),
    (error) => {
      assert.match(error.message, /CONTEXTREPO_API_KEY/);
      assert.match(error.message, /CONTEXT_REPO_API_KEY/);
      assert.doesNotMatch(error.message, new RegExp(`${SECRET_A}|${SECRET_B}`));
      return true;
    },
  );
});

for (const [name, env] of [
  ["missing", {}],
  ["empty", { CONTEXTREPO_API_KEY: "" }],
  ["wrong prefix", { CONTEXTREPO_API_KEY: "not-a-key" }],
]) {
  test(`rejects a ${name} API key`, () => {
    assert.throws(() => resolve(env), /CONTEXTREPO_API_KEY/);
  });
}

test("an invalid compatibility alias error names the alias", () => {
  assert.throws(
    () => resolve({ CONTEXT_REPO_API_KEY: "invalid" }),
    /CONTEXT_REPO_API_KEY/,
  );
});

for (const url of [
  "https://example.test/custom-mcp",
  "http://localhost:3000/mcp",
  "http://127.0.0.1:3000/mcp",
  "http://[::1]:3000/mcp",
]) {
  test(`accepts endpoint override ${url}`, () => {
    const { config } = resolve({
      CONTEXTREPO_API_KEY: SECRET_A,
      CONTEXTREPO_MCP_URL: url,
    });
    assert.equal(config.mcpUrl, url);
  });
}

for (const [name, url] of [
  ["non-loopback HTTP", "http://example.test/mcp"],
  ["username", "https://user@example.test/mcp"],
  ["password", "https://user:pass@example.test/mcp"],
  ["fragment", "https://example.test/mcp#secret"],
  ["malformed URL", "not a url"],
]) {
  test(`rejects endpoint override with ${name}`, () => {
    assert.throws(
      () =>
        resolve({
          CONTEXTREPO_API_KEY: SECRET_A,
          CONTEXTREPO_MCP_URL: url,
        }),
      /CONTEXTREPO_MCP_URL/,
    );
  });
}

test("configuration diagnostics never expose key values", () => {
  for (const env of [
    { CONTEXTREPO_API_KEY: SECRET_A, CONTEXT_REPO_API_KEY: SECRET_B },
    { CONTEXTREPO_API_KEY: "invalid-secret" },
  ]) {
    try {
      resolve(env);
      assert.fail("expected configuration to fail");
    } catch (error) {
      assert.doesNotMatch(error.message, /secret/);
    }
  }
});
