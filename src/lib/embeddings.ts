import { CONFIG } from "../config/config.js";
import { getOpenRouterApiKey } from "../config/environment.js";
import { logger } from "./logger.js";

export const EMBEDDING_MODEL = CONFIG.embedding.model;
export const EMBEDDING_DIMENSIONS = CONFIG.embedding.dimensions;

export type EmbeddingInputType = "document" | "query";

export async function embedText(
  text: string,
  inputType: EmbeddingInputType,
  requestId?: string,
  configuredApiKey?: string,
): Promise<number[]> {
  const apiKey = getOpenRouterApiKey(configuredApiKey);

  logger.debug(`embedding request started (${inputType})`, requestId);
  const response = await fetch(CONFIG.embedding.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    logger.debug(`embedding request returned ${response.status}`, requestId);
    throw new Error(`OpenRouter embedding request failed (${response.status})`);
  }

  const body: unknown = await response.json();
  if (!isEmbeddingResponse(body)) {
    throw new Error("OpenRouter returned an invalid embedding response");
  }

  const embedding = body.data[0].embedding;
  if (
    embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every((value) => Number.isFinite(value))
  ) {
    throw new Error(
      `OpenRouter returned an embedding with invalid dimensions (expected ${EMBEDDING_DIMENSIONS})`,
    );
  }
  logger.debug("embedding request completed", requestId);
  return embedding;
}

function isEmbeddingResponse(
  value: unknown,
): value is { data: Array<{ embedding: number[] }> } {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return false;
  }
  const data = value.data;
  if (!Array.isArray(data) || data.length !== 1) return false;
  const first = data[0];
  return (
    typeof first === "object" &&
    first !== null &&
    "embedding" in first &&
    Array.isArray(first.embedding) &&
    first.embedding.every((entry: unknown) => typeof entry === "number")
  );
}
