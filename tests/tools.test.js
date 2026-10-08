import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
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

test(
  "stdio tools search tasks, record attempts, and run agent-authored recall",
  { skip: !canRun },
  async () => {
    const client = new Client({ name: "mcp-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/process/server.js"],
      env: {
        NEO4J_PASSWORD: process.env.NEO4J_PASSWORD,
        NEO4J_URI: process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687",
        NEO4J_DATABASE: process.env.NEO4J_DATABASE ?? "neo4j",
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      },
    });
    const repository = `mcp-test-${randomUUID()}`;
    const attemptIds = [];
    const shared = {
      repository,
      taskId: "login-cookie-investigation",
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
          limit: 20,
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
        arguments: {
          cypher: `MATCH (t:Task {identity: $taskId, repositoryIdentity: $repository})-[:HAS_ATTEMPT]->(a:Attempt)
                   RETURN t.identity AS taskId, a.action AS action, a.checkResult AS result,
                          a.inference AS inference, a.outdatedReason AS outdatedReason
                   ORDER BY a.recordedAt`,
          parameters: { taskId: shared.taskId, repository },
        },
      });
      assert.notEqual(recalled.isError, true);
      assert.equal(recalled.structuredContent, undefined);
      assert.equal(recalled.content.length, 1);
      const recalledJson = JSON.parse(recalled.content[0].text);
      assert.deepEqual(Object.keys(recalledJson).sort(), [
        "columns",
        "rows",
        "truncated",
        "truncationReason",
      ]);
      assert.deepEqual(
        [...recalledJson.columns].sort(),
        ["taskId", "action", "result", "inference", "outdatedReason"].sort(),
      );
      assert.equal(recalledJson.rows.length, 1);
      const recalledRow = Object.fromEntries(
        recalledJson.columns.map((column, index) => [
          column,
          recalledJson.rows[0][index],
        ]),
      );
      assert.equal(recalledRow.result, "failed");
      assert.equal(recalledRow.inference, "Cookie auth handles this route");
      assert.equal(
        recalledRow.outdatedReason,
        "Header-based auth replaced the cookie path",
      );
      assert.equal(recalledJson.truncated, false);
      assert.equal(recalledJson.truncationReason, null);

      const boundedResult = await client.callTool({
        name: "recall",
        arguments: { cypher: "UNWIND range(1, 110) AS n RETURN n AS value" },
      });
      assert.notEqual(boundedResult.isError, true);
      assert.equal(boundedResult.structuredContent, undefined);
      const bounded = JSON.parse(boundedResult.content[0].text);
      assert.equal(bounded.rows.length, 100);
      assert.equal(bounded.truncated, true);
      assert.equal(bounded.truncationReason, "row_limit");

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
        arguments: { repository, query: "login issue", limit: 1000 },
      });
      assert.equal(invalidLimit.isError, true);
    } finally {
      await client.close();
    }
  },
);
