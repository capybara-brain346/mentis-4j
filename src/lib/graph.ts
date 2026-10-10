import { randomUUID } from "node:crypto";
import neo4j from "neo4j-driver";
import { CONFIG } from "../config/config.js";
import type { AuraDB } from "../db/auradb.js";
import { attemptEmbeddingText, mapAttempt } from "../utils/graph-records.js";
import {
  validateEmbedding,
  validateForgetAttempt,
  validateMarkConclusionOutdated,
  validateRecall,
  validateRecordAttempt,
  validateSearch,
} from "../utils/graph-validation.js";
import { type EmbeddingInputType, embedText } from "./embeddings.js";
import {
  forgetAttemptQuery,
  markConclusionOutdatedQuery,
  recallQuery,
  recordAttemptQuery,
  searchQuery,
} from "./graph-queries.js";
import type {
  AttemptRecord,
  ForgetAttemptInput,
  MarkConclusionOutdatedInput,
  RecallInput,
  RecordAttemptInput,
  SearchCandidate,
  SearchInput,
} from "./graph-types.js";
import { jevRelevance } from "./jev.js";
import { logger } from "./logger.js";

export type {
  AttemptRecord,
  CheckInput,
  CheckResult,
  ConclusionCorrection,
  ForgetAttemptInput,
  MarkConclusionOutdatedInput,
  RecallInput,
  RecordAttemptInput,
  SearchCandidate,
  SearchInput,
  Verification,
} from "./graph-types.js";

interface SearchMatch {
  candidate: SearchCandidate;
  attempt: AttemptRecord;
}

export class MemoryGraph {
  constructor(
    private readonly database: AuraDB,
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
      (transaction) => transaction.run(forgetAttemptQuery, { ...input }),
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
    const limit = input.limit ?? CONFIG.neo4j.maxReadRows;
    validateRecall(input, limit);
    const result = await this.database.read(
      (transaction) =>
        transaction.run(recallQuery, {
          repository: input.repository,
          taskId: input.taskId,
          rowLimit: neo4j.int(limit + 1),
        }),
      undefined,
      requestId,
    );
    const attempts: AttemptRecord[] = [];
    let responseBytes = new TextEncoder().encode(
      JSON.stringify({ attempts: [], truncated: false }),
    ).length;
    let truncated = result.records.length > limit;
    for (const record of result.records.slice(0, limit)) {
      const attempt = mapAttempt(record);
      const bytes =
        new TextEncoder().encode(JSON.stringify(attempt)).length +
        (attempts.length > 0 ? 1 : 0);
      if (responseBytes + bytes > CONFIG.neo4j.maxReadResponseBytes) {
        truncated = true;
        break;
      }
      attempts.push(attempt);
      responseBytes += bytes;
    }
    return {
      attempts,
      truncated,
    };
  }
}
