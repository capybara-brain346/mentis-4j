import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIG,
  parseEnvironment,
  parseStdioEnvironment,
} from "../dist/config/config.js";

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
