import { CONFIG, getOpenRouterApiKey } from "../config/config.js";
import type { AttemptRecord } from "./graph.js";
import { logger } from "./logger.js";

export const JEV_MODEL = CONFIG.relevance.model;

export async function jevRelevance(
  query: string,
  attempt: AttemptRecord,
  requestId?: string,
  configuredApiKey?: string,
): Promise<number> {
  const apiKey = getOpenRouterApiKey(configuredApiKey);

  logger.debug("relevance request started", requestId);
  const response = await fetch(CONFIG.relevance.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      state: { query, attempt },
      questions: {
        usefulness: {
          type: "noul",
          instructions:
            "Is this matched attempt useful for solving the problem described by the search query?",
          criteria: {
            true: "The attempt provides relevant evidence, context, or a reusable approach for the query.",
            false:
              "The attempt is unrelated or provides no useful information for the query.",
          },
        },
      },
    }),
  });
  if (!response.ok) {
    logger.debug(`relevance request returned ${response.status}`, requestId);
    throw new Error(`OpenRouter Jev request failed (${response.status})`);
  }

  const body: unknown = await response.json();
  if (!isJevResponse(body)) {
    throw new Error("OpenRouter returned an invalid Jev decision response");
  }
  logger.debug("relevance request completed", requestId);
  return body.answers.usefulness.noul;
}

function isJevResponse(
  value: unknown,
): value is { answers: { usefulness: { noul: number } } } {
  if (!isRecord(value)) return false;
  const answers = value.answers;
  if (!isRecord(answers)) return false;
  const usefulness = answers.usefulness;
  if (!isRecord(usefulness)) return false;
  const probability = usefulness.noul;
  return (
    typeof probability === "number" &&
    Number.isFinite(probability) &&
    probability >= 0 &&
    probability <= 1
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
