import { existsSync } from "node:fs";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONFIG } from "../../config/config.js";
import { parseStdioEnvironment } from "../../config/environment.js";
import { AuraDB } from "../../db/auradb.js";
import { MemoryGraph } from "../../lib/graph.js";
import { logger } from "../../lib/logger.js";
import { registerTools } from "../../lib/tools.js";

async function main(): Promise<void> {
  let database: AuraDB | undefined;

  try {
    if (existsSync(CONFIG.app.envFile)) {
      process.loadEnvFile(CONFIG.app.envFile);
    }
    const env = parseStdioEnvironment();
    database = new AuraDB({
      uri: env.NEO4J_URI ?? CONFIG.neo4j.defaultUri,
      username: env.NEO4J_USERNAME ?? CONFIG.neo4j.username,
      password: env.NEO4J_PASSWORD,
      database: env.NEO4J_DATABASE ?? CONFIG.neo4j.defaultDatabase,
      workspaceId: "local",
    });
    await database.verifyConnectivity();
    await database.ensureConstraints();
    logger.info("Mentis connected to Neo4j");

    const server = new McpServer({
      name: CONFIG.app.name,
      version: CONFIG.app.version,
    });
    registerTools(server, new MemoryGraph(database));

    let closePromise: Promise<void> | undefined;
    const closeDatabase = (): Promise<void> =>
      (closePromise ??= database!.close());
    const reportCloseError = (error: unknown): void => {
      logger.error(`Failed to close Mentis database: ${errorMessage(error)}`);
    };
    server.server.onclose = () => {
      void closeDatabase().catch(reportCloseError);
    };

    const shutdown = (): void => {
      logger.info("Mentis shutting down");
      void server
        .close()
        .then(closeDatabase)
        .catch((error: unknown) => {
          logger.error(
            `Failed to shut down Mentis MCP server: ${errorMessage(error)}`,
          );
          process.exitCode = 1;
        });
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    await server.connect(new StdioServerTransport());
    logger.info("Mentis MCP server ready");
  } catch (error) {
    logger.error(`Failed to start Mentis MCP server: ${errorMessage(error)}`);
    if (database) {
      await database.close().catch((closeError: unknown) => {
        logger.error(
          `Failed to close Mentis database: ${errorMessage(closeError)}`,
        );
      });
    }
    process.exitCode = 1;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

void main();
