import type { Record as Neo4jRecord } from "neo4j-driver";
import type {
  AttemptRecord,
  CheckResult,
  ConclusionCorrection,
  RecordAttemptInput,
  Verification,
} from "../lib/graph-types.js";

export function attemptEmbeddingText(input: RecordAttemptInput): string {
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

export function mapAttempt(record: Neo4jRecord): AttemptRecord {
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

export function mapCorrection(
  record: Neo4jRecord,
): ConclusionCorrection | undefined {
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
