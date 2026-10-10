import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { CONFIG, PUBLIC_CONFIG } from "../dist/config/config.js";
import {
  parseEnvironment,
  parsePositiveIntegerEnvironment,
} from "../dist/config/environment.js";

test("local environment examples use matching backend and frontend origins", () => {
  const backend = parseEnv(
    readFileSync(
      new URL("../.env.development.example", import.meta.url),
      "utf8",
    ),
  );
  const frontend = parseEnv(
    readFileSync(
      new URL("../frontend/.env.development.example", import.meta.url),
      "utf8",
    ),
  );
  const worker = JSON.parse(
    readFileSync(
      new URL("../frontend/wrangler.jsonc", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(backend.PUBLIC_BASE_URL, frontend.MENTIS_BACKEND_URL);
  assert.equal(
    backend.PUBLIC_BASE_URL,
    frontend.NEXT_PUBLIC_MENTIS_BACKEND_URL,
  );
  assert.equal(backend.FRONTEND_BASE_URL, frontend.FRONTEND_BASE_URL);
  assert.equal(
    worker.env.development.vars.MENTIS_BACKEND_URL,
    frontend.MENTIS_BACKEND_URL,
  );
  assert.equal(
    worker.env.development.vars.FRONTEND_BASE_URL,
    frontend.FRONTEND_BASE_URL,
  );
  assert.equal(new URL(backend.PUBLIC_BASE_URL).hostname, "localhost");
  assert.equal(new URL(backend.FRONTEND_BASE_URL).hostname, "localhost");
  assert.equal(backend.NEO4J_URI, CONFIG.neo4j.defaultUri);
  assert.equal(backend.NEO4J_USERNAME, CONFIG.neo4j.username);
  assert.equal(backend.NEO4J_DATABASE, CONFIG.neo4j.defaultDatabase);
});

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
  assert.deepEqual(PUBLIC_CONFIG.worker, CONFIG.worker);
});

test("frontend public URL follows its environment without changing the Worker default", () => {
  const configModule = new URL("../dist/config/config.js", import.meta.url)
    .href;
  const frontend = parseEnv(
    readFileSync(
      new URL("../frontend/.env.development.example", import.meta.url),
      "utf8",
    ),
  );
  const script = `
    import { PUBLIC_CONFIG } from ${JSON.stringify(configModule)};
    console.log(JSON.stringify(PUBLIC_CONFIG));
  `;

  for (const value of [undefined, frontend.NEXT_PUBLIC_MENTIS_BACKEND_URL]) {
    const env = { PATH: process.env.PATH };
    if (value) env.NEXT_PUBLIC_MENTIS_BACKEND_URL = value;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", script],
      { env, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(result.stdout);
    assert.equal(config.worker.publicBaseUrl, CONFIG.worker.publicBaseUrl);
    assert.equal(
      config.frontend.backendBaseUrl,
      value ?? CONFIG.worker.publicBaseUrl,
    );
  }
});

test("parses and validates environment configuration centrally", () => {
  const config = parseEnvironment({ NEO4J_PASSWORD: " local-password " });

  assert.equal(config.NEO4J_PASSWORD, "local-password");
  assert.equal(config.LOG_LEVEL, "debug");
  assert.equal(CONFIG.neo4j.defaultUri, "bolt://127.0.0.1:7687");
  assert.equal(CONFIG.google.issuer, "https://accounts.google.com");
  assert.equal(CONFIG.oauth.accessTokenTtlSeconds, 600);
  assert.equal(CONFIG.oauth.refreshTokenTtlSeconds, 604_800);
  assert.equal(CONFIG.oauth.pendingTransactionTtlSeconds, 600);
  assert.equal(CONFIG.oauth.grantPageLimit, 1_000);
  assert.equal(CONFIG.frontend.defaultBaseUrl, "http://127.0.0.1:6969");
  assert.equal(CONFIG.frontend.authProxyRequestTimeoutMs, 15_000);
  assert.equal(CONFIG.frontend.authProxyMaxBodyBytes, 4_096);
  assert.throws(
    () => parseEnvironment({ NEO4J_PASSWORD: "  " }),
    /NEO4J_PASSWORD is required/,
  );
  assert.throws(() => parseEnvironment({ LOG_LEVEL: "trace" }));
});

test("validates required positive integer environment values", () => {
  assert.equal(parsePositiveIntegerEnvironment(" 3600 ", "SESSION_TTL"), 3600);
  assert.throws(
    () => parsePositiveIntegerEnvironment(undefined, "SESSION_TTL"),
    /SESSION_TTL is required/,
  );
  for (const value of ["0", "-1", "1.5", "invalid"]) {
    assert.throws(
      () => parsePositiveIntegerEnvironment(value, "SESSION_TTL"),
      /SESSION_TTL must be a positive integer/,
    );
  }
});
