import { CONFIG } from "../config/config.js";
import type {
  ForgetAttemptInput,
  MarkConclusionOutdatedInput,
  RecallInput,
  RecordAttemptInput,
} from "../lib/graph-types.js";

export function validateRecordAttempt(input: RecordAttemptInput): void {
  for (const value of [
    input.repository,
    input.taskId,
    input.codeContext,
    input.action,
    input.observation,
  ]) {
    requireText(value);
  }
  requireTextList(input.affectedFiles);
  if (input.check) {
    requireText(input.check.method);
    if (input.check.result !== "passed" && input.check.result !== "failed") {
      throw new Error("check.result must be passed or failed");
    }
  }
  if (input.inference !== undefined) requireText(input.inference);
  if (input.evidenceReferences !== undefined)
    requireTextList(input.evidenceReferences, true);
  if (input.gitCommit !== undefined) requireGitCommit(input.gitCommit);
  if (input.gitDirty !== undefined && typeof input.gitDirty !== "boolean") {
    throw new Error("gitDirty must be a boolean");
  }
}

export function validateMarkConclusionOutdated(
  input: MarkConclusionOutdatedInput,
): void {
  requireText(input.repository);
  requireText(input.attemptId);
  requireText(input.reason);
  if (input.latestCommit !== undefined) requireGitCommit(input.latestCommit);
}

export function validateForgetAttempt(input: ForgetAttemptInput): void {
  requireText(input.repository);
  requireText(input.attemptId);
}

export function validateSearch(
  repository: string,
  query: string,
  limit: number,
): void {
  requireText(repository);
  requireText(query);
  if (query.length > CONFIG.search.maxQueryLength)
    throw new Error(
      `query must be at most ${CONFIG.search.maxQueryLength} characters`,
    );
  if (!Number.isInteger(limit) || limit < 1 || limit > CONFIG.search.maxLimit) {
    throw new Error(
      `limit must be an integer from 1 to ${CONFIG.search.maxLimit}`,
    );
  }
}

export function validateRecall(input: RecallInput, limit: number): void {
  requireText(input.repository);
  requireText(input.taskId);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > CONFIG.neo4j.maxReadRows
  ) {
    throw new Error(
      `limit must be an integer from 1 to ${CONFIG.neo4j.maxReadRows}`,
    );
  }
}

export function validateEmbedding(embedding: number[]): void {
  if (
    !Array.isArray(embedding) ||
    embedding.length !== CONFIG.embedding.dimensions ||
    !embedding.every(Number.isFinite)
  ) {
    throw new Error(
      `Embedding must contain ${CONFIG.embedding.dimensions} finite numbers`,
    );
  }
}

function requireText(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Expected a non-empty string");
  }
}

function requireTextList(values: string[], allowEmpty = false): void {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error("Expected a non-empty string array");
  }
  for (const value of values) requireText(value);
}

function requireGitCommit(value: string): void {
  if (!/^[\da-f]{4,64}$/i.test(value)) {
    throw new Error("gitCommit must be a hexadecimal Git commit SHA");
  }
}
