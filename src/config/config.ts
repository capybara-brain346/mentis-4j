import process from "node:process";
import { z } from "zod";

export const CONFIG = {
  app: { name: "mentis-4j", version: "0.1.0", envFile: ".env" },
  neo4j: {
    username: "neo4j",
    defaultUri: "bolt://127.0.0.1:7687",
    defaultDatabase: "neo4j",
    maxReadRows: 100,
    maxReadResponseBytes: 512_000,
    readTimeoutMs: 5_000,
  },
  embedding: {
    endpoint: "https://openrouter.ai/api/v1/embeddings",
    model: "voyageai/voyage-4",
    dimensions: 1024,
  },
  relevance: {
    endpoint: "https://openrouter.ai/api/alpha/decisions",
    model: "typesafe/jev-1.13",
    minimumScore: 0.5,
    batchSize: 20,
  },
  search: {
    defaultLimit: 10,
    maxLimit: 20,
    maxQueryLength: 4_000,
    maxVectorMatches: 200,
    maxAttemptsPerTask: 5,
    previewLength: 240,
  },
  logging: {
    defaultLevel: "debug",
    levels: { debug: 0, info: 1, error: 2 },
  },
  worker: {
    publicBaseUrl: "https://mcp.men-tis.xyz",
    mcpPath: "/mcp",
  },
} as const;

const logLevelSchema = z.enum(["debug", "info", "error"]);
const neo4jPasswordSchema = z
  .string({ error: "NEO4J_PASSWORD is required" })
  .trim()
  .min(1, "NEO4J_PASSWORD is required");

export const environmentSchema = z.object({
  NEO4J_URI: z.string().trim().min(1, "NEO4J_URI must not be empty").optional(),
  NEO4J_USERNAME: z
    .string()
    .trim()
    .min(1, "NEO4J_USERNAME must not be empty")
    .optional(),
  NEO4J_PASSWORD: neo4jPasswordSchema.optional(),
  NEO4J_DATABASE: z
    .string()
    .trim()
    .min(1, "NEO4J_DATABASE must not be empty")
    .optional(),
  OPENROUTER_API_KEY: z
    .string()
    .trim()
    .min(1, "OPENROUTER_API_KEY is required")
    .optional(),
  LOG_LEVEL: logLevelSchema.default(CONFIG.logging.defaultLevel),
});

export const stdioEnvironmentSchema = environmentSchema.extend({
  NEO4J_PASSWORD: neo4jPasswordSchema,
});

export type Environment = Partial<
  Record<keyof typeof environmentSchema.shape, string>
>;
export type RuntimeEnvironment = z.output<typeof environmentSchema>;

export function parseEnvironment(
  env: unknown = process.env,
): RuntimeEnvironment {
  return environmentSchema.parse(env);
}

export function parseStdioEnvironment(
  env: unknown = process.env,
): z.output<typeof stdioEnvironmentSchema> {
  return stdioEnvironmentSchema.parse(env);
}

export function getLogLevel(): keyof typeof CONFIG.logging.levels {
  return logLevelSchema
    .catch(CONFIG.logging.defaultLevel)
    .parse(process.env.LOG_LEVEL);
}

export function getOpenRouterApiKey(configuredApiKey?: string): string {
  const apiKey =
    configuredApiKey === undefined
      ? environmentSchema.shape.OPENROUTER_API_KEY.parse(
          process.env.OPENROUTER_API_KEY,
        )
      : environmentSchema.shape.OPENROUTER_API_KEY.parse(configuredApiKey);
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  return apiKey;
}
