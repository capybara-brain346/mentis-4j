import { CONFIG } from "../config/config.js";

export const recordAttemptQuery = `
  MERGE (r:Repository {workspaceId: $workspaceId, identity: $repository})
  MERGE (t:Task {workspaceId: $workspaceId, identity: $taskId, repositoryIdentity: $repository})
  ON CREATE SET t.createdAt = $recordedAt
  SET t.updatedAt = $recordedAt
  MERGE (r)-[:HAS_TASK]->(t)
  CREATE (a:Attempt {
    workspaceId: $workspaceId,
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

export const markConclusionOutdatedQuery = `
  MATCH (:Repository {workspaceId: $workspaceId, identity: $repository})-[:HAS_TASK]->(t:Task {workspaceId: $workspaceId})-[:HAS_ATTEMPT]->(a:Attempt {workspaceId: $workspaceId, id: $attemptId})
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

export const forgetAttemptQuery = `
  MATCH (:Repository {workspaceId: $workspaceId, identity: $repository})-[:HAS_TASK]->(:Task {workspaceId: $workspaceId})-[:HAS_ATTEMPT]->(a:Attempt {workspaceId: $workspaceId, id: $attemptId})
  WITH a LIMIT 1
  DETACH DELETE a
  RETURN true AS deleted
`;

export const searchQuery = `
  MATCH (r:Repository {workspaceId: $workspaceId, identity: $repository})-[:HAS_TASK]->(t:Task {workspaceId: $workspaceId})-[:HAS_ATTEMPT]->(node:Attempt {workspaceId: $workspaceId})
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

export const recallQuery = `
  MATCH (r:Repository {workspaceId: $workspaceId, identity: $repository})
        -[:HAS_TASK]->(t:Task {workspaceId: $workspaceId, identity: $taskId, repositoryIdentity: $repository})
        -[:HAS_ATTEMPT]->(a:Attempt {workspaceId: $workspaceId})
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
  ORDER BY a.recordedAt DESC
  LIMIT $rowLimit
`;
