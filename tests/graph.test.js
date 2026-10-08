import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Database } from "../dist/lib/db.js";
import { MemoryGraph } from "../dist/lib/graph.js";

const canRun = Boolean(
  process.env.NEO4J_PASSWORD && process.env.OPENROUTER_API_KEY,
);
const embedding = () => Array(1024).fill(0.25);
const attempt = {
  repository: "https://example.test/repo.git",
  taskId: "cookie-session-loop",
  codeContext: "Vite, local HTTP",
  action: "Inspect cookie persistence",
  affectedFiles: ["src/Login.tsx"],
  observation: "Login returns to the sign-in page",
  check: { method: "browser test", result: "failed" },
  gitCommit: "a8c3f2",
  gitDirty: true,
};

function searchRecord(candidate) {
  const action =
    candidate.action ?? candidate.matchedAttemptPreview ?? "action";
  const observation = candidate.observation ?? "observation";
  const values = {
    repository: candidate.repository,
    taskId: candidate.taskId,
    id: candidate.id ?? `${candidate.taskId}-attempt`,
    codeContext: candidate.codeContext ?? "test context",
    action,
    affectedFiles: candidate.affectedFiles ?? ["src/test.ts"],
    observation,
    inference: candidate.inference ?? null,
    checkMethod: candidate.checkMethod ?? null,
    checkResult: candidate.checkResult ?? "unverified",
    evidenceReferences: candidate.evidenceReferences ?? [],
    recordedAt: candidate.recordedAt ?? "2025-01-01T00:00:00.000Z",
    gitCommit: candidate.gitCommit ?? null,
    gitDirty: candidate.gitDirty ?? null,
    outdatedReason: candidate.outdated?.reason ?? null,
    outdatedAt: candidate.outdated?.correctedAt ?? null,
    latestCommit: candidate.outdated?.latestCommit ?? null,
    matchedAttemptPreview:
      candidate.matchedAttemptPreview ??
      `${action} — ${observation}`.slice(0, 240),
    similarity: candidate.similarity,
  };
  return { get: (key) => values[key] };
}

function graphForSearch(rows, relevance) {
  const database = {
    read: (work) =>
      work({
        run: async () => ({ records: rows.map(searchRecord) }),
      }),
  };
  return new MemoryGraph(database, async () => embedding(), relevance);
}

test("an embedding failure never starts the attempt write", async () => {
  let writes = 0;
  const graph = new MemoryGraph({ writeTx: async () => writes++ }, async () => {
    throw new Error("provider unavailable");
  });

  await assert.rejects(graph.recordAttempt(attempt), /provider unavailable/);
  assert.equal(writes, 0);
});

test("rejects a non-SHA Git commit before embedding", async () => {
  let embeddings = 0;
  const graph = new MemoryGraph(
    { writeTx: async () => assert.fail("must not write") },
    async () => {
      embeddings++;
      return embedding();
    },
  );

  await assert.rejects(
    graph.recordAttempt({ ...attempt, gitCommit: "not-a-commit" }),
    /hexadecimal Git commit SHA/,
  );
  assert.equal(embeddings, 0);
});

test("embeds the typed attempt as a document before writing it", async () => {
  let written;
  const values = {
    id: "attempt-id",
    repository: attempt.repository,
    taskId: attempt.taskId,
    codeContext: attempt.codeContext,
    action: attempt.action,
    affectedFiles: attempt.affectedFiles,
    observation: attempt.observation,
    inference: null,
    checkMethod: attempt.check.method,
    checkResult: attempt.check.result,
    evidenceReferences: [],
    recordedAt: "2025-01-01T00:00:00.000Z",
    gitCommit: attempt.gitCommit,
    gitDirty: attempt.gitDirty,
  };
  const database = {
    writeTx: (work, requestId) => {
      assert.equal(requestId, "request-1");
      return work({
        run: async (_query, parameters) => {
          written = parameters;
          return { records: [{ get: (key) => values[key] }] };
        },
      });
    },
  };
  const graph = new MemoryGraph(
    database,
    async (text, inputType, requestId) => {
      assert.equal(requestId, "request-1");
      assert.equal(inputType, "document");
      for (const field of [
        "Action:",
        "Observation:",
        "Check:",
        "Vite, local HTTP",
      ]) {
        assert.ok(text.includes(field));
      }
      assert.equal(text.includes(attempt.gitCommit), false);
      return embedding();
    },
  );

  const recorded = await graph.recordAttempt(attempt, "request-1");
  assert.equal(written.embedding.length, 1024);
  assert.equal(written.gitCommit, attempt.gitCommit);
  assert.equal(written.gitDirty, true);
  assert.equal(recorded.id, "attempt-id");
  assert.equal(recorded.verification, "failed");
  assert.equal(recorded.gitCommit, attempt.gitCommit);
  assert.equal(recorded.gitDirty, true);
});

