import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const server = fileURLToPath(
  new URL("../dist/process/server.js", import.meta.url),
);

test("server loads .env before configuring Neo4j", () => {
  const cwd = mkdtempSync(join(tmpdir(), "mentis-env-"));
  try {
    writeFileSync(
      join(cwd, ".env"),
      "NEO4J_PASSWORD=local-password\nNEO4J_URI=invalid://host\n",
    );
    const { stderr, status } = spawnSync(process.execPath, [server], {
      cwd,
      env: { PATH: process.env.PATH },
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(status, 1);
    assert.match(stderr, /Unknown scheme: invalid/);
    assert.doesNotMatch(stderr, /NEO4J_PASSWORD is required/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
