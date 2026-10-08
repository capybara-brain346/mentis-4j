import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { preserveGraderOutput } from "../grade.js";
import {
  initializeRun,
  outputPaths,
  recordAttempt,
  type Manifest,
} from "../run.js";

function manifestFixture(): Manifest {
  const experienceIds = Array.from(
    { length: 50 },
    (_, index) => `experience-${String(index + 1).padStart(2, "0")}`,
  );
  const targetIds = Array.from(
    { length: 17 },
    (_, index) => `target-${String(index + 1).padStart(2, "0")}`,
  );
  const tasks = [
    ...experienceIds.map((task_id) => ({
      task_id,
      role: "experience" as const,
      repository: "example/repo",
      base_commit: "a".repeat(40),
      created_at: "2020-01-01T00:00:00Z",
      problem_statement: "Synthetic experience task.",
    })),
    ...targetIds.map((task_id) => ({
      task_id,
      role: "target" as const,
      repository: "example/repo",
      base_commit: "b".repeat(40),
      created_at: "2021-01-01T00:00:00Z",
      problem_statement: "Synthetic target task.",
    })),
  ];
  return {
    schema_version: 1,
    run_id: "test-run",
    benchmark: {
      name: "SWE-ContextBench Lite",
      source_repository: "https://github.com/jiayuanz3/SWEContextBench",
      source_commit: "12ad6ab14e18e9378e1e293c9edbc3f7ce43d27b",
      dataset_repository:
        "https://huggingface.co/datasets/jiayuanz3/SWEContextBench",
      dataset_revision: "12c65bd15e2559bc808065565e941ee7bbbd008f",
      dataset_files: [
        "data/SWEContextBench_Lite_Experience.parquet",
        "data/SWEContextBench_Related_Lite.parquet",
        "data/SWEContextBench_Relationship.parquet",
      ],
      dataset_sha256: {
        "SWEContextBench_Lite_Experience.parquet":
          "7a21f37b8bc179c7db5beeb14e88ac538ba283455c776e6b2535bbfb6e3551b4",
        "SWEContextBench_Related_Lite.parquet":
          "1930b392f7beb17a0d87c2e79d1eb889af2c5996b23a003386651ba64a68b8f3",
        "SWEContextBench_Relationship.parquet":
          "f59b1a0fd021c6608bd185f15113cbbd26f804c20494da6d4827adb9ea70edb5",
      },
      target_count: 17,
      experience_count: 50,
      lite_target_count: 99,
      scope: "paired-subset",
    },
    agent: {
      codex_version: "0.156.1",
      model: "gpt-6-luna",
      reasoning_effort: "xhigh",
    },
    evaluation: { python_version: "3.11.13", requirements: [] },
    execution: {
      prompt_version: "mentis-lite-paired-v1",
      prompt_templates: {
        common:
          "Solve this repository task. Work only in /testbed. Inspect the code, make the smallest correct change, and run relevant local checks. Do not claim a check passed unless you ran it.\n\nTask: {task_id}\nRepository: {repository}\nBase commit: {base_commit}\n\nProblem statement:\n{problem_statement}\n",
        experience:
          "{common}\nMentis is available. Search for related prior attempts before editing. At the end, you MUST call record_attempt with the actual actions, affected files, observations, and only checks you really ran. Keep observation separate from inference. Never include secrets.\n",
        baseline:
          "{common}\nNo Mentis tools are configured for this baseline trial.\n",
        mentis:
          "{common}\nUse Mentis search before editing, then recall the full history of any useful candidate. Mentis is read-only for this trial: do not attempt to record an attempt.\n",
      },
      limits: { wall_clock_seconds: 1800, attempts_per_task_per_arm: 1 },
      task_order_policy:
        "experience_task_ids in manifest order; for each target in target_task_ids order, run baseline then mentis; one separate linked-pair gate before the 17-target cohort",
    },
    experience_task_ids: experienceIds,
    target_task_ids: targetIds,
    tasks,
  };
}

