import { randomUUID } from "node:crypto";
import neo4j, { type Record as Neo4jRecord } from "neo4j-driver";
import { CONFIG } from "../config/config.js";
import type { Database } from "./db.js";
import { type EmbeddingInputType, embedText } from "./embeddings.js";
import { jevRelevance } from "./jev.js";
import { logger } from "./logger.js";

export type CheckResult = "passed" | "failed";
export type Verification = CheckResult | "unverified";

export interface CheckInput {
  method: string;
  result: CheckResult;
}

export interface RecordAttemptInput {
  repository: string;
  taskId: string;
  codeContext: string;
  action: string;
  affectedFiles: string[];
  observation: string;
  check?: CheckInput;
  inference?: string;
  evidenceReferences?: string[];
  gitCommit?: string;
  gitDirty?: boolean;
}

export interface MarkConclusionOutdatedInput {
  repository: string;
  attemptId: string;
  reason: string;
  latestCommit?: string;
}

export interface ForgetAttemptInput {
  repository: string;
  attemptId: string;
}

export interface ConclusionCorrection {
  reason: string;
  correctedAt: string;
  latestCommit?: string;
}

export interface RecallInput {
  cypher: string;
  parameters?: Record<string, unknown>;
}

export interface SearchInput {
  repository: string;
  query: string;
  limit?: number;
}

export interface SearchCandidate {
  repository: string;
  taskId: string;
  matchedAttemptId: string;
  matchedAttemptPreview: string;
  matchedAttemptVerification: Verification;
  gitCommit?: string;
  gitDirty?: boolean;
  outdated: ConclusionCorrection | null;
  similarity: number;
  relevanceScore: number | null;
}

export interface AttemptRecord {
  id: string;
  repository: string;
  taskId: string;
  codeContext: string;
  action: string;
  affectedFiles: string[];
  observation: string;
  inference?: string;
  check?: CheckInput;
  verification: Verification;
  evidenceReferences: string[];
  recordedAt: string;
  gitCommit?: string;
  gitDirty?: boolean;
  outdated?: ConclusionCorrection;
}

const recordAttemptQuery = `
  MERGE (r:Repository {identity: $repository})
  MERGE (t:Task {identity: $taskId, repositoryIdentity: $repository})
  ON CREATE SET t.createdAt = $recordedAt
  SET t.updatedAt = $recordedAt
  MERGE (r)-[:HAS_TASK]->(t)
  CREATE (a:Attempt {
    id: $attemptId,
    codeContext: $codeContext,
    action: $action,
    affectedFiles: $affectedFiles,
    observation: $observation,
    embedding: $embedding,
    recordedAt: $recordedAt
  })
  SET a.inference = $inference,
      a.checkMethod = $checkMethod,
      a.checkResult = $checkResult,
      a.evidenceReferences = $evidenceReferences,
      a.gitCommit = $gitCommit,
      a.gitDirty = $gitDirty
  CREATE (t)-[:HAS_ATTEMPT]->(a)
  RETURN r.identity AS repository,
         t.identity AS taskId,
         a.id AS id,
         a.codeContext AS codeContext,
         a.action AS action,
         a.affectedFiles AS affectedFiles,
         a.observation AS observation,
         a.inference AS inference,
         a.checkMethod AS checkMethod,
         a.checkResult AS checkResult,
         a.evidenceReferences AS evidenceReferences,
         a.recordedAt AS recordedAt,
         a.gitCommit AS gitCommit,
         a.gitDirty AS gitDirty,
         a.outdatedReason AS outdatedReason,
         a.outdatedAt AS outdatedAt,
         coalesce(a.latestCommit, a.outdatedGitCommit) AS latestCommit
`;

