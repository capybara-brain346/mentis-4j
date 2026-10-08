import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";

export interface Task {
  task_id: string;
  role: "experience" | "target";
  repository: string;
  base_commit: string;
  created_at: string | null;
  problem_statement: string;
}

export interface Manifest {
  schema_version: 1;
  run_id: string;
  benchmark: Record<string, unknown>;
  agent: { codex_version: string; model: string; reasoning_effort: string };
  evaluation: Record<string, unknown>;
  execution: {
    prompt_version: string;
    prompt_templates: Record<string, string>;
    limits: { wall_clock_seconds: number; attempts_per_task_per_arm: number };
    task_order_policy: string;
  };
  experience_task_ids: string[];
  target_task_ids: string[];
  tasks: Task[];
}

export interface AttemptInput {
  task_id: string;
  attempt: number;
  exit_code: number | null;
  elapsed_ms: number;
  arm: "experience" | "baseline" | "mentis";
  events: string;
  event_timing?: Array<{ end_byte_offset: number; elapsed_ms: number }>;
  patch: string | null;
  error?: string;
  failure_kind?: "infrastructure" | "codex_failure";
  image_id?: string | null;
  token_usage?: {
    input_tokens: number | null;
    cached_input_tokens: number | null;
    output_tokens: number | null;
  } | null;
  memory_calls?: string[] | null;
  retrieved_task_ids?: string[] | null;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeId(value: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`unsafe task ID: ${value}`);
  }
  return value;
}

function inside(root: string, ...parts: string[]): string {
  const absoluteRoot = resolve(root);
  const output = resolve(absoluteRoot, ...parts);
  const fromRoot = relative(absoluteRoot, output);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new Error("artifact path escapes run directory");
  }
  return output;
}

function relativeOutput(root: string, output: string): string {
  return relative(resolve(root), output).split(sep).join("/");
}

export function outputPaths(runDir: string, taskId: string, attempt: number) {
  safeId(taskId);
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("attempt must be a positive safe integer");
  }
  const name = `attempt-${String(attempt).padStart(4, "0")}`;
  const root = resolve(runDir);
  const events = inside(root, "codex-events", taskId, `${name}.jsonl`);
  const patch = inside(root, "patches", taskId, `${name}.patch`);
  const prediction = inside(root, "predictions", taskId, `${name}.json`);
  const graderOutput = inside(root, "grader-output", taskId, `${name}.json`);
  return {
    events,
    patch,
    prediction,
    graderOutput,
    relative: {
      events: relativeOutput(root, events),
      patch: relativeOutput(root, patch),
      prediction: relativeOutput(root, prediction),
      graderOutput: relativeOutput(root, graderOutput),
    },
  };
}

export async function initializeRun(
  manifest: Manifest,
  runDir: string,
): Promise<void> {
  const validator = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "prepare.py",
  );
  execFileSync("python3", [validator, "validate", "-"], {
    input: JSON.stringify(manifest),
    stdio: ["pipe", "ignore", "inherit"],
  });
  if (!Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
    throw new Error("manifest must contain selected tasks");
  }
  const taskIds = manifest.tasks.map((task) => safeId(task.task_id));
  if (new Set(taskIds).size !== taskIds.length)
    throw new Error("duplicate task IDs in manifest");

  const root = resolve(runDir);
  await mkdir(root, { recursive: true });
  for (const directory of [
    "codex-events",
    "patches",
    "predictions",
    "grader-output",
  ]) {
    await mkdir(inside(root, directory), { recursive: true });
  }
  await writeFile(
    inside(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      flag: "wx",
    },
  );
  await writeFile(inside(root, "attempts.jsonl"), "", { flag: "wx" });
}

export async function recordAttempt(
  manifest: Manifest,
  runDir: string,
  input: AttemptInput,
): Promise<void> {
  const taskId = safeId(input.task_id);
  const task = manifest.tasks.find((candidate) => candidate.task_id === taskId);
  if (!task) throw new Error(`task is not selected: ${taskId}`);
  if (input.exit_code !== null && !Number.isSafeInteger(input.exit_code)) {
    throw new Error("exit_code must be an integer or null");
  }
  if (!Number.isSafeInteger(input.elapsed_ms) || input.elapsed_ms < 0) {
    throw new Error("elapsed_ms must be a non-negative safe integer");
  }
  const paths = outputPaths(runDir, taskId, input.attempt);
  await mkdir(dirname(paths.events), { recursive: true });
  await mkdir(dirname(paths.patch), { recursive: true });
  await mkdir(dirname(paths.prediction), { recursive: true });

  await writeFile(paths.events, input.events, { flag: "wx" });
  const timingPath = `${paths.events}.timing.json`;
  if (input.event_timing !== undefined) {
    await writeFile(timingPath, `${JSON.stringify(input.event_timing)}\n`, {
      flag: "wx",
    });
  }
  if (input.patch !== null) {
    await writeFile(paths.patch, input.patch, { flag: "wx" });
    await writeFile(
      paths.prediction,
      `${JSON.stringify(
        {
          [taskId]: {
            model_name_or_path: manifest.agent.model,
            instance_id: taskId,
            model_patch: input.patch,
          },
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
  }

  const record = {
    task_id: taskId,
    role: task.role,
    attempt: input.attempt,
    arm: input.arm,
    status: input.exit_code === 0 ? "completed" : "failed",
    exit_code: input.exit_code,
    elapsed_ms: input.elapsed_ms,
    error: input.error ?? null,
    failure_kind: input.failure_kind ?? null,
    image_id: input.image_id ?? null,
    token_usage: input.token_usage ?? null,
    memory_calls: input.memory_calls ?? null,
    retrieved_task_ids: input.retrieved_task_ids ?? null,
    patch_status: input.patch === null ? "no_patch" : "present",
    events_path: paths.relative.events,
    event_timing_path:
      input.event_timing === undefined
        ? null
        : relativeOutput(runDir, timingPath),
    patch_path: input.patch === null ? null : paths.relative.patch,
    prediction_path: input.patch === null ? null : paths.relative.prediction,
  };
  // ponytail: sequential record-last writes; add staging/locking if crash recovery or parallel attempts are needed.
  await appendFile(
    inside(runDir, "attempts.jsonl"),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const [manifestArg, runDirArg] = process.argv.slice(2);
  if (!manifestArg || !runDirArg || process.argv.length !== 4) {
    throw new Error("usage: node .data/run.js <manifest.json> <run-directory>");
  }
  const manifestPath = resolve(manifestArg);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  await initializeRun(manifest, runDirArg);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
