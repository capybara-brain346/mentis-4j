import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CONFIG,
  parseEnvironment,
  parseStdioEnvironment,
} from "../dist/config/config.js";

test("deployment URLs use the configured public backend origin", () => {
  const backend = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const frontend = JSON.parse(
    readFileSync(
      new URL("../frontend/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  );
  const origin = new URL(CONFIG.worker.publicBaseUrl);

  assert.equal(origin.protocol, "https:");
  assert.equal(origin.origin, CONFIG.worker.publicBaseUrl);
  assert.equal(backend.vars.PUBLIC_BASE_URL, origin.origin);
  assert.equal(frontend.vars.MENTIS_BACKEND_URL, origin.origin);
  assert.equal(frontend.vars.FRONTEND_BASE_URL, backend.vars.FRONTEND_BASE_URL);
  assert.deepEqual(backend.routes, [
    { pattern: origin.hostname, custom_domain: true },
  ]);
});

test("parses and validates environment configuration centrally", () => {
  const config = parseEnvironment({ NEO4J_PASSWORD: " local-password " });

  assert.equal(config.NEO4J_PASSWORD, "local-password");
  assert.equal(config.LOG_LEVEL, "debug");
  assert.equal(
    parseStdioEnvironment({
      NEO4J_USERNAME: " cloud-user ",
      NEO4J_PASSWORD: "password",
    }).NEO4J_USERNAME,
    "cloud-user",
  );
  assert.equal(
    parseStdioEnvironment({ NEO4J_PASSWORD: "password" }).NEO4J_USERNAME ??
      CONFIG.neo4j.username,
    "neo4j",
  );
  assert.equal(CONFIG.neo4j.defaultUri, "bolt://127.0.0.1:7687");
  assert.throws(
    () => parseEnvironment({ NEO4J_PASSWORD: "  " }),
    /NEO4J_PASSWORD is required/,
  );
  assert.throws(() => parseStdioEnvironment({}), /NEO4J_PASSWORD is required/);
  assert.throws(() => parseEnvironment({ LOG_LEVEL: "trace" }));
});
