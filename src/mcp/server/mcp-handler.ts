import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { WorkerEnvironment } from "../../auth/types.js";
import { CONFIG } from "../../config/config.js";
import { environmentSchema } from "../../config/environment.js";
import { AuraDB } from "../../db/auradb.js";
import { embedText } from "../../lib/embeddings.js";
import { MemoryGraph } from "../../lib/graph.js";
import { jevRelevance } from "../../lib/jev.js";
import { logger } from "../../lib/logger.js";
import { registerTools } from "../../lib/tools.js";

let constraintsReady: Promise<void> | undefined;

export async function handleMcpRequest(
  request: Request,
  env: WorkerEnvironment,
  workspaceId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const parsed = environmentSchema.safeParse({
    NEO4J_URI: env.NEO4J_URI,
    NEO4J_USERNAME: env.NEO4J_USERNAME,
    NEO4J_PASSWORD: env.NEO4J_PASSWORD,
    NEO4J_DATABASE: env.NEO4J_DATABASE,
    OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    LOG_LEVEL: env.LOG_LEVEL,
  });
  if (!parsed.success) {
    logger.error("Invalid Worker database configuration");
    return new Response("Mentis database is not configured", { status: 503 });
  }

  const runtime = parsed.data;
  const password = runtime.NEO4J_PASSWORD;
  if (!password) {
    logger.error("Invalid Worker database configuration");
    return new Response("Mentis database is not configured", { status: 503 });
  }
  let database: AuraDB | undefined;
  let server: McpServer | undefined;
  try {
    database = new AuraDB({
      uri: runtime.NEO4J_URI ?? CONFIG.neo4j.defaultUri,
      username: runtime.NEO4J_USERNAME ?? CONFIG.neo4j.username,
      password,
      database: runtime.NEO4J_DATABASE ?? CONFIG.neo4j.defaultDatabase,
      workspaceId,
    });
    await database.verifyConnectivity();
    constraintsReady ??= database
      .ensureConstraints()
      .catch((error: unknown) => {
        constraintsReady = undefined;
        throw error;
      });
    await constraintsReady;

    const graph = new MemoryGraph(
      database,
      (text, inputType, requestId) =>
        embedText(text, inputType, requestId, runtime.OPENROUTER_API_KEY),
      (query, attempt, requestId) =>
        jevRelevance(query, attempt, requestId, runtime.OPENROUTER_API_KEY),
    );
    server = new McpServer({
      name: CONFIG.app.name,
      version: CONFIG.app.version,
    });
    registerTools(server, graph);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    logger.error(`MCP HTTP request failed: ${errorMessage(error)}`);
    return new Response("Mentis MCP request failed", { status: 503 });
  } finally {
    await server?.close().catch((error: unknown) => {
      logger.error(`Failed to close MCP server: ${errorMessage(error)}`);
    });
    await database?.close().catch((error: unknown) => {
      logger.error(`Failed to close database: ${errorMessage(error)}`);
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
