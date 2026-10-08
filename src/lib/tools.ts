import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CONFIG } from "../config/config.js";
import type { MemoryGraph } from "./graph.js";
import { logger } from "./logger.js";

const text = z.string().trim().min(1);
const files = z.array(text).min(1);
const gitCommit = text.regex(/^[\da-f]{4,64}$/i);

export function registerTools(server: McpServer, graph: MemoryGraph): void {
  server.registerTool(
    "search",
    {
      description:
        "Find candidate tasks within one repository by semantic similarity. From the client's checkout, check `git rev-parse --is-inside-work-tree`. If inside a Git repo, use `git remote get-url origin`; if that fails, report an error and do not call search. If outside Git, use the absolute working-directory path (`pwd -P`). Returns at most limit distinct tasks, not limit vector matches. Each task identifies its matched attempt and exposes its recorded Git state and outdated status. Similarity is not a success rating; inspect full histories with recall before reusing anything.",
      inputSchema: z
        .object({
          repository: text.describe(
            "Client checkout's `git remote get-url origin`, or absolute working-directory path only when outside Git; do not fall back if origin is missing",
          ),
          query: text
            .max(CONFIG.search.maxQueryLength)
            .describe("Natural-language problem or context"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(CONFIG.search.maxLimit)
            .default(CONFIG.search.defaultLimit)
            .describe(
              "Maximum number of distinct task results (not vector matches)",
            ),
        })
        .strict(),
    },
    async (input) => {
      const requestId = randomUUID();
      const started = Date.now();
      logger.debug("search started", requestId);
      try {
        const candidates = await graph.search(input, requestId);
        logger.info(
          `search completed: ${candidates.length} candidates in ${Date.now() - started}ms`,
          requestId,
        );
        return {
          structuredContent: { status: "ok", candidates },
          content: [
            {
              type: "text" as const,
              text: `Found ${candidates.length} candidate task(s). Similarity is not a success rating.\n${JSON.stringify(candidates)}`,
            },
          ],
        };
      } catch (error) {
        logger.error(
          `search failed after ${Date.now() - started}ms`,
          requestId,
        );
        throw new Error(`Failed to search memory: ${errorMessage(error)}`);
      }
    },
  );

  server.registerTool(
    "recall",
    {
      description:
        "Read the ordered attempt history for one task in the current workspace. The server uses a fixed read query and returns at most the requested number of attempts.",
      inputSchema: z
        .object({
          repository: text,
          taskId: text,
          limit: z
            .number()
            .int()
            .min(1)
            .max(CONFIG.neo4j.maxReadRows)
            .default(CONFIG.neo4j.maxReadRows),
        })
        .strict(),
    },
    async (input) => {
      const requestId = randomUUID();
      const started = Date.now();
      logger.debug("recall started", requestId);
      try {
        const result = await graph.recall(input, requestId);
        logger.info(
          `recall completed: ${result.attempts.length} attempts in ${Date.now() - started}ms`,
          requestId,
        );
        return {
          structuredContent: { status: "ok", ...result },
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        logger.error(
          `recall failed after ${Date.now() - started}ms`,
          requestId,
        );
        throw new Error(`Failed to recall memory: ${errorMessage(error)}`);
      }
    },
  );

  server.registerTool(
    "record_attempt",
    {
      description:
        "Record one task-scoped action and its observation. Inference is separate; omit check when none ran (unverified). Git state is agent-reported, not detected by the server.",
      inputSchema: z
        .object({
          repository: text.describe(
            "Client checkout's `git remote get-url origin`, or absolute working-directory path only when outside Git; do not fall back if origin is missing",
          ),
          taskId: text.describe(
            "Identity of this investigation, not a symptom shared by tasks",
          ),
          codeContext: text.describe(
            "Framework, environment, or other code context when the action occurred",
          ),
          action: text,
          affectedFiles: files,
          observation: text.describe(
            "What was observed, not an inferred cause",
          ),
          check: z
            .object({
              method: text.describe(
                "Command or manual check actually performed",
              ),
              result: z.enum(["passed", "failed"]),
            })
            .strict()
            .optional(),
          inference: z
            .string()
            .optional()
            .describe("Revisable interpretation, distinct from observation"),
          evidenceReferences: z.array(text).optional(),
          gitCommit: gitCommit
            .optional()
            .describe("Agent-reported Git commit SHA when the action occurred"),
          gitDirty: z
            .boolean()
            .optional()
            .describe("Whether the working tree had uncommitted changes"),
        })
        .strict(),
    },
    async (input) => {
      const requestId = randomUUID();
      const started = Date.now();
      logger.debug("record_attempt started", requestId);
      try {
        const attempt = await graph.recordAttempt(input, requestId);
        logger.info(
          `record_attempt completed in ${Date.now() - started}ms`,
          requestId,
        );
        return {
          structuredContent: { status: "recorded", recorded: true, attempt },
          content: [
            {
              type: "text" as const,
              text: `Recorded attempt ${attempt.id}; verification: ${attempt.verification}.`,
            },
          ],
        };
      } catch (error) {
        logger.error(
          `record_attempt failed after ${Date.now() - started}ms`,
          requestId,
        );
        throw new Error(`Failed to record attempt: ${errorMessage(error)}`);
      }
    },
  );

  server.registerTool(
    "mark_conclusion_outdated",
    {
      description:
        "Mark one attempt's inference outdated without changing or removing its action, observation, inference, or check. The correction is scoped to that repository and attempt.",
      inputSchema: z
        .object({
          repository: text,
          attemptId: text,
          reason: text.describe("Why the conclusion no longer applies"),
          latestCommit: gitCommit
            .optional()
            .describe("Agent-reported latest Git commit when marking outdated"),
        })
        .strict(),
    },
    async (input) => {
      const requestId = randomUUID();
      try {
        const attempt = await graph.markConclusionOutdated(input, requestId);
        return {
          structuredContent: {
            status: "marked_outdated",
            attemptId: attempt.id,
            outdated: attempt.outdated,
          },
          content: [
            {
              type: "text" as const,
              text: `Marked conclusion for attempt ${attempt.id} outdated. Original attempt evidence remains available.`,
            },
          ],
        };
      } catch (error) {
        logger.error("mark_conclusion_outdated failed", requestId);
        throw new Error(
          `Failed to mark conclusion outdated: ${errorMessage(error)}`,
        );
      }
    },
  );

  server.registerTool(
    "forget_attempt",
    {
      description:
        "Permanently remove one attempt and its embedding from the live graph, scoped to a repository. Other attempts remain. This cannot retract prior responses or backups.",
      inputSchema: z.object({ repository: text, attemptId: text }).strict(),
    },
    async (input) => {
      const requestId = randomUUID();
      try {
        await graph.forgetAttempt(input, requestId);
        return {
          structuredContent: {
            status: "forgotten",
            forgotten: true,
            attemptId: input.attemptId,
          },
          content: [
            {
              type: "text" as const,
              text: `Forgot attempt ${input.attemptId} from the live graph.`,
            },
          ],
        };
      } catch (error) {
        logger.error("forget_attempt failed", requestId);
        throw new Error(`Failed to forget attempt: ${errorMessage(error)}`);
      }
    },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