test("search rejects a missing repository before embedding or reading", async () => {
  const graph = new MemoryGraph(
    { read: () => assert.fail("must not read") },
    () => assert.fail("must not embed"),
  );
  await assert.rejects(graph.search({ query: "login" }), /non-empty string/);
});

test("search exposes the matched attempt's Git and outdated status", async () => {
  const graph = graphForSearch(
    [
      {
        repository: "repo",
        taskId: "task",
        id: "attempt-1",
        action: "Keep cookie auth",
        checkResult: "passed",
        gitCommit: "a8c3f2",
        gitDirty: true,
        outdated: {
          reason: "Header auth replaced this path",
          correctedAt: "2025-02-01T00:00:00.000Z",
          latestCommit: "b7d9e1",
        },
        similarity: 0.9,
      },
    ],
    async () => 1,
  );

  assert.deepEqual(
    await graph.search({ repository: "repo", query: "cookie auth" }),
    [
      {
        repository: "repo",
        taskId: "task",
        matchedAttemptId: "attempt-1",
        matchedAttemptPreview: "Keep cookie auth — observation",
        matchedAttemptVerification: "passed",
        gitCommit: "a8c3f2",
        gitDirty: true,
        outdated: {
          reason: "Header auth replaced this path",
          correctedAt: "2025-02-01T00:00:00.000Z",
          latestCommit: "b7d9e1",
        },
        similarity: 0.9,
        relevanceScore: 1,
      },
    ],
  );
});

test("marks an attempt outdated without changing its original evidence", async () => {
  let query;
  let parameters;
  const original = {
    repository: attempt.repository,
    taskId: attempt.taskId,
    id: "attempt-1",
    action: attempt.action,
    observation: attempt.observation,
    inference: "Cookie persistence fixes sign-in",
    checkMethod: "browser test",
    checkResult: "passed",
    gitCommit: attempt.gitCommit,
    gitDirty: true,
    outdated: {
      reason: "Header auth replaced cookie auth",
      correctedAt: "2025-02-01T00:00:00.000Z",
      latestCommit: "b7d9e1",
    },
  };
  const graph = new MemoryGraph({
    writeTx: (work) =>
      work({
        run: async (statement, values) => {
          query = statement;
          parameters = values;
          return { records: [searchRecord(original)] };
        },
      }),
  });

  const marked = await graph.markConclusionOutdated({
    repository: attempt.repository,
    attemptId: "attempt-1",
    reason: original.outdated.reason,
    latestCommit: original.outdated.latestCommit,
  });

  assert.match(query, /Repository \{identity: \$repository\}/);
  assert.match(query, /a\.outdatedReason = \$reason/);
  assert.match(
    query,
    /a\.latestCommit = coalesce\(\$latestCommit, a\.latestCommit, a\.outdatedGitCommit\)/,
  );
  assert.match(query, /REMOVE a\.outdatedGitCommit/);
  assert.equal(parameters.repository, attempt.repository);
  assert.equal(parameters.attemptId, "attempt-1");
  assert.equal(parameters.latestCommit, "b7d9e1");
  assert.equal(marked.inference, original.inference);
  assert.deepEqual(marked.check, {
    method: "browser test",
    result: "passed",
  });
  assert.equal(marked.outdated.reason, original.outdated.reason);
  assert.equal(Number.isNaN(Date.parse(marked.outdated.correctedAt)), false);
});

test("forgets only an attempt scoped to its repository", async () => {
  let query;
  let parameters;
  const graph = new MemoryGraph({
    writeTx: (work) =>
      work({
        run: async (statement, values) => {
          query = statement;
          parameters = values;
          return { records: [{ get: () => ({ toNumber: () => 1 }) }] };
        },
      }),
  });

  await graph.forgetAttempt({ repository: "repo", attemptId: "attempt-2" });

  assert.match(query, /Repository \{identity: \$repository\}/);
  assert.match(query, /DETACH DELETE a/);
  assert.deepEqual(parameters, { repository: "repo", attemptId: "attempt-2" });
});