const markConclusionOutdatedQuery = `
  MATCH (:Repository {identity: $repository})-[:HAS_TASK]->(t:Task)-[:HAS_ATTEMPT]->(a:Attempt {id: $attemptId})
  SET a.outdatedReason = $reason,
      a.outdatedAt = $correctedAt,
      a.latestCommit = coalesce($latestCommit, a.latestCommit, a.outdatedGitCommit)
  REMOVE a.outdatedGitCommit
  RETURN a.id AS id,
         t.identity AS taskId,
         $repository AS repository,
         a.codeContext AS codeContext,
         a.action AS action,
         a.affectedFiles AS affectedFiles,
         a.observation AS observation,
         a.inference AS inference,
         a.checkMethod AS checkMethod,
         a.checkResult AS checkResult,
         a.evidenceReferences AS evidenceReferences,
         a.recordedAt AS recordedAt,
         a.gitCommit AS gitCommit,
         a.gitDirty AS gitDirty,
         a.outdatedReason AS outdatedReason,
         a.outdatedAt AS outdatedAt,
         coalesce(a.latestCommit, a.outdatedGitCommit) AS latestCommit
`;

const forgetAttemptQuery = `
  MATCH (:Repository {identity: $repository})-[:HAS_TASK]->(:Task)-[:HAS_ATTEMPT]->(a:Attempt {id: $attemptId})
  WITH a LIMIT 1
  DETACH DELETE a
  RETURN true AS deleted
`;

const searchQuery = `
  MATCH (r:Repository {identity: $repository})-[:HAS_TASK]->(t:Task)-[:HAS_ATTEMPT]->(node:Attempt)
  WHERE node.embedding IS NOT NULL
  WITH r, t, node, vector.similarity.cosine(node.embedding, $embedding) AS score
  ORDER BY score DESC
  LIMIT $candidateLimit
  RETURN r.identity AS repository,
         t.identity AS taskId,
         node.id AS id,
         node.codeContext AS codeContext,
         node.action AS action,
         node.affectedFiles AS affectedFiles,
         node.observation AS observation,
         node.inference AS inference,
         node.checkMethod AS checkMethod,
         node.checkResult AS checkResult,
         node.evidenceReferences AS evidenceReferences,
         node.recordedAt AS recordedAt,
         node.gitCommit AS gitCommit,
         node.gitDirty AS gitDirty,
         node.outdatedReason AS outdatedReason,
         node.outdatedAt AS outdatedAt,
         coalesce(node.latestCommit, node.outdatedGitCommit) AS latestCommit,
         substring(trim(coalesce(node.action, '') + ' — ' + coalesce(node.observation, '')), 0, ${CONFIG.search.previewLength}) AS matchedAttemptPreview,
         score AS similarity
  ORDER BY similarity DESC
`;

interface SearchMatch {
  candidate: SearchCandidate;
  attempt: AttemptRecord;
}

export class MemoryGraph {
  constructor(
    private readonly database: Database,
    private readonly embed: (
      text: string,
      inputType: EmbeddingInputType,
      requestId?: string,
    ) => Promise<number[]> = embedText,
    private readonly relevance: typeof jevRelevance = jevRelevance,
  ) {}

  async recordAttempt(
    input: RecordAttemptInput,
    requestId?: string,
  ): Promise<AttemptRecord> {
    validateRecordAttempt(input);
    const embedding = await this.embed(
      attemptEmbeddingText(input),
      "document",
      requestId,
    );
    logger.debug("record_attempt embedding ready", requestId);
    validateEmbedding(embedding);
    const recordedAt = new Date().toISOString();
    const result = await this.database.writeTx(
      (transaction) =>
        transaction.run(recordAttemptQuery, {
          repository: input.repository,
          taskId: input.taskId,
          attemptId: randomUUID(),
          codeContext: input.codeContext,
          action: input.action,
          affectedFiles: input.affectedFiles,
          observation: input.observation,
          inference: input.inference ?? null,
          checkMethod: input.check?.method ?? null,
          checkResult: input.check?.result ?? "unverified",
          evidenceReferences: input.evidenceReferences ?? [],
          gitCommit: input.gitCommit ?? null,
          gitDirty: input.gitDirty ?? null,
          embedding,
          recordedAt,
        }),
      requestId,
    );
    logger.debug("record_attempt written", requestId);
    return mapAttempt(result.records[0]);
  }

