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
  repository: string;
  taskId: string;
  limit?: number;
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
