# Repository Operating Guide

## Repository Map

- `src/` — TypeScript Worker MCP server, tool contracts, Neo4j access, and graph operations.
- `tests/` — Node.js test-runner integration tests for graph operations and Worker OAuth/MCP behavior.
- `docs/planning/` — product, memory, graph, MCP-boundary, and implementation planning documents.
- `README.md` — setup, supported MCP tools, graph behavior, security boundary, and checks.
- `compose.yaml` — local Neo4j service and persistent data volume.
- `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json` — scripts, dependency lock, TypeScript build, and lint and format configuration.
- `dist/` — generated TypeScript build output; ignored by Git and must not be hand-edited.

## Sources Of Truth

- `src/` and `tests/` define current runtime behavior and executable expectations. The database-backed tests are skipped unless `NEO4J_PASSWORD` is set and Neo4j is reachable.
- `package.json`, `package-lock.json`, `tsconfig.json`, `biome.json`, and `compose.yaml` define dependency resolution, scripts, compilation/linting, and local database configuration.
- `README.md` defines the user-facing setup and current tool contract. `docs/planning/` is design context, not proof of implemented behavior. `mentis-idea.md` describes an older incident-response direction; do not treat it as the current product or runtime specification.

The implementation and tests define current behavior. The user request defines intended behavior. If they differ, surface the discrepancy and resolve it explicitly.

Do not hand-edit generated files. Use the repository’s documented generation, migration, or build commands. `npm run build` generates `dist/`; there is currently no database migration or schema-generation command.

## Ponytail

Use the `ponytail` skill at its default `full` level for implementation, fixes, refactors, and reviews. Prefer the smallest correct change and do not add speculative abstractions or dependencies.

## Documentation

Do not update `README.md` unless the user explicitly asks for a README update. Update planning documents only when the underlying product or design decision changes; keep proposals clearly distinguished from implemented behavior.

Keep durable architecture notes, workflows, and project-specific conventions in the appropriate documentation instead of growing this file unnecessarily.

## Configuration

Define every configurable variable, constant, and default value in `src/config/config.ts`. Import these values where needed. Do not define configurable values elsewhere in the codebase.

## Code Spacing

Use consistent blank lines to make code easy to read. Put one blank line between functions and between groups of statements that do different tasks. Keep related statements together. Avoid large blocks with no blank lines, inconsistent spacing, and repeated blank lines.

## File Organization

When you write or change code, prefer several focused files to one long file.

- Keep each file focused on one clear purpose. Use a file name that describes the code in it.
- Keep code concise and readable. Do not compress code or remove useful spacing to reduce the line count.
- Split files by purpose before they grow to hundreds of lines, such as 700 to 900 lines. Use clear responsibilities to select file boundaries.
- Move helper code and large groups of utility functions into separate files. Use an existing `utils` directory when it is suitable. If no suitable directory exists, create separate files near the code that uses them.
- Group utility functions by their related purpose. Name each utility file for that purpose. Keep unrelated utilities in separate files.

## Commands

Run from the repository root:

- `npm install` — install dependencies (`npm ci` reproduces the lockfile in clean environments).
- `npm run build` — compile `src/` TypeScript into generated `dist/` output.
- `npm run typecheck` — type-check without emitting files.
- `npm run lint` — run Biome lint checks on server and landing app source.
- `npm run format` — check Biome formatting for the configured source, test, and configuration files; this is check-only.
- `npm run check` — check lint rules, formatting, and import order for the server and landing app.
- `npm run fix` — apply Biome formatting, import order, and safe lint fixes.
- `npm run format:write` — apply Biome formatting only.
- `npm test` — build, then run `tests/*.test.js`; graph integration tests skip unless `NEO4J_PASSWORD` and `OPENROUTER_API_KEY` are exported in the shell and Neo4j is reachable. Compose’s `.env` loading does not automatically set variables for `npm`.
- `docker compose up -d` — start local Neo4j; set `NEO4J_PASSWORD` in the shell or `.env` first. The service binds its ports to localhost and persists data in the `neo4j_data` volume.
- `npm run worker:dev` — start the local Cloudflare Worker; requires the configured database and OAuth bindings.

There is no migration or code-generation command at present. Report checks accurately: skipped integration tests are not database-backed verification, and a command that exits unsuccessfully must not be described as passing.

## Commits

Commit messages must be specific, detailed, and production-level.

Use a precise Conventional Commit subject. Add a body when the change needs context, including the intent, affected behavior or scope, important implementation decisions, and verification.

Avoid generic messages such as `update docs`, `fix stuff`, or `misc changes`.
