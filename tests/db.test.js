import assert from "node:assert/strict";
import { test } from "node:test";
import neo4j from "neo4j-driver";
import { CONFIG } from "../dist/config/config.js";
import { MemoryGraph } from "../dist/lib/graph.js";

function fakeDatabase(values) {
  let statement;
  let parameters;
  return {
    database: {
      read(work) {
        return work({
          run(query, queryParameters) {
            statement = query;
            parameters = queryParameters;
            return {
              records: values.map((action) => ({
                get: (key) =>
                  ({
                    id: "attempt-1",
                    repository: "repo",
                    taskId: "task-1",
                    checkResult: "unverified",
                    action,
                    affectedFiles: [],
                    evidenceReferences: [],
                  })[key] ?? null,
              })),
            };
          },
        });
      },
    },
    statement: () => statement,
    parameters: () => parameters,
  };
}

test("bounds structured recall rows and serialized output size", async () => {
  const maxRows = CONFIG.neo4j.maxReadRows;
  const byRows = fakeDatabase(
    Array.from({ length: maxRows + 1 }, () => "action"),
  );
  const rows = await new MemoryGraph(byRows.database).recall({
    repository: "repo",
    taskId: "task-1",
  });
  assert.ok(neo4j.isInt(byRows.parameters().rowLimit));
  assert.equal(byRows.parameters().rowLimit.toNumber(), maxRows + 1);
  assert.match(byRows.statement(), /workspaceId: \$workspaceId/);
  assert.match(byRows.statement(), /LIMIT \$rowLimit/);
  assert.equal(rows.attempts.length, maxRows);
  assert.equal(rows.truncated, true);

  const maxBytes = CONFIG.neo4j.maxReadResponseBytes;
  const byBytes = fakeDatabase(["x".repeat(maxBytes)]);
  const large = await new MemoryGraph(byBytes.database).recall({
    repository: "repo",
    taskId: "task-1",
  });
  assert.deepEqual(large.attempts, []);
  assert.equal(large.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(large)) <= maxBytes);

  const input = { repository: "repo", taskId: "task-1" };
  const emptyAction = await new MemoryGraph(fakeDatabase([""]).database).recall(
    input,
  );
  const available = maxBytes - Buffer.byteLength(JSON.stringify(emptyAction));
  for (const extra of [0, 1]) {
    const boundary = await new MemoryGraph(
      fakeDatabase(["x".repeat(available + extra)]).database,
    ).recall(input);
    assert.equal(boundary.attempts.length, extra === 0 ? 1 : 0);
    assert.equal(boundary.truncated, extra === 1);
    assert.ok(Buffer.byteLength(JSON.stringify(boundary)) <= 512_000);
  }
});

test("recall validates repository, task, and limit before reading", async () => {
  const graph = new MemoryGraph({
    read: () => assert.fail("must not read"),
  });
  for (const input of [
    { cypher: "MATCH (n) RETURN n" },
    { repository: "repo" },
    {
      repository: "repo",
      taskId: "task",
      limit: CONFIG.neo4j.maxReadRows + 1,
    },
    { repository: "repo", taskId: "task", limit: 0 },
  ]) {
    await assert.rejects(graph.recall(input));
  }
});