  async markConclusionOutdated(
    input: MarkConclusionOutdatedInput,
    requestId?: string,
  ): Promise<AttemptRecord> {
    validateMarkConclusionOutdated(input);
    const correctedAt = new Date().toISOString();
    const result = await this.database.writeTx(
      (transaction) =>
        transaction.run(markConclusionOutdatedQuery, {
          repository: input.repository,
          attemptId: input.attemptId,
          reason: input.reason,
          correctedAt,
          latestCommit: input.latestCommit ?? null,
        }),
      requestId,
    );
    if (result.records.length === 0) {
      throw new Error("Attempt not found in repository");
    }
    return mapAttempt(result.records[0]);
  }

  async forgetAttempt(
    input: ForgetAttemptInput,
    requestId?: string,
  ): Promise<void> {
    validateForgetAttempt(input);
    const result = await this.database.writeTx(
      (transaction) => transaction.run(forgetAttemptQuery, input),
      requestId,
    );
    if (result.records.length === 0) {
      throw new Error("Attempt not found in repository");
    }
  }

  async search(
    input: SearchInput,
    requestId?: string,
  ): Promise<SearchCandidate[]> {
    const limit = input.limit ?? CONFIG.search.defaultLimit;
    validateSearch(input.repository, input.query, limit);
    const embedding = await this.embed(input.query, "query", requestId);
    logger.debug("search embedding ready", requestId);
    validateEmbedding(embedding);
    const tasks = await this.database.read(
      async (transaction) => {
        const result = await transaction.run(searchQuery, {
          repository: input.repository,
          embedding,
          candidateLimit: neo4j.int(CONFIG.search.maxVectorMatches),
        });
        logger.debug(
          `search fetched ${result.records.length} vector matches`,
          requestId,
        );
        const matches = new Map<string, SearchMatch[]>();
        for (const record of result.records) {
          const attempt = mapAttempt(record);
          const key = JSON.stringify([attempt.repository, attempt.taskId]);
          const taskMatches = matches.get(key) ?? [];
          if (taskMatches.length >= CONFIG.search.maxAttemptsPerTask) continue;
          taskMatches.push({
            attempt,
            candidate: {
              repository: attempt.repository,
              taskId: attempt.taskId,
              matchedAttemptId: attempt.id,
              matchedAttemptPreview: record.get(
                "matchedAttemptPreview",
              ) as string,
              matchedAttemptVerification: attempt.verification,
              ...(attempt.gitCommit === undefined
                ? {}
                : { gitCommit: attempt.gitCommit }),
              ...(attempt.gitDirty === undefined
                ? {}
                : { gitDirty: attempt.gitDirty }),
              outdated: attempt.outdated ?? null,
              similarity: record.get("similarity") as number,
              relevanceScore: null,
            },
          });
          matches.set(key, taskMatches);
        }
        return [...matches.values()];
      },
      undefined,
      requestId,
    );

    try {
      const best = new Map<
        string,
        SearchCandidate & { relevanceScore: number }
      >();
      const matches = tasks.flat();
      for (
        let offset = 0;
        offset < matches.length;
        offset += CONFIG.relevance.batchSize
      ) {
        const scored = await Promise.all(
          matches
            .slice(offset, offset + CONFIG.relevance.batchSize)
            .map(async ({ candidate, attempt }) => ({
              ...candidate,
              relevanceScore: await this.relevance(
                input.query,
                attempt,
                requestId,
              ),
            })),
        );
        for (const candidate of scored) {
          const key = JSON.stringify([candidate.repository, candidate.taskId]);
          const previous = best.get(key);
          if (!previous || candidate.relevanceScore > previous.relevanceScore) {
            best.set(key, candidate);
          }
        }
      }
      return [...best.values()]
        .filter(
          (candidate) =>
            candidate.relevanceScore >= CONFIG.relevance.minimumScore,
        )
        .sort(
          (a, b) =>
            b.relevanceScore - a.relevanceScore || b.similarity - a.similarity,
        )
        .slice(0, limit);
    } catch {
      logger.info(
        "search relevance unavailable; returning vector candidates",
        requestId,
      );
      return tasks.slice(0, limit).map(([{ candidate }]) => candidate);
    }
  }