test("search limits candidates after scoping to the requested repository", async () => {
  const matches = [
    ...Array.from({ length: 100 }, (_, index) => ({
      repository: attempt.repository,
      taskId: "many-attempts",
      matchedAttemptPreview: `attempt ${index}`,
      similarity: 0.99 - index / 1000,
    })),
    {
      repository: "https://example.test/another-repo.git",
      taskId: "many-attempts",
      matchedAttemptPreview: "same task ID in another repository",
      similarity: 0.85,
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      repository: attempt.repository,
      taskId: `other-task-${index}`,
      matchedAttemptPreview: `other attempt ${index}`,
      similarity: 0.8 - index / 1000,
    })),
  ];
  const candidateLimits = [];
  matches.unshift(
    ...Array.from({ length: 201 }, (_, index) => ({
      repository: "https://example.test/other.git",
      taskId: `other-${index}`,
      similarity: 1,
    })),
  );
  const database = {
    read: (work) =>
      work({
        run: async (query, parameters) => {
          assert.match(query, /Repository \{identity: \$repository\}/);
          assert.match(query, /vector\.similarity\.cosine/);
          assert.match(query, /LIMIT \$candidateLimit/);
          assert.equal(parameters.repository, attempt.repository);
          const limit =
            typeof parameters.candidateLimit?.toNumber === "function"
              ? parameters.candidateLimit.toNumber()
              : parameters.candidateLimit;
          candidateLimits.push(limit);
          return {
            records: matches
              .filter(({ repository }) => repository === parameters.repository)
              .slice(0, limit)
              .map(searchRecord),
          };
        },
      }),
  };
  const graph = new MemoryGraph(
    database,
    async () => embedding(),
    async () => 1,
  );

  const candidates = await graph.search({
    repository: attempt.repository,
    query: "test",
    limit: 10,
  });

  assert.deepEqual(candidateLimits, [200]);
  assert.equal(candidates.length, 10);
  assert.equal(
    new Set(
      candidates.map(({ repository, taskId }) =>
        JSON.stringify([repository, taskId]),
      ),
    ).size,
    10,
  );
  assert.equal(candidates[0].taskId, "many-attempts");
  assert.equal(candidates[0].relevanceScore, 1);
  assert.ok(
    candidates.every(({ repository }) => repository === attempt.repository),
  );
  assert.ok(candidates.some(({ taskId }) => taskId === "other-task-0"));
});

test("filters and ranks distinct tasks by Jev relevance", async () => {
  const fullAction = "matched action ".repeat(30);
  const rows = [
    {
      repository: attempt.repository,
      taskId: "task-a",
      id: "a-first",
      action: fullAction,
      similarity: 0.99,
    },
    {
      repository: attempt.repository,
      taskId: "task-a",
      id: "a-duplicate",
      action: "duplicate task action",
      similarity: 0.98,
    },
    {
      repository: attempt.repository,
      taskId: "task-b",
      id: "b",
      similarity: 0.9,
    },
    {
      repository: attempt.repository,
      taskId: "task-c",
      id: "c",
      similarity: 0.8,
    },
    {
      repository: attempt.repository,
      taskId: "task-d",
      id: "d",
      similarity: 0.85,
    },
    {
      repository: attempt.repository,
      taskId: "task-e",
      id: "e",
      similarity: 0.7,
    },
  ];
  const probabilities = {
    "a-first": 0.6,
    "a-duplicate": 0.7,
    b: 0.5,
    c: 0.8,
    d: 0.8,
    e: 0.49,
  };
  const scoredAttempts = [];
  const graph = graphForSearch(rows, async (query, matchedAttempt) => {
    assert.equal(query, "search query");
    if (matchedAttempt.id === "a-first") {
      assert.equal(matchedAttempt.action, fullAction);
      assert.ok(matchedAttempt.action.length > 240);
    }
    scoredAttempts.push(matchedAttempt.id);
    return probabilities[matchedAttempt.id];
  });

  const candidates = await graph.search({
    repository: attempt.repository,
    query: "search query",
    limit: 10,
  });

  assert.deepEqual(scoredAttempts, [
    "a-first",
    "a-duplicate",
    "b",
    "c",
    "d",
    "e",
  ]);
  assert.deepEqual(
    candidates.map(({ taskId, relevanceScore }) => [taskId, relevanceScore]),
    [
      ["task-d", 0.8],
      ["task-c", 0.8],
      ["task-a", 0.7],
      ["task-b", 0.5],
    ],
  );
});

