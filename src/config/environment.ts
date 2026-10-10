import process from "node:process";
import { z } from "zod";
import { CONFIG } from "./config.js";

const logLevelNames = Object.keys(CONFIG.logging.levels) as [
  keyof typeof CONFIG.logging.levels,
  ...(keyof typeof CONFIG.logging.levels)[],
];
const logLevelSchema = z.enum(logLevelNames);
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

export type Environment = Partial<
  Record<keyof typeof environmentSchema.shape, string>
>;
export type RuntimeEnvironment = z.output<typeof environmentSchema>;

export function parseEnvironment(
  env: unknown = process.env,
): RuntimeEnvironment {
  return environmentSchema.parse(env);
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

export function parsePositiveIntegerEnvironment(
  value: string | undefined,
  name: string,
): number {
  if (!value?.trim()) throw new Error(`${name} is required`);
  const parsedValue = Number(value.trim());
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsedValue;
}
