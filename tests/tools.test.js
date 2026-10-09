import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CONFIG } from "../dist/config/config.js";
import { AuraDB } from "../dist/db/auradb.js";
import { registerTools } from "../dist/lib/tools.js";

const canRun = Boolean(
  process.env.NEO4J_PASSWORD && process.env.OPENROUTER_API_KEY,
);

test("registers and dispatches attempt correction and deletion tools", async () => {
  const handlers = {};
  const correction = {
    reason: "Header auth replaced this path",
    correctedAt: "2025-02-01T00:00:00.000Z",
    latestCommit: "b7d9e1",
  };
  const graph = {
    markConclusionOutdated: async (input) => ({
      id: input.attemptId,
      outdated: correction,
    }),
    forgetAttempt: async (input) => {
      assert.deepEqual(input, { repository: "repo", attemptId: "attempt-1" });
    },
  };
  registerTools(
    { registerTool: (name, _config, handler) => (handlers[name] = handler) },
    graph,
  );

  assert.deepEqual(Object.keys(handlers).sort(), [
    "forget_attempt",
    "mark_conclusion_outdated",
    "recall",
    "record_attempt",
    "search",
  ]);
  const marked = await handlers.mark_conclusion_outdated({
    repository: "repo",
    attemptId: "attempt-1",
    reason: correction.reason,
    latestCommit: correction.latestCommit,
  });
  assert.equal(marked.structuredContent.status, "marked_outdated");
  assert.deepEqual(marked.structuredContent.outdated, correction);

  const forgotten = await handlers.forget_attempt({
    repository: "repo",
    attemptId: "attempt-1",
  });
  assert.equal(forgotten.structuredContent.forgotten, true);
});

test("search requires the caller's repository identity", () => {
  let schema;
  registerTools(
    {
      registerTool: (name, config) => {
        if (name === "search") schema = config.inputSchema;
      },
    },
    {},
  );
  assert.equal(schema.safeParse({ query: "login issue" }).success, false);
  assert.equal(
    schema.safeParse({ repository: "", query: "login issue" }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ repository: "/absolute/workdir", query: "login issue" })
      .success,
    true,
  );
});

test("tools reject workspace overrides and arbitrary recall queries", () => {
  const schemas = {};
  registerTools(
    {
      registerTool: (name, config) => (schemas[name] = config.inputSchema),
    },
    {},
  );
  const inputs = {
    search: { repository: "repo", query: "login" },
    recall: { repository: "repo", taskId: "task" },
    record_attempt: {
      repository: "repo",
      taskId: "task",
      codeContext: "test",
      action: "inspect",
      affectedFiles: ["test.js"],
      observation: "failed",
    },
    mark_conclusion_outdated: {
      repository: "repo",
      attemptId: "attempt",
      reason: "new evidence",
    },
    forget_attempt: { repository: "repo", attemptId: "attempt" },
  };
  for (const [name, input] of Object.entries(inputs)) {
    assert.equal(schemas[name].safeParse(input).success, true);
    assert.equal(
      schemas[name].safeParse({ ...input, workspaceId: "other" }).success,
      false,
    );
  }
  assert.equal(
    schemas.recall.safeParse({ ...inputs.recall, cypher: "MATCH (n) RETURN n" })
      .success,
    false,
  );
});

