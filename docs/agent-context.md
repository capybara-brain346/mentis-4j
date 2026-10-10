# MENTIS: context for coding agents

MENTIS (`mentis-4j`) provides an authenticated Worker MCP endpoint for retaining **coding attempts**, not a code editor or an autonomous agent. It stores what an agent tried, what it observed, and what it inferred in Neo4j so a later agent can find related work and inspect the evidence before repeating a fix. This file is a handoff for agents working in other repositories; it describes the current implementation, not a roadmap.

## Mental model

```text
(Repository)-[:HAS_TASK]->(Task)-[:HAS_ATTEMPT]->(Attempt)
```

A task ID identifies one investigation *within* a repository. Each attempt has action, code context, affected files, observation, optional inference/evidence references, and an optional check. Missing checks are `unverified`; a check must be something actually run. Failed attempts are useful evidence too. Attempts are embedded individually; `search` returns one candidate per repository/task pair, not a solution or a success verdict. `recall` is where you inspect the full history.

Request path: MCP tool validation (`src/tools.ts`) → graph operations (`src/graph.ts`) → Neo4j (`src/db.ts`). `record_attempt` embeds the text via OpenRouter before the transaction; failed embedding means no write. `search` embeds the query, queries the `attempt_embedding` vector index, then scores candidates for usefulness via OpenRouter Jev. If relevance scoring errors, it falls back to vector candidates with `relevanceScore: null`; when scoring works, candidates below 0.5 are filtered out. A search can return no candidates even when attempts exist. `recall` does not require OpenRouter.

## Run locally

Clone `https://github.com/capybara-brain346/mentis-4j.git` if you do not have the repository. From its root (Node.js, npm, and Docker required):

1. `npm ci && npm run build`
2. Copy `.env.development.example` to `.env.development` and set `NEO4J_PASSWORD`, `OPENROUTER_API_KEY`, and the Google OAuth values. Keep the file out of Git. Neo4j defaults to user/database `neo4j` and URI `bolt://127.0.0.1:7687`; set `NEO4J_USERNAME` for cloud credentials with a different username.
3. `docker compose up -d` (the password must be available to Compose). Existing Neo4j volumes retain their original password; changing the variable does not rotate it.
4. In Neo4j Browser at `http://127.0.0.1:7474`, run:

   ```cypher
   CREATE VECTOR INDEX attempt_embedding IF NOT EXISTS
   FOR (a:Attempt) ON (a.embedding)
   OPTIONS {indexConfig: {
     `vector.dimensions`: 1024,
     `vector.similarity_function`: 'cosine'
   }};
   ```

   Check `SHOW VECTOR INDEXES` and wait for `attempt_embedding` to be `ONLINE`. The index is required for `search`, not `recall` or `record_attempt`.

5. Follow [the deployment guide](modules/deployment.md) to start the local Worker and configure OAuth. Set your MCP client to the Worker URL ending in `/mcp` and complete its OAuth sign-in.

## Try the tools

Use your MCP client's tool caller. For an end-to-end trial, give the sample data a disposable repository identity (replace `mentis-demo-unique-id` with a fresh value so prior trials do not mingle).

1. Confirm the database is reachable without OpenRouter:

   `recall`:
   ```json
   {"cypher":"RETURN 'mentis ready' AS message"}
   ```
   Expect `content[0].text` to be JSON with `columns: ["message"]` and `rows: [["mentis ready"]]`.

2. Record an actual observation. This example is about inspecting the MENTIS source itself; adapt the fields to what you really did:

   `record_attempt`:
   ```json
   {
     "repository": "mentis-demo-unique-id",
     "taskId": "inspect-tool-contract",
     "codeContext": "mentis-4j local checkout; src/tools.ts",
     "action": "Read the record_attempt tool schema in src/tools.ts",
     "affectedFiles": ["src/tools.ts"],
     "observation": "The schema requires repository, taskId, codeContext, action, affectedFiles, and observation",
     "inference": "An agent can record an attempt without claiming it passed a check",
     "evidenceReferences": ["src/tools.ts"]
   }
   ```
   Expect `structuredContent.status: "recorded"` and `attempt.verification: "unverified"`. Only include `check: {"method":"...","result":"passed"}` or `failed` after actually performing that check.

3. Retrieve the recorded history deterministically:

   `recall`:
   ```json
   {
     "cypher": "MATCH (t:Task {identity: $taskId, repositoryIdentity: $repository})-[:HAS_ATTEMPT]->(a:Attempt) RETURN a.action AS action, a.observation AS observation, a.inference AS inference, a.checkResult AS verification ORDER BY a.recordedAt",
     "parameters": {"repository":"mentis-demo-unique-id","taskId":"inspect-tool-contract"}
   }
   ```
   Expect a row with the observation and `unverified`. `recall` returns `columns`, `rows`, `truncated`, and `truncationReason` in `content[0].text`.

4. Try semantic discovery (requires the online index and OpenRouter):

   `search`:
   ```json
   {"query":"how does mentis record coding attempts and distinguish observations from inferences?","limit":10}
   ```
   Inspect `structuredContent.candidates` for repository/task IDs, matched-attempt previews, similarity, and possibly `relevanceScore`. Results are global, approximate, and relevance-filtered; do not assume this sample always appears. Use `recall` with the returned IDs before applying advice.

## Agent workflow and limits

- Search for similar work **before** changing code; recall candidate attempts, including failed ones. Scope recall by both repository and task ID. Verify advice against the current checkout; stored code context may be stale.
- After a meaningful action, record the action and **observed** result. Keep hypotheses in `inference`; attach real check results only when run. Reuse a task ID for the same investigation, not for any task with the same symptom. Use a stable repository identity (for example its Git remote) in normal use.
- `search` takes `query` (up to 4,000 characters) and optional `limit` (1–20, default 10). `recall` takes a Cypher string (up to 10,000 characters) and optional parameters; results are limited to 100 rows, 512,000 serialized bytes, and a five-second transaction timeout. `record_attempt` requires a nonempty affected-files list.
- Treat `recall` as **trusted-local only**: a read transaction does not make agent-authored Cypher a complete read-only security boundary. The server defaults to the `neo4j` user but accepts `NEO4J_USERNAME`; verify a restricted credential before deploying beyond trusted local use. Queries and attempt text are sent to OpenRouter; omit secrets and sensitive data. Both embedding and relevance calls may incur provider usage/cost.
- For code changes in MENTIS itself, run `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`. Integration tests need exported `NEO4J_PASSWORD` and `OPENROUTER_API_KEY`, reachable Neo4j, and the index; `.env` alone does not enable them. Skipped integration tests are not live verification.

For full setup and contracts, see `README.md`; for authoritative behavior, read `src/` and `tests/`. `mentis-idea.md` is an older direction, not the current runtime specification.
