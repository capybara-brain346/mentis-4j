# Deployment

Mentis runs as a Cloudflare Worker and needs network access to Neo4j and OpenRouter. Semantic search and attempt recording also require an OpenRouter API key.

## Local Worker development

Install dependencies and compile TypeScript:

```sh
npm ci
npm run build
```

Copy `.env.development.example` to `.env.development` and set the local Worker values. Do not commit secrets. `NEO4J_PASSWORD` is required. `OPENROUTER_API_KEY` is checked when search or record operations request embeddings; recall does not use it.

Start the database and server:

```sh
docker compose up -d
npm run worker:dev
```

Compose runs Neo4j `5.26.0-community`, publishes ports `7474` and `7687` on localhost, and persists data in `neo4j_data`. The Neo4j password is initialized when the volume is created. Changing the environment value does not rotate the password in an existing volume. `docker compose down -v` removes the data volume.

Search scores stored embeddings within the requested repository and does not require the global `attempt_embedding` vector index. Existing installations may leave that unused index in place. The application does not backfill embeddings.

The default Neo4j settings are `bolt://127.0.0.1:7687`, username `neo4j`, and database `neo4j`.

## Configuration

| Variable | Default or requirement | Use |
| --- | --- | --- |
| `NEO4J_URI` | `bolt://127.0.0.1:7687` | Neo4j connection URI |
| `NEO4J_USERNAME` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | Required | Neo4j password |
| `NEO4J_DATABASE` | `neo4j` | Neo4j database |
| `OPENROUTER_API_KEY` | Required for search and record | Embedding and Jev API authorization |
| `LOG_LEVEL` | `debug` | Minimum log level: `debug`, `info`, or `error` |

Wrangler loads `.env.development` for local Worker development and uses configured values and secrets in deployment. A local environment file does not automatically populate variables in external test processes.

## Cloudflare Worker deployment

`wrangler.jsonc` sets `src/mcp/server/server.ts` as the entry point, compatibility date `2025-03-01`, and `nodejs_compat` plus `global_fetch_strictly_public` flags. Configure the Neo4j URI reachable from Cloudflare Workers, password, and OpenRouter API key as Wrangler secrets. `NEO4J_USERNAME` and `NEO4J_DATABASE` are optional and default to `neo4j`.

```sh
npx wrangler secret put NEO4J_URI
npx wrangler secret put NEO4J_PASSWORD
npx wrangler secret put OPENROUTER_API_KEY
npm run worker:build
npm run worker:deploy
```

For local Worker development, put values in `.env.development` and run `npm run worker:dev`. The local MCP endpoint is `http://127.0.0.1:8787/mcp`.

OAuth protects MCP access. Authorized callers can read and write graph data, run `recall` Cypher, and make calls that can incur OpenRouter usage. Use a restricted Neo4j credential.

## Build and verification

- `npm run build` compiles `src/` into generated `dist/`.
- `npm run typecheck` checks TypeScript without output.
- `npm run lint` runs ESLint on `src/`.
- `npm run format` checks formatting; it does not rewrite files.
- `npm test` builds and runs the Node.js test suite.

Database-backed graph tests require `NEO4J_PASSWORD` and `OPENROUTER_API_KEY` in the test process and a reachable Neo4j database. Tests skipped for missing configuration do not verify database or provider behavior. Worker tests check the protected `/mcp` endpoint and OAuth routes.

## Source and tests

- Package commands and dependencies: `package.json`.
- TypeScript output: `tsconfig.json`.
- Neo4j local service and volume: `compose.yaml`.
- Worker entry point and compatibility settings: `wrangler.jsonc`.
- Runtime configuration defaults: `src/config/config.ts`.
- Deployment instructions and public tool contract: `README.md`.
