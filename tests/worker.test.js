import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
test("Worker serves the MCP endpoint without authentication", {
  timeout: 30_000,
}, async () => {
  const port = await freePort();
  const server = spawn(
    process.execPath,
    [wrangler, "dev", "--ip", "127.0.0.1", "--port", String(port)],
    { stdio: "ignore" },
  );
  const origin = `http://127.0.0.1:${port}`;

  try {
    await waitForWorker(server, origin);

    const get = await fetch(`${origin}/mcp`);
    assert.equal(get.status, 405);
    assert.equal(get.headers.get("allow"), "POST");

    const initialize = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "anonymous-test", version: "1.0.0" },
        },
      }),
    });
    assert.equal(initialize.status, 200);
    assert.equal((await initialize.json()).result.serverInfo.name, "mentis-4j");

    const unknownRoute = await fetch(`${origin}/`);
    assert.equal(unknownRoute.status, 404);
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
  }
});

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForWorker(server, origin) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("Wrangler exited before ready");
    try {
      const response = await fetch(`${origin}/mcp`);
      if (response.status === 405) return response;
    } catch {
      // Wrangler is still starting.
    }
    await delay(200);
  }
  throw new Error("Wrangler did not start in time");
}