test("stdio tools search tasks, record attempts, and read structured history", {
  skip: !canRun,
}, async () => {
  const client = new Client({ name: "mcp-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/mcp/process/server.js"],
    env: {
      NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
      NEO4J_URI: process.env.NEO4J_URI ?? CONFIG.neo4j.defaultUri,
      NEO4J_DATABASE:
        process.env.NEO4J_DATABASE ?? CONFIG.neo4j.defaultDatabase,
      NEO4J_USERNAME: process.env.NEO4J_USERNAME ?? CONFIG.neo4j.username,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    },
  });
  const repository = `mcp-test-${randomUUID()}`;
  const attemptIds = [];
  const shared = {
    repository,
    taskId: `login-cookie-investigation-${randomUUID()}`,
    codeContext: "Vite at abc123, local HTTP",
    affectedFiles: ["src/Login.tsx"],
  };

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(({ name }) => name).sort(), [
      "forget_attempt",
      "mark_conclusion_outdated",
      "recall",
      "record_attempt",
      "search",
    ]);

    for (const attempt of [
      {
        ...shared,
        action: "Change the login redirect",
        observation: "Authentication still returns to the sign-in page",
        inference: "Cookie auth handles this route",
        check: { method: "browser test", result: "failed" },
        gitCommit: "a8c3f2",
        gitDirty: true,
      },
      {
        ...shared,
        action: "Retain the session cookie over local HTTP",
        observation: "The browser stays signed in after login",
        check: { method: "browser test", result: "passed" },
      },
      {
        ...shared,
        taskId: "new-login-investigation",
        action: "Inspect session cookie retention",
        observation: "The user is redirected to sign-in after authenticating",
      },
    ]) {
      const recorded = await client.callTool({
        name: "record_attempt",
        arguments: attempt,
      });
      assert.notEqual(recorded.isError, true);
      assert.equal(recorded.structuredContent.status, "recorded");
      assert.equal(recorded.structuredContent.recorded, true);
      attemptIds.push(recorded.structuredContent.attempt.id);
    }

    const marked = await client.callTool({
      name: "mark_conclusion_outdated",
      arguments: {
        repository,
        attemptId: attemptIds[0],
        reason: "Header-based auth replaced the cookie path",
        latestCommit: "b7d9e1",
      },
    });
    assert.notEqual(marked.isError, true);
    assert.equal(marked.structuredContent.status, "marked_outdated");
    assert.equal(
      marked.structuredContent.outdated.reason,
      "Header-based auth replaced the cookie path",
    );

    const searched = await client.callTool({
      name: "search",
      arguments: {
        repository,
        query: "users keep landing back on the login screen after signing in",
        limit: CONFIG.search.maxLimit,
      },
    });
    assert.notEqual(searched.isError, true);
    const candidates = searched.structuredContent.candidates;
    assert.ok(
      candidates.every(
        ({ relevanceScore }) =>
          relevanceScore === null || Number.isFinite(relevanceScore),
      ),
    );
    assert.ok(candidates.some(({ taskId }) => taskId === shared.taskId));
    assert.ok(
      candidates.every((candidate) => candidate.repository === repository),
    );
    assert.equal(
      candidates.filter(({ taskId }) => taskId === shared.taskId).length,
      1,
    );

    assert.ok(
      candidates.every(
        ({ matchedAttemptId, outdated }) =>
          typeof matchedAttemptId === "string" &&
          (outdated === null || typeof outdated.reason === "string"),
      ),
    );

    const forgotten = await client.callTool({
      name: "forget_attempt",
      arguments: { repository, attemptId: attemptIds[1] },
    });
    assert.notEqual(forgotten.isError, true);
    assert.equal(forgotten.structuredContent.forgotten, true);

    const recalled = await client.callTool({
      name: "recall",
      arguments: { repository, taskId: shared.taskId },
    });
    assert.notEqual(recalled.isError, true);
    const recalledJson = JSON.parse(recalled.content[0].text);
    assert.equal(recalled.structuredContent.status, "ok");
    assert.equal(recalledJson.attempts.length, 1);
    const [recalledRow] = recalledJson.attempts;
    assert.equal(recalledRow.check.result, "failed");
    assert.equal(recalledRow.inference, "Cookie auth handles this route");
    assert.equal(
      recalledRow.outdated.reason,
      "Header-based auth replaced the cookie path",
    );
    assert.equal(recalledJson.truncated, false);

    const arbitraryCypher = await client.callTool({
      name: "recall",
      arguments: {
        repository,
        taskId: shared.taskId,
        cypher: "MATCH (n) RETURN n",
      },
    });
    assert.equal(arbitraryCypher.isError, true);
    const workspaceOverride = await client.callTool({
      name: "recall",
      arguments: { repository, taskId: shared.taskId, workspaceId: "other" },
    });
    assert.equal(workspaceOverride.isError, true);

    const invalid = await client.callTool({
      name: "recall",
      arguments: { parameters: {} },
    });
    assert.equal(invalid.isError, true);
    assert.match(invalid.content[0].text, /Input validation error/);

    const missingRepository = await client.callTool({
      name: "search",
      arguments: { query: "login issue" },
    });
    assert.equal(missingRepository.isError, true);
    assert.match(missingRepository.content[0].text, /Input validation error/);

    const invalidLimit = await client.callTool({
      name: "search",
      arguments: {
        repository,
        query: "login issue",
        limit: CONFIG.search.maxLimit + 1,
      },
    });
    assert.equal(invalidLimit.isError, true);
  } finally {
    await client.close();
    const database = new AuraDB({
      uri: process.env.NEO4J_URI ?? CONFIG.neo4j.defaultUri,
      username: process.env.NEO4J_USERNAME ?? CONFIG.neo4j.username,
      password: process.env.NEO4J_PASSWORD,
      database: process.env.NEO4J_DATABASE ?? CONFIG.neo4j.defaultDatabase,
      workspaceId: "local",
    });
    try {
      await database.writeTx((tx) =>
        tx.run(
          "MATCH (:Repository {workspaceId: $workspaceId, identity: $repository})-[:HAS_TASK]->(:Task {workspaceId: $workspaceId})-[:HAS_ATTEMPT]->(a:Attempt {workspaceId: $workspaceId}) DETACH DELETE a",
          { repository },
        ),
      );
      await database.writeTx((tx) =>
        tx.run(
          "MATCH (t:Task {workspaceId: $workspaceId, repositoryIdentity: $repository}) DETACH DELETE t",
          { repository },
        ),
      );
      await database.writeTx((tx) =>
        tx.run(
          "MATCH (r:Repository {workspaceId: $workspaceId, identity: $repository}) DETACH DELETE r",
          { repository },
        ),
      );
    } finally {
      await database.close();
    }
  }
});