test("search scores up to five attempts per task and selects its most useful match", async () => {
  const rows = [
    {
      repository: attempt.repository,
      taskId: "resolved",
      id: "failed",
      similarity: 0.99,
      matchedAttemptPreview: "failed check",
    },
    {
      repository: attempt.repository,
      taskId: "rejected",
      id: "rejected",
      similarity: 0.98,
    },
    {
      repository: attempt.repository,
      taskId: "resolved",
      id: "passed",
      similarity: 0.97,
      matchedAttemptPreview: "verified fix",
    },
    ...Array.from({ length: 5 }, (_, index) => ({
      repository: attempt.repository,
      taskId: "resolved",
      id: `later-${index}`,
      similarity: 0.96 - index / 100,
    })),
  ];
  const scores = {
    failed: 0.41,
    rejected: 0.34,
    passed: 0.74,
    "later-0": 0.54,
    "later-1": 0.2,
    "later-2": 0.2,
    "later-3": 0.9,
    "later-4": 0.9,
  };
  const scored = [];
  const graph = graphForSearch(rows, async (_query, matchedAttempt) => {
    scored.push(matchedAttempt.id);
    return scores[matchedAttempt.id];
  });

  const candidates = await graph.search({
    repository: attempt.repository,
    query: "login loop",
    limit: 1,
  });

  assert.deepEqual(scored, [
    "failed",
    "passed",
    "later-0",
    "later-1",
    "later-2",
    "rejected",
  ]);
  assert.deepEqual(candidates, [
    {
      repository: attempt.repository,
      taskId: "resolved",
      matchedAttemptId: "passed",
      matchedAttemptPreview: "verified fix",
      matchedAttemptVerification: "unverified",
      outdated: null,
      similarity: 0.97,
      relevanceScore: 0.74,
    },
  ]);
});

test("empty vector results do not call Jev", async () => {
  let relevanceCalls = 0;
  const graph = graphForSearch([], async () => relevanceCalls++);

  assert.deepEqual(
    await graph.search({ repository: attempt.repository, query: "no matches" }),
    [],
  );
  assert.equal(relevanceCalls, 0);
});

test("Jev failures return all vector candidates with null relevance scores", async () => {
  const rows = [
    {
      repository: attempt.repository,
      taskId: "task-a",
      id: "a",
      similarity: 0.9,
    },
    {
      repository: attempt.repository,
      taskId: "task-a",
      id: "a-second",
      similarity: 0.85,
    },
    {
      repository: attempt.repository,
      taskId: "task-b",
      id: "b",
      similarity: 0.8,
    },
  ];
  const graph = graphForSearch(rows, async (_query, matchedAttempt) => {
    if (matchedAttempt.id === "b") throw new Error("invalid Jev response");
    return 0.1;
  });

  const candidates = await graph.search({
    repository: attempt.repository,
    query: "search query",
  });

  assert.deepEqual(
    candidates.map(({ taskId, similarity, relevanceScore }) => [
      taskId,
      similarity,
      relevanceScore,
    ]),
    [
      ["task-a", 0.9, null],
      ["task-b", 0.8, null],
    ],
  );
});

