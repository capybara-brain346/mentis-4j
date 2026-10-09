import assert from "node:assert/strict";
import { test } from "node:test";
import { registerTools } from "../dist/lib/tools.js";

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