test("output paths stay inside the run and reject unsafe IDs or attempt numbers", () => {
  const paths = outputPaths("/tmp/run", "target-01", 2);
  assert.equal(
    paths.relative.events,
    "codex-events/target-01/attempt-0002.jsonl",
  );
  assert.equal(paths.relative.patch, "patches/target-01/attempt-0002.patch");
  for (const value of [
    paths.events,
    paths.patch,
    paths.prediction,
    paths.graderOutput,
  ]) {
    assert.equal(relative(resolve("/tmp/run"), value).startsWith(".."), false);
  }
  assert.throws(
    () => outputPaths("/tmp/run", "../escape", 1),
    /unsafe task ID/,
  );
  assert.throws(
    () => outputPaths("/tmp/run", "target-01", 0),
    /positive safe integer/,
  );
});

test("failed attempts retain logs, patches, predictions, and explicit no-patch records", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "swe-context-bench-"));
  const manifest = manifestFixture();
  const patch =
    "diff --git a/example.py b/example.py\n--- a/example.py\n+++ b/example.py\n";
  try {
    await initializeRun(manifest, runDir);
    await recordAttempt(manifest, runDir, {
      task_id: "target-01",
      attempt: 1,
      exit_code: 1,
      elapsed_ms: 1234,
      arm: "baseline",
      error: "Codex exited non-zero",
      events: '{"type":"turn.failed"}\n',
      event_timing: [{ end_byte_offset: 23, elapsed_ms: 1000 }],
      patch,
    });
    await recordAttempt(manifest, runDir, {
      task_id: "target-01",
      attempt: 2,
      exit_code: null,
      elapsed_ms: 0,
      arm: "mentis",
      error: "Codex process failed to start",
      events: "",
      patch: null,
    });

    const manifestText = await readFile(join(runDir, "manifest.json"), "utf8");
    assert.equal(JSON.parse(manifestText).tasks.length, 67);
    assert.doesNotMatch(
      manifestText,
      /reference_patch|test_patch|expected_test_ids/,
    );
    const records = (await readFile(join(runDir, "attempts.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map(({ arm, elapsed_ms }) => [arm, elapsed_ms]),
      [
        ["baseline", 1234],
        ["mentis", 0],
      ],
    );
    assert.deepEqual(
      records.map(({ status, patch_status }) => [status, patch_status]),
      [
        ["failed", "present"],
        ["failed", "no_patch"],
      ],
    );
    assert.equal(records[1].patch_path, null);
    assert.equal(records[1].prediction_path, null);
    assert.equal(records[1].event_timing_path, null);
    assert.deepEqual(
      JSON.parse(
        await readFile(join(runDir, records[0].event_timing_path), "utf8"),
      ),
      [{ end_byte_offset: 23, elapsed_ms: 1000 }],
    );

    const first = outputPaths(runDir, "target-01", 1);
    const second = outputPaths(runDir, "target-01", 2);
    assert.equal(
      await readFile(first.events, "utf8"),
      '{"type":"turn.failed"}\n',
    );
    assert.equal(await readFile(first.patch, "utf8"), patch);
    assert.equal(
      JSON.parse(await readFile(first.prediction, "utf8"))["target-01"]
        .model_patch,
      patch,
    );
    await access(second.events);
    await assert.rejects(access(second.patch));
    await access(join(runDir, "grader-output"));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("grader output is preserved byte-for-byte and not overwritten", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "swe-context-grade-"));
  const raw = Buffer.from([0x7b, 0x22, 0xff, 0x00, 0x7d]);
  try {
    await initializeRun(manifestFixture(), runDir);
    const outputPath = await preserveGraderOutput(runDir, "target-01", 1, raw);
    assert.deepEqual(await readFile(outputPath), raw);
    await assert.rejects(
      preserveGraderOutput(runDir, "target-01", 1, Buffer.from("changed")),
    );
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