test(
  "discovers paraphrased attempts, groups task history, and bounds recall",
  { skip: !canRun },
  async () => {
    const database = new Database();
    const graph = new MemoryGraph(database);
    const repository = `graph-test-${randomUUID()}`;
    const shared = {
      ...attempt,
      repository,
      taskId: "cookie-session-loop",
      codeContext: "Vite at abc123, local HTTP",
      affectedFiles: ["src/Login.tsx"],
    };

    try {
      await database.verifyConnectivity();
      const original = await graph.recordAttempt({
        ...shared,
        action: "Change the login redirect",
        observation: "Authentication still cycles back to the sign-in page",
        inference: "The cookie redirect path causes the login loop",
        check: { method: "browser test", result: "failed" },
      });
      const forgotten = await graph.recordAttempt({
        ...shared,
        action: "Retain the session cookie over local HTTP",
        observation: "The browser stays signed in after login",
        check: { method: "browser test", result: "passed" },
        evidenceReferences: ["test://browser-login"],
      });
      await graph.recordAttempt({
        ...shared,
        taskId: "separate-cookie-investigation",
        action: "Inspect whether the session cookie is retained",
        observation: "The user is sent back to sign-in after authenticating",
      });

      const historyBefore = await graph.recall({
        cypher: `MATCH (t:Task {identity: $taskId, repositoryIdentity: $repository})-[:HAS_ATTEMPT]->(a:Attempt)
                 RETURN a.id AS id ORDER BY a.recordedAt`,
        parameters: { taskId: shared.taskId, repository },
      });
      assert.equal(historyBefore.rows.length, 2);

      const candidates = await graph.search({
        repository,
        query:
          "users are repeatedly returned to the login screen after signing in",
        limit: 20,
      });
      assert.ok(candidates.some(({ taskId }) => taskId === shared.taskId));
      assert.equal(
        candidates.filter(({ taskId }) => taskId === shared.taskId).length,
        1,
      );
      assert.ok(
        candidates.every(
          ({ matchedAttemptPreview, similarity, relevanceScore }) =>
            matchedAttemptPreview.length <= 240 &&
            Number.isFinite(similarity) &&
            (relevanceScore === null || Number.isFinite(relevanceScore)),
        ),
      );

      const corrected = await graph.markConclusionOutdated({
        repository,
        attemptId: original.id,
        reason: "Header-based auth replaced the cookie path",
        latestCommit: "b7d9e1",
      });
      assert.equal(corrected.verification, "failed");
      assert.equal(
        corrected.inference,
        "The cookie redirect path causes the login loop",
      );
      assert.equal(corrected.outdated.latestCommit, "b7d9e1");
      const updated = await graph.markConclusionOutdated({
        repository,
        attemptId: original.id,
        reason: "New evidence confirms the old conclusion is outdated",
      });
      assert.equal(updated.outdated.latestCommit, "b7d9e1");
      assert.equal(
        updated.outdated.reason,
        "New evidence confirms the old conclusion is outdated",
      );
      await graph.forgetAttempt({ repository, attemptId: forgotten.id });

      const history = await graph.recall({
        cypher: `MATCH (t:Task {identity: $taskId, repositoryIdentity: $repository})-[:HAS_ATTEMPT]->(a:Attempt)
                 RETURN t.identity AS taskId, a.id AS id, a.action AS action,
                        a.inference AS inference, a.checkResult AS result,
                        a.gitCommit AS gitCommit, a.gitDirty AS gitDirty,
                        a.outdatedReason AS outdatedReason, a.outdatedAt AS outdatedAt,
                        a.latestCommit AS latestCommit
                 ORDER BY a.recordedAt`,
        parameters: { taskId: shared.taskId, repository },
      });
      assert.deepEqual(
        [...history.columns].sort(),
        [
          "taskId",
          "id",
          "action",
          "inference",
          "result",
          "gitCommit",
          "gitDirty",
          "outdatedReason",
          "outdatedAt",
          "latestCommit",
        ].sort(),
      );
      assert.equal(history.rows.length, 1);
      const historyRow = Object.fromEntries(
        history.columns.map((column, index) => [
          column,
          history.rows[0][index],
        ]),
      );
      assert.equal(historyRow.id, original.id);
      assert.equal(
        historyRow.inference,
        "The cookie redirect path causes the login loop",
      );
      assert.equal(historyRow.result, "failed");
      assert.equal(historyRow.gitCommit, "a8c3f2");
      assert.equal(historyRow.gitDirty, true);
      assert.equal(
        historyRow.outdatedReason,
        "New evidence confirms the old conclusion is outdated",
      );
      assert.equal(historyRow.outdatedAt, updated.outdated.correctedAt);
      assert.equal(historyRow.latestCommit, "b7d9e1");

      const deleted = await graph.recall({
        cypher: "MATCH (a:Attempt {id: $attemptId}) RETURN a.id AS id",
        parameters: { attemptId: forgotten.id },
      });
      assert.deepEqual(deleted.rows, []);

      const separateHistory = await graph.recall({
        cypher: `MATCH (t:Task {identity: $taskId, repositoryIdentity: $repository})-[:HAS_ATTEMPT]->(a:Attempt)
                 RETURN t.identity AS taskId, count(a) AS attempts`,
        parameters: { taskId: "separate-cookie-investigation", repository },
      });
      assert.deepEqual(
        [...separateHistory.columns].sort(),
        ["taskId", "attempts"].sort(),
      );
      const separateHistoryRow = Object.fromEntries(
        separateHistory.columns.map((column, index) => [
          column,
          separateHistory.rows[0][index],
        ]),
      );
      assert.equal(separateHistoryRow.taskId, "separate-cookie-investigation");
      assert.equal(separateHistoryRow.attempts, 1);

      const bounded = await graph.recall({
        cypher: "UNWIND range(1, 110) AS value RETURN value",
      });
      assert.equal(bounded.rows.length, 100);
      assert.equal(bounded.truncated, true);
      assert.equal(bounded.truncationReason, "row_limit");
    } finally {
      await database.close();
    }
  },
);
