# Repository Operating Guide

## Repository Map

- `src/` — TypeScript stdio MCP server, tool contracts, Neo4j access, and graph operations.
- `tests/` — Node.js test-runner integration tests for graph operations and stdio MCP tools.
- `docs/planning/` — product, memory, graph, MCP-boundary, and implementation planning documents.
- `README.md` — setup, supported MCP tools, graph behavior, security boundary, and checks.
- `compose.yaml` — local Neo4j service and persistent data volume.
- `package.json`, `package-lock.json`, `tsconfig.json`, `.eslintrc.json` — scripts, dependency lock, TypeScript build, and lint configuration.
- `dist/` — generated TypeScript build output; ignored by Git and must not be hand-edited.

## Sources Of Truth

- `src/` and `tests/` define current runtime behavior and executable expectations. The database-backed tests are skipped unless `NEO4J_PASSWORD` is set and Neo4j is reachable.
- `package.json`, `package-lock.json`, `tsconfig.json`, `.eslintrc.json`, and `compose.yaml` define dependency resolution, scripts, compilation/linting, and local database configuration.
- `README.md` defines the user-facing setup and current tool contract. `docs/planning/` is design context, not proof of implemented behavior. `mentis-idea.md` describes an older incident-response direction; do not treat it as the current product or runtime specification.

The implementation and tests define current behavior. The user request defines intended behavior. If they differ, surface the discrepancy and resolve it explicitly.

Do not hand-edit generated files. Use the repository’s documented generation, migration, or build commands. `npm run build` generates `dist/`; there is currently no database migration or schema-generation command.

## Ponytail

Use the `ponytail` skill at its default `full` level for implementation, fixes, refactors, and reviews. Prefer the smallest correct change and do not add speculative abstractions or dependencies.

## Documentation

Do not update `README.md` unless the user explicitly asks for a README update. Update planning documents only when the underlying product or design decision changes; keep proposals clearly distinguished from implemented behavior.

Keep durable architecture notes, workflows, and project-specific conventions in the appropriate documentation instead of growing this file unnecessarily.

## Commands

Run from the repository root:

- `npm install` — install dependencies (`npm ci` reproduces the lockfile in clean environments).
- `npm run build` — compile `src/` TypeScript into generated `dist/` output.
- `npm run typecheck` — type-check without emitting files.
- `npm run lint` — lint TypeScript under `src/`.
- `npm run format` — check Prettier formatting for the configured source, test, and package files; this is check-only.
- `npm test` — build, then run `tests/*.test.js`; graph and MCP integration tests skip unless `NEO4J_PASSWORD` is exported in the shell and a Neo4j server is reachable. Compose’s `.env` loading does not automatically set variables for `npm`.
- `docker compose up -d` — start local Neo4j; set `NEO4J_PASSWORD` in the shell or `.env` first. The service binds its ports to localhost and persists data in the `neo4j_data` volume.
- `npm start` — start the compiled MCP server; requires a reachable Neo4j database and `NEO4J_PASSWORD` (see `README.md` for optional connection settings).

There is no migration or code-generation command at present. Report checks accurately: skipped integration tests are not database-backed verification, and a command that exits unsuccessfully must not be described as passing.

## Commits

Commit messages must be specific, detailed, and production-level.

Use a precise Conventional Commit subject. Add a body when the change needs context, including the intent, affected behavior or scope, important implementation decisions, and verification.

Avoid generic messages such as `update docs`, `fix stuff`, or `misc changes`.
