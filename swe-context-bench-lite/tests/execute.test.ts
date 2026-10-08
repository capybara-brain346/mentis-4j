import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  auditContainerMounts,
  capturePatch,
  codexConfig,
  eventMetrics,
  experienceTaskImageFor,
  taskImageFor,
} from "../execute.js";

test("task image tags follow the pinned benchmark naming convention", () => {
  assert.equal(
    taskImageFor({ task_id: "sympy__sympy-21149" }),
    "jiayuanz3/swecontextbench:sympy.sympy-21149",
  );
  assert.throws(() => taskImageFor({ task_id: "../grader" }), /unsafe task ID/);
});

test("experience images use the pinned benchmark builder tag", () => {
  assert.equal(
    experienceTaskImageFor({ task_id: "sympy__sympy-20590" }),
    "sweb.simple.sympy.sympy-20590:latest",
  );
  assert.throws(
    () => experienceTaskImageFor({ task_id: "../grader" }),
    /unsafe task ID/,
  );
});

test("captured patch includes untracked files and preserves trailing whitespace", async () => {
  const checkout = await mkdtemp(join(tmpdir(), "mentis-patch-"));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: checkout, stdio: "ignore" });
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "Benchmark"]);
    git(["config", "user.email", "benchmark@example.invalid"]);
    await writeFile(join(checkout, "base.txt"), "base\n");
    git(["add", "."]);
    git(["commit", "-qm", "base"]);
    const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: checkout,
      encoding: "utf8",
    }).trim();
    await writeFile(join(checkout, "new.py"), "line\n trailing  \n");

    const patch = capturePatch(checkout, baseCommit);
    assert.ok(patch);
    assert.ok(patch.includes("+ trailing  \n"));
  } finally {
    await rm(checkout, { recursive: true, force: true });
  }
});

test("event metrics count MCP calls, retrieved task IDs, and only reported token usage", () => {
  const events = [
    {
      type: "turn.completed",
      usage: { input_tokens: 12, cached_input_tokens: 3, output_tokens: 4 },
    },
    {
      type: "item.completed",
      item: {
        id: "call-1",
        type: "mcp_tool_call",
        tool: "search",
        structuredContent: { candidates: [{ taskId: "linked-task" }] },
      },
    },
    {
      type: "item.completed",
      item: {
        id: "call-2",
        type: "mcp_tool_call",
        tool: "recall",
        result: {
          content: [
            {
              text: JSON.stringify({
                columns: ["taskId"],
                rows: [["other-task"]],
              }),
            },
          ],
        },
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
  assert.deepEqual(eventMetrics(events), {
    usage: { input_tokens: 12, cached_input_tokens: 3, output_tokens: 4 },
    memoryCalls: ["search", "recall"],
    retrievedTaskIds: ["linked-task", "other-task"],
  });
  assert.deepEqual(eventMetrics(""), {
    usage: null,
    memoryCalls: [],
    retrievedTaskIds: [],
  });
});

test("container audit checks bind destinations and Docker HostConfig tmpfs", () => {
  const mounts = [
    {
      type: "bind",
      source: "/tmp/checkout",
      destination: "/testbed",
      rw: true,
    },
    {
      type: "bind",
      source: "/tmp/home/auth.json",
      destination: "/codex-home/auth.json",
      rw: true,
    },
    {
      type: "bind",
      source: "/tmp/home/config.toml",
      destination: "/codex-home/config.toml",
      rw: false,
    },
  ];
  const tmpfs = {
    "/codex-home": `rw,nosuid,nodev,mode=700,uid=${process.getuid?.() ?? 1000},gid=${process.getgid?.() ?? 1000}`,
  };
  const audit = () =>
    auditContainerMounts(
      mounts,
      tmpfs,
      "/tmp/checkout",
      "/tmp/home",
      "/tmp/home/config.toml",
    );
  assert.equal(audit().ok, true);
  assert.deepEqual(audit().tmpfs, tmpfs);
  assert.equal(
    auditContainerMounts(
      mounts,
      {},
      "/tmp/checkout",
      "/tmp/home",
      "/tmp/home/config.toml",
    ).ok,
    false,
  );
  assert.equal(
    auditContainerMounts(
      mounts,
      { "/codex-home": "rw" },
      "/tmp/checkout",
      "/tmp/home",
      "/tmp/home/config.toml",
    ).ok,
    false,
  );
  assert.equal(
    auditContainerMounts(
      [mounts[1]!, mounts[0]!, { ...mounts[2]!, rw: true }],
      tmpfs,
      "/tmp/checkout",
      "/tmp/home",
      "/tmp/home/config.toml",
    ).ok,
    false,
  );
  assert.equal(
    auditContainerMounts(
      [{ ...mounts[0]!, destination: "/codex-home" }, ...mounts.slice(1)],
      tmpfs,
      "/tmp/checkout",
      "/tmp/home",
      "/tmp/home/config.toml",
    ).ok,
    false,
  );
});

test("Mentis config forwards secrets to stdio only and filters target tools", () => {
  const experience = codexConfig("experience");
  assert.match(experience, /\[features\]\napps = false\n/);
  assert.match(
    experience,
    /env_vars = \["NEO4J_URI","NEO4J_PASSWORD","OPENROUTER_API_KEY"\]/,
  );
  assert.match(
    experience,
    /exclude = \["NEO4J_PASSWORD", "OPENROUTER_API_KEY"\]/,
  );
  assert.doesNotMatch(experience, /NEO4J_PASSWORD\s*=/);
  assert.doesNotMatch(experience, /enabled_tools/);
  assert.ok(experience.includes('cwd = "/opt/mentis"'));
  assert.ok(
    experience.includes('args = ["/opt/mentis/dist/process/server.js"]'),
  );

  const target = codexConfig("mentis");
  assert.match(target, /\[features\]\napps = false\n/);
  assert.match(target, /enabled_tools = \["search", "recall"\]/);
  assert.doesNotMatch(target, /record_attempt/);

  const baseline = codexConfig("baseline");
  assert.match(baseline, /\[features\]\napps = false\n/);
  assert.doesNotMatch(baseline, /mcp_servers|mentis/);
});
