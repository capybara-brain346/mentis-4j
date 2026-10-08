import assert from "node:assert/strict";
import { test } from "node:test";
import neo4j from "neo4j-driver";
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
  const byRows = fakeDatabase(Array.from({ length: 101 }, () => "action"));
  const rows = await new MemoryGraph(byRows.database).recall({
    repository: "repo",
    taskId: "task-1",
  });
  assert.ok(neo4j.isInt(byRows.parameters().rowLimit));
  assert.equal(byRows.parameters().rowLimit.toNumber(), 101);
  assert.match(byRows.statement(), /workspaceId: \$workspaceId/);
  assert.match(byRows.statement(), /LIMIT \$rowLimit/);
  assert.equal(rows.attempts.length, 100);
  assert.equal(rows.truncated, true);

  const byBytes = fakeDatabase(["x".repeat(512_000)]);
  const large = await new MemoryGraph(byBytes.database).recall({
    repository: "repo",
    taskId: "task-1",
  });
  assert.deepEqual(large.attempts, []);
  assert.equal(large.truncated, true);
  assert.ok(Buffer.byteLength(JSON.stringify(large)) <= 512_000);

  const input = { repository: "repo", taskId: "task-1" };
  const emptyAction = await new MemoryGraph(fakeDatabase([""]).database).recall(
    input,
  );
  const available = 512_000 - Buffer.byteLength(JSON.stringify(emptyAction));
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
    { repository: "repo", taskId: "task", limit: 101 },
    { repository: "repo", taskId: "task", limit: 0 },
  ]) {
    await assert.rejects(graph.recall(input));
  }
});
