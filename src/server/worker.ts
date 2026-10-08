import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CONFIG,
  type Environment,
  environmentSchema,
  type RuntimeEnvironment,
} from "../config/config.js";
import { Database } from "../lib/db.js";
import { embedText } from "../lib/embeddings.js";
import { MemoryGraph } from "../lib/graph.js";
import { jevRelevance } from "../lib/jev.js";
import { logger } from "../lib/logger.js";
import { registerTools } from "../lib/tools.js";

const mcpHandler = {
  async fetch(request: Request, env: RuntimeEnvironment): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }

    let database: Database | undefined;
    let server: McpServer | undefined;
    try {
      if (!env.NEO4J_URI || !env.NEO4J_PASSWORD) {
        return new Response("Mentis database is not configured", {
          status: 503,
        });
      }

      database = new Database({
        uri: env.NEO4J_URI,
        username: env.NEO4J_USERNAME ?? CONFIG.neo4j.username,
        password: env.NEO4J_PASSWORD,
        database: env.NEO4J_DATABASE ?? CONFIG.neo4j.defaultDatabase,
      });

      const graph = new MemoryGraph(
        database,
        (text, inputType, requestId) =>
          embedText(text, inputType, requestId, env.OPENROUTER_API_KEY),
        (query, attempt, requestId) =>
          jevRelevance(query, attempt, requestId, env.OPENROUTER_API_KEY),
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
  },
};

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    if (new URL(request.url).pathname !== CONFIG.worker.mcpPath) {
      return new Response("Not found", { status: 404 });
    }

    const parsed = environmentSchema.safeParse(env);
    if (!parsed.success) {
      logger.error(`Invalid Worker configuration: ${parsed.error.message}`);
      return new Response("Mentis configuration is invalid", { status: 503 });
    }
    return mcpHandler.fetch(request, parsed.data);
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
