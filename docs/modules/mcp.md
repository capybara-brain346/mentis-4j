# MCP server implementation

Mentis serves MCP over the authenticated Cloudflare Worker Streamable HTTP endpoint at `/mcp`. Tool registration is in `src/lib/tools.ts`.

## Worker transport

`src/mcp/server/server.ts` exports the Worker fetch handler. The OAuth provider protects MCP access and serves the authorization and account routes.

For each MCP request, the Worker validates its environment, connects to Neo4j, registers the tools, and connects a `WebStandardStreamableHTTPServerTransport`. It closes the MCP server and database after the request. Neo4j constraints are initialized once per Worker isolate.

Invalid configuration and request failures return 503 responses. The Worker validates the request origin and requires OAuth authorization for MCP access.

## Logging

`src/lib/logger.ts` writes one JSON object per line to stderr. Levels are `debug`, `info`, and `error`; the default is `debug`. `LOG_LEVEL` sets the minimum level. Invalid values fall back to `debug` in the logger. When supplied, a request ID is emitted as `request_id`.

## Security boundary

`recall` executes caller-authored Cypher in a Neo4j read transaction with result and time limits. These limits constrain resource use and output size. They do not make the tool a complete read-only security boundary. Use a restricted Neo4j credential and verify its permissions before deployment.

## Source and tests

- Worker request handling and transport: `src/mcp/server/server.ts`.
- Tool registration: `src/lib/tools.ts`.
- Worker protocol and OAuth tests: `tests/worker.test.js`.
