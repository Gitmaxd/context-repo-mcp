#!/usr/bin/env node

import { resolveConfig } from "./config.js";
import {
  BRIDGE_FAILURE_MESSAGE,
  forwardPayload,
  isNotification,
} from "./bridge.js";

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") {
    process.exitCode = 0;
    return;
  }
  console.error("Context Repo bridge could not write to stdout");
  process.exitCode = 1;
});

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
  let config;
  try {
    config = resolveConfig();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const inFlight = new Set();

  function dispatch(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeJson({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }

    const notification = isNotification(message);
    const work = forwardPayload(line, config)
      .then((body) => {
        if (body !== null) process.stdout.write(`${body}\n`);
      })
      .catch(() => {
        if (notification) {
          console.error(BRIDGE_FAILURE_MESSAGE);
          return;
        }
        const id =
          typeof message?.id === "string" ||
          typeof message?.id === "number" ||
          message?.id === null
            ? message.id
            : null;
        writeJson({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32000,
            message: BRIDGE_FAILURE_MESSAGE,
          },
        });
      })
      .finally(() => inFlight.delete(work));
    inFlight.add(work);
  }

  let buffered = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    buffered += chunk;
    const lines = buffered.split("\n");
    buffered = lines.pop();
    for (const rawLine of lines) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line !== "") dispatch(line);
    }
  }
  if (buffered !== "") {
    const line = buffered.endsWith("\r") ? buffered.slice(0, -1) : buffered;
    if (line !== "") dispatch(line);
  }

  await Promise.all(inFlight);
}

await main();