  async recall(input: RecallInput, requestId?: string) {
    validateRecall(input);
    return this.database.readCypher(
      input.cypher,
      input.parameters ?? {},
      requestId,
    );
  }
}

function attemptEmbeddingText(input: RecordAttemptInput): string {
  return [
    `Repository: ${input.repository}`,
    `Task: ${input.taskId}`,
    `Code context: ${input.codeContext}`,
    `Action: ${input.action}`,
    `Affected files: ${input.affectedFiles.join(", ")}`,
    `Observation: ${input.observation}`,
    `Inference: ${input.inference ?? "none"}`,
    `Check: ${input.check ? `${input.check.method} (${input.check.result})` : "unverified"}`,
    `Evidence references: ${input.evidenceReferences?.join(", ") ?? "none"}`,
  ].join("\n");
}

function validateRecordAttempt(input: RecordAttemptInput): void {
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

function validateMarkConclusionOutdated(
  input: MarkConclusionOutdatedInput,
): void {
  requireText(input.repository);
  requireText(input.attemptId);
  requireText(input.reason);
  if (input.latestCommit !== undefined) requireGitCommit(input.latestCommit);
}

function validateForgetAttempt(input: ForgetAttemptInput): void {
  requireText(input.repository);
  requireText(input.attemptId);
}

function validateSearch(
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

function validateRecall(input: RecallInput): void {
  requireText(input.cypher);
  if (input.cypher.length > CONFIG.recall.maxCypherLength) {
    throw new Error(
      `cypher must be at most ${CONFIG.recall.maxCypherLength} characters`,
    );
  }
  if (input.parameters !== undefined && typeof input.parameters !== "object") {
    throw new Error("parameters must be an object");
  }
  for (const key of Object.keys(input.parameters ?? {})) {
    if (key.startsWith(CONFIG.recall.reservedParameterPrefix)) {
      throw new Error(
        `parameter names starting with ${CONFIG.recall.reservedParameterPrefix} are reserved`,
      );
    }
  }
}

function validateEmbedding(embedding: number[]): void {
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

function mapAttempt(record: Neo4jRecord): AttemptRecord {
  const checkMethod = record.get("checkMethod") as string | null;
  const checkResult = record.get("checkResult") as Verification;
  if (
    checkResult !== "passed" &&
    checkResult !== "failed" &&
    checkResult !== "unverified"
  ) {
    throw new Error("Neo4j returned an invalid check result");
  }

  const outdated = mapCorrection(record);
  return {
    id: record.get("id") as string,
    repository: record.get("repository") as string,
    taskId: record.get("taskId") as string,
    codeContext: record.get("codeContext") as string,
    action: record.get("action") as string,
    affectedFiles: record.get("affectedFiles") as string[],
    observation: record.get("observation") as string,
    ...(record.get("inference") == null
      ? {}
      : { inference: record.get("inference") as string }),
    ...(checkMethod == null
      ? {}
      : { check: { method: checkMethod, result: checkResult as CheckResult } }),
    verification: checkResult,
    evidenceReferences: record.get("evidenceReferences") as string[],
    recordedAt: record.get("recordedAt") as string,
    ...(record.get("gitCommit") == null
      ? {}
      : { gitCommit: record.get("gitCommit") as string }),
    ...(record.get("gitDirty") == null
      ? {}
      : { gitDirty: record.get("gitDirty") as boolean }),
    ...(outdated ? { outdated } : {}),
  };
}

function mapCorrection(record: Neo4jRecord): ConclusionCorrection | undefined {
  const reason = record.get("outdatedReason") as string | null;
  const correctedAt = record.get("outdatedAt") as string | null;
  if (reason == null || correctedAt == null) return undefined;
  const latestCommit = record.get("latestCommit") as string | null;
  return {
    reason,
    correctedAt,
    ...(latestCommit == null ? {} : { latestCommit }),
  };
}
