import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  appendFile,
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeRun,
  recordAttempt,
  type Manifest,
  type Task,
} from "./run.js";
import { gradeCohort, gradeSmoke } from "./grade.js";

const NEO4J_IMAGE = "neo4j:5.26.0-community";
const CODEX_HOME_CONTAINER = "/codex-home";
const WORKSPACE_CONTAINER = "/testbed";
const TOOL_ENV = ["NEO4J_URI", "NEO4J_PASSWORD", "OPENROUTER_API_KEY"];
const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type Arm = "experience" | "baseline" | "mentis";

export function taskImageFor(task: Pick<Task, "task_id">): string {
  if (!TASK_ID_PATTERN.test(task.task_id)) {
    throw new Error(`unsafe task ID: ${task.task_id}`);
  }
  return `jiayuanz3/swecontextbench:${task.task_id.replaceAll("__", ".")}`;
}

export function experienceTaskImageFor(task: Pick<Task, "task_id">): string {
  if (!TASK_ID_PATTERN.test(task.task_id)) {
    throw new Error(`unsafe task ID: ${task.task_id}`);
  }
  return `sweb.simple.${task.task_id.replaceAll("__", ".").toLowerCase()}:latest`;
}

export function codexConfig(arm: Arm): string {
  const lines = [
    "[features]",
    "apps = false",
    "",
    "[shell_environment_policy]",
    'inherit = "all"',
    'exclude = ["NEO4J_PASSWORD", "OPENROUTER_API_KEY"]',
  ];
  if (arm !== "baseline") {
    lines.push(
      "",
      "[mcp_servers.mentis]",
      'command = "node"',
      'args = ["/opt/mentis/dist/process/server.js"]',
      'cwd = "/opt/mentis"',
      `env_vars = ${JSON.stringify(TOOL_ENV)}`,
    );
    if (arm === "mentis") {
      lines.push('enabled_tools = ["search", "recall"]');
    }
  }
  return `${lines.join("\n")}\n`;
}

function run(
  command: string,
  args: string[],
  options: { input?: string; trim?: boolean } = {},
): string {
  const output = execFileSync(command, args, {
    encoding: "utf8",
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "inherit"],
  });
  return options.trim === false ? output : output.trim();
}

function docker(args: string[], options: { input?: string } = {}): string {
  return run("docker", args, options);
}

function repositoryUrl(repository: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`repository must be GitHub owner/name: ${repository}`);
  }
  return `https://github.com/${repository}.git`;
}

async function checkoutTask(task: Task, directory: string): Promise<void> {
  const remote = repositoryUrl(task.repository);
  run("git", ["init", directory]);
  run("git", ["-C", directory, "remote", "add", "origin", remote]);
  run("git", [
    "-C",
    directory,
    "fetch",
    "--depth=1",
    "origin",
    task.base_commit,
  ]);
  run("git", ["-C", directory, "checkout", "--detach", "FETCH_HEAD"]);
  const head = run("git", ["-C", directory, "rev-parse", "HEAD"]);
  if (head !== task.base_commit) {
    throw new Error(
      `${task.task_id}: checkout ${head} != base_commit ${task.base_commit}`,
    );
  }
  if (run("git", ["-C", directory, "status", "--porcelain"])) {
    throw new Error(`${task.task_id}: fresh checkout is not clean`);
  }
}

function buildAgentTag(taskImage: string): string {
  const hash = createHash("sha256")
    .update(taskImage)
    .digest("hex")
    .slice(0, 16);
  return `mentis-agent:${hash}`;
}

async function makeBuildContext(): Promise<string> {
  const context = await mkdtemp(join(tmpdir(), "mentis-agent-build-"));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const bench = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const file of ["package.json", "package-lock.json", "tsconfig.json"]) {
    await copyFile(join(root, file), join(context, file));
  }
  await cp(join(root, "src"), join(context, "src"), { recursive: true });
  await copyFile(
    join(bench, "Dockerfile.agent"),
    join(context, "Dockerfile.agent"),
  );
  return context;
}

function verifyTaskImage(
  task: Task,
  taskImage: string,
): { python: string; pytest: string } {
  const baseCommit = docker([
    "run",
    "--rm",
    "--entrypoint",
    "git",
    taskImage,
    "-C",
    WORKSPACE_CONTAINER,
    "rev-parse",
    "HEAD",
  ]);
  if (baseCommit !== task.base_commit) {
    throw new Error(
      `${task.task_id}: task image commit ${baseCommit} != base_commit ${task.base_commit}`,
    );
  }
  const python = docker([
    "run",
    "--rm",
    "--entrypoint",
    "python",
    taskImage,
    "--version",
  ]);
  const pytest = docker([
    "run",
    "--rm",
    "--entrypoint",
    "python",
    taskImage,
    "-m",
    "pytest",
    "--version",
  ]);
  return { python, pytest };
}

function verifyAgentImage(image: string): string[] {
  return docker([
    "run",
    "--rm",
    "--user",
    containerIdentity(),
    "--env",
    "HOME=/tmp",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "node --version && codex --version && python --version && python -m pytest --version",
  ]).split("\n");
}

function runInherited(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

function prepareTaskImage(
  task: Task,
  context: string,
  evaluatorDir: string,
): {
  image: string;
  taskImage: string;
  imageSource: string;
  taskRuntime: { python: string; pytest: string };
  agentRuntime: string[];
} {
  const taskImage =
    task.role === "experience"
      ? experienceTaskImageFor(task)
      : taskImageFor(task);
  if (task.role === "experience") {
    try {
      docker(["image", "inspect", taskImage]);
    } catch {
      const baseImage = "sweb.simple.base:latest";
      try {
        docker(["image", "inspect", baseImage]);
      } catch {
        runInherited("python3", [
          join(evaluatorDir, "swebench_memory", "harness", "build_base.py"),
        ]);
      }
      const inputPath = join(
        tmpdir(),
        `mentis-image-${createHash("sha256").update(task.task_id).digest("hex")}.json`,
      );
      writeFileSync(
        inputPath,
        JSON.stringify([
          {
            instance_id: task.task_id,
            repo: task.repository,
            base_commit: task.base_commit,
            ...(task.created_at ? { created_at: task.created_at } : {}),
          },
        ]),
      );
      try {
        runInherited("python3", [
          join(evaluatorDir, "swebench_memory", "harness", "build_instance.py"),
          "--dataset_name",
          inputPath,
        ]);
      } finally {
        unlinkSync(inputPath);
      }
    }
  } else {
    docker(["pull", taskImage]);
  }
  const agentImage = buildAgentTag(taskImage);
  const taskRuntime = verifyTaskImage(task, taskImage);
  docker([
    "build",
    ...(task.role === "target" ? ["--pull"] : []),
    "--file",
    join(context, "Dockerfile.agent"),
    "--build-arg",
    `TASK_IMAGE=${taskImage}`,
    "--tag",
    agentImage,
    context,
  ]);
  const agentRuntime = verifyAgentImage(agentImage);
  return {
    image: agentImage,
    taskImage,
    imageSource:
      task.role === "experience"
        ? "pinned build_instance.py at base_commit; no patches supplied"
        : "pinned published SWE-ContextBench hardened image",
    taskRuntime,
    agentRuntime,
  };
}

function dockerMount(source: string, target: string, readonly = false): string {
  if (source.includes(","))
    throw new Error("mount path cannot contain a comma");
  return `type=bind,src=${resolve(source)},dst=${target}${readonly ? ",readonly" : ""}`;
}

function containerIdentity(): string {
  const uid = process.getuid?.() ?? 1000;
  const gid = process.getgid?.() ?? 1000;
  return `${uid}:${gid}`;
}

function codexTmpfs(): string {
  const [uid, gid] = containerIdentity().split(":");
  return `${CODEX_HOME_CONTAINER}:rw,nosuid,nodev,mode=700,uid=${uid},gid=${gid}`;
}

function codexConfigProbe(
  image: string,
  checkout: string,
  codexHome: string,
  configPath: string,
  arm: Arm,
  network: string,
): void {
  const mounts = [
    dockerMount(checkout, WORKSPACE_CONTAINER),
    dockerMount(
      join(codexHome, "auth.json"),
      `${CODEX_HOME_CONTAINER}/auth.json`,
    ),
    dockerMount(configPath, `${CODEX_HOME_CONTAINER}/config.toml`, true),
  ];
  const common = [
    "run",
    "--rm",
    "--network",
    network,
    "--user",
    containerIdentity(),
    "--tmpfs",
    codexTmpfs(),
    "--workdir",
    WORKSPACE_CONTAINER,
    ...mounts.flatMap((mount) => ["--mount", mount]),
    "--env",
    `CODEX_HOME=${CODEX_HOME_CONTAINER}`,
    "--env",
    "HOME=/tmp",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "test ! -S /var/run/docker.sock && test ! -S /run/docker.sock && test ! -e /grader-only && test ! -e /testbed/grader-only && test ! -e /opt/mentis/grader-only && codex login status >/dev/null && features=$(codex features list) && printf '%s\\n' \"$features\" | grep -Eq '^apps[[:space:]]+stable[[:space:]]+false$' && codex mcp list --json",
  ];
  const servers = JSON.parse(docker(common)) as Array<{ name: string }>;
  if (arm === "baseline") {
    if (servers.length !== 0) {
      throw new Error(
        `baseline has unexpected MCP servers: ${JSON.stringify(servers)}`,
      );
    }
    return;
  }
  if (servers.length !== 1 || servers[0]?.name !== "mentis") {
    throw new Error(
      `unexpected MCP servers for ${arm}: ${JSON.stringify(servers)}`,
    );
  }
  const details = JSON.parse(
    docker([
      "run",
      "--rm",
      "--network",
      network,
      "--user",
      containerIdentity(),
      "--tmpfs",
      codexTmpfs(),
      ...mounts.flatMap((mount) => ["--mount", mount]),
      "--env",
      `CODEX_HOME=${CODEX_HOME_CONTAINER}`,
      "--env",
      "HOME=/tmp",
      "--entrypoint",
      "codex",
      image,
      "mcp",
      "get",
      "mentis",
      "--json",
    ]),
  ) as { enabled_tools: string[] | null; disabled_tools: string[] | null };
  const expected = arm === "mentis" ? ["search", "recall"] : null;
  if (
    JSON.stringify(details.enabled_tools) !== JSON.stringify(expected) ||
    details.disabled_tools !== null
  ) {
    throw new Error(`unexpected Mentis tool filter for ${arm}`);
  }
}

interface AgentMount {
  type: string;
  source: string;
  destination: string;
  rw: boolean;
}

interface ContainerAudit {
  ok: boolean;
  grader_paths_absent: boolean;
  mounts: AgentMount[];
  tmpfs: Record<string, string>;
}

export function auditContainerMounts(
  mounts: AgentMount[],
  tmpfs: Record<string, string>,
  checkout: string,
  codexHome: string,
  configPath: string,
): ContainerAudit {
  const expected = [
    { destination: WORKSPACE_CONTAINER, source: resolve(checkout), rw: true },
    {
      destination: `${CODEX_HOME_CONTAINER}/auth.json`,
      source: resolve(codexHome, "auth.json"),
      rw: true,
    },
    {
      destination: `${CODEX_HOME_CONTAINER}/config.toml`,
      source: resolve(configPath),
      rw: false,
    },
  ];
  const graderPathsAbsent = !mounts.some((mount) =>
    /grader-only|grader-data|\.parquet/i.test(mount.source),
  );
  return {
    ok:
      mounts.length === expected.length &&
      expected.every(({ destination, source, rw }) =>
        mounts.some(
          (mount) =>
            mount.type === "bind" &&
            mount.destination === destination &&
            resolve(mount.source) === source &&
            mount.rw === rw,
        ),
      ) &&
      Object.keys(tmpfs).length === 1 &&
      tmpfs[CODEX_HOME_CONTAINER] === codexTmpfs().split(":")[1] &&
      graderPathsAbsent,
    grader_paths_absent: graderPathsAbsent,
    mounts,
    tmpfs,
  };
}

async function runCodex(
  image: string,
  task: Task,
  arm: Arm,
  attempt: number,
  runId: string,
  checkout: string,
  configPath: string,
  codexHome: string,
  network: string,
  model: string,
  protocol: Manifest["execution"],
  reasoningEffort: string,
  timeoutSeconds: number,
  neo4jPassword: string,
  openRouterKey: string,
): Promise<{
  exitCode: number | null;
  events: string;
  eventTiming: Array<{ end_byte_offset: number; elapsed_ms: number }>;
  elapsedMs: number;
  error?: string;
  usage: ReturnType<typeof eventMetrics>["usage"];
  memoryCalls: string[];
  retrievedTaskIds: string[];
  containerAudit: ContainerAudit;
}> {
  const containerName = `mentis-agent-${createHash("sha256")
    .update(`${runId}:${task.task_id}:${attempt}`)
    .digest("hex")
    .slice(0, 20)}`;
  const args = [
    "run",
    "--interactive",
    "--name",
    containerName,
    "--network",
    network,
    "--user",
    containerIdentity(),
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--tmpfs",
    codexTmpfs(),
    "--workdir",
    WORKSPACE_CONTAINER,
    "--mount",
    dockerMount(checkout, WORKSPACE_CONTAINER),
    "--mount",
    dockerMount(
      join(codexHome, "auth.json"),
      `${CODEX_HOME_CONTAINER}/auth.json`,
    ),
    "--mount",
    dockerMount(configPath, `${CODEX_HOME_CONTAINER}/config.toml`, true),
    "--env",
    `CODEX_HOME=${CODEX_HOME_CONTAINER}`,
    "--env",
    "HOME=/tmp",
  ];
  if (arm !== "baseline") {
    args.push(
      "--env",
      "NEO4J_URI=bolt://mentis-db:7687",
      "--env",
      `NEO4J_PASSWORD=${neo4jPassword}`,
      "--env",
      `OPENROUTER_API_KEY=${openRouterKey}`,
    );
  }
  args.push(
    image,
    "exec",
    "--json",
    "--ephemeral",
    "--model",
    model,
    "--config",
    `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    "--cd",
    WORKSPACE_CONTAINER,
    "--dangerously-bypass-approvals-and-sandbox",
    "-",
  );

  const prompt = makePrompt(task, arm, protocol);
  const started = Date.now();
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "inherit"] });
  const chunks: Buffer[] = [];
  const eventTiming: Array<{ end_byte_offset: number; elapsed_ms: number }> =
    [];
  let byteOffset = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    byteOffset += chunk.length;
    eventTiming.push({
      end_byte_offset: byteOffset,
      elapsed_ms: Date.now() - started,
    });
  });
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);

  const result = await new Promise<{
    exitCode: number | null;
    error?: string;
    elapsedMs: number;
  }>((resolveResult) => {
    let errorMessage: string | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      spawn("docker", ["kill", containerName], { stdio: "ignore" });
      child.kill("SIGTERM");
    }, timeoutSeconds * 1000);
    child.once("error", (error) => {
      errorMessage = error.message;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolveResult({
        exitCode: timedOut ? null : code,
        elapsedMs: Date.now() - started,
        ...(timedOut
          ? { error: `Codex exceeded ${timeoutSeconds}s wall-clock limit` }
          : errorMessage
            ? { error: errorMessage }
            : {}),
      });
    });
  });

  let mounts: AgentMount[] = [];
  let tmpfs: Record<string, string> = {};
  try {
    const inspected = JSON.parse(
      docker([
        "inspect",
        "--format",
        '{"mounts":{{json .Mounts}},"tmpfs":{{json .HostConfig.Tmpfs}}}',
        containerName,
      ]),
    ) as {
      mounts: Array<{
        Type: string;
        Source: string;
        Destination: string;
        RW: boolean;
      }>;
      tmpfs: Record<string, string> | null;
    };
    mounts = inspected.mounts.map(({ Type, Source, Destination, RW }) => ({
      type: Type,
      source: Source,
      destination: Destination,
      rw: RW,
    }));
    tmpfs = inspected.tmpfs ?? {};
  } catch {
    // A failed container start has no inspectable mounts.
  }
  const containerAudit = auditContainerMounts(
    mounts,
    tmpfs,
    checkout,
    codexHome,
    configPath,
  );
  try {
    docker(["rm", "--force", containerName]);
  } catch {
    // The Docker daemon may already have removed a failed container.
  }
  const events = Buffer.concat(chunks).toString("utf8");
  const metrics = eventMetrics(events);
  return {
    ...result,
    events,
    eventTiming,
    usage: metrics.usage,
    memoryCalls: metrics.memoryCalls,
    retrievedTaskIds: metrics.retrievedTaskIds,
    containerAudit,
    ...(!containerAudit.ok
      ? { error: result.error ?? "agent container mount audit failed" }
      : {}),
  };
}

function makePrompt(
  task: Task,
  arm: Arm,
  protocol: Manifest["execution"],
): string {
  const values = {
    task_id: task.task_id,
    repository: task.repository,
    base_commit: task.base_commit,
    problem_statement: task.problem_statement,
  };
  const common = protocol.prompt_templates.common.replace(
    /\{(\w+)\}/g,
    (_, key: keyof typeof values) => values[key] ?? `{${key}}`,
  );
  return protocol.prompt_templates[arm].replace("{common}", common);
}

export function eventMetrics(events: string): {
  usage: {
    input_tokens: number | null;
    cached_input_tokens: number | null;
    output_tokens: number | null;
  } | null;
  memoryCalls: string[];
  retrievedTaskIds: string[];
} {
  const totals = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
  const reported = new Set<keyof typeof totals>();
  const calls = new Map<string, string>();
  const retrieved = new Set<string>();
  const collectIds = (value: unknown): void => {
    if (typeof value === "string") {
      try {
        collectIds(JSON.parse(value));
      } catch {
        return;
      }
    } else if (Array.isArray(value)) {
      for (const child of value) collectIds(child);
    } else if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      for (const key of ["taskId", "task_id"]) {
        if (typeof object[key] === "string")
          retrieved.add(object[key] as string);
      }
      const columns = object.columns;
      const rows = object.rows;
      if (Array.isArray(columns) && Array.isArray(rows)) {
        const index = columns.findIndex(
          (column) => column === "taskId" || column === "task_id",
        );
        if (index >= 0) {
          for (const row of rows) {
            if (Array.isArray(row) && typeof row[index] === "string") {
              retrieved.add(row[index] as string);
            }
          }
        }
      }
      for (const [key, child] of Object.entries(object)) {
        if (key !== "arguments" && key !== "input") collectIds(child);
      }
    }
  };
  const inspect = (value: unknown, lineNumber: number): void => {
    if (Array.isArray(value)) {
      value.forEach((child) => inspect(child, lineNumber));
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    const item = object.item as Record<string, unknown> | undefined;
    if (item?.type === "mcp_tool_call") {
      const tool = String(item.tool ?? item.name ?? "unknown");
      const id = String(item.id ?? `${lineNumber}:${tool}`);
      calls.set(id, tool);
      for (const key of ["result", "content", "structuredContent", "output"]) {
        if (key in item) collectIds(item[key]);
      }
    }
    const usage = object.usage as Record<string, unknown> | undefined;
    if (object.type === "turn.completed" && usage) {
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        const count = usage[key];
        if (typeof count === "number" && Number.isFinite(count)) {
          totals[key] += count;
          reported.add(key);
        }
      }
    }
  };
  events.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    try {
      inspect(JSON.parse(line), index);
    } catch {
      // Keep malformed/non-JSON Codex output in the raw event file.
    }
  });
  const fields = Object.keys(totals) as Array<keyof typeof totals>;
  const usage = reported.size
    ? (Object.fromEntries(
        fields.map((field) => [
          field,
          reported.has(field) ? totals[field] : null,
        ]),
      ) as {
        input_tokens: number | null;
        cached_input_tokens: number | null;
        output_tokens: number | null;
      })
    : null;
  return {
    usage,
    memoryCalls: [...calls.values()],
    retrievedTaskIds: [...retrieved].sort(),
  };
}

function startDatabase(
  runId: string,
  network: string,
  volume: string,
  password: string,
): string {
  const container = `mentis-db-${runId}`;
  docker(["volume", "create", "--label", `mentis-benchmark=${runId}`, volume]);
  docker([
    "network",
    "create",
    "--label",
    `mentis-benchmark=${runId}`,
    network,
  ]);
  docker([
    "run",
    "--detach",
    "--name",
    container,
    "--network",
    network,
    "--network-alias",
    "mentis-db",
    "--mount",
    `type=volume,src=${volume},dst=/data`,
    "--env",
    `NEO4J_AUTH=neo4j/${password}`,
    "--env",
    "NEO4J_server_memory_heap_initial__size=256m",
    "--env",
    "NEO4J_server_memory_heap_max__size=512m",
    NEO4J_IMAGE,
  ]);
  return container;
}

function cypher(database: string, password: string, query: string): string {
  return docker(
    [
      "exec",
      "--interactive",
      "--env",
      "NEO4J_USERNAME=neo4j",
      "--env",
      `NEO4J_PASSWORD=${password}`,
      database,
      "cypher-shell",
      "--format",
      "plain",
      "--non-interactive",
    ],
    { input: query },
  );
}

async function prepareVectorIndex(
  database: string,
  password: string,
): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      cypher(database, password, "RETURN 1 AS ready;");
      break;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
    }
  }
  if (Date.now() >= deadline) throw new Error("Neo4j did not become ready");
  cypher(
    database,
    password,
    "CREATE VECTOR INDEX attempt_embedding IF NOT EXISTS FOR (a:Attempt) ON (a.embedding) OPTIONS {indexConfig: {`vector.dimensions`: 1024, `vector.similarity_function`: 'cosine'}};",
  );
  const indexDeadline = Date.now() + 120_000;
  while (Date.now() < indexDeadline) {
    const state = cypher(
      database,
      password,
      "SHOW VECTOR INDEXES YIELD name, state WHERE name = 'attempt_embedding' RETURN state;",
    );
    if (/\bONLINE\b/.test(state)) return;
    if (/\bFAILED\b/.test(state))
      throw new Error(`vector index failed: ${state}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  throw new Error("attempt_embedding did not become ONLINE");
}

function databaseSnapshotData(database: string, password: string): string {
  return cypher(
    database,
    password,
    "MATCH (n) RETURN 'node' AS kind, elementId(n) AS id, labels(n) AS labels, null AS source, null AS target, properties(n) AS properties UNION ALL MATCH (s)-[r]->(t) RETURN 'relationship' AS kind, elementId(r) AS id, [type(r)] AS labels, elementId(s) AS source, elementId(t) AS target, properties(r) AS properties ORDER BY kind, id;",
  );
}

function databaseSnapshot(database: string, password: string): string {
  return createHash("sha256")
    .update(databaseSnapshotData(database, password))
    .digest("hex");
}

function storedAttemptsByTask(
  database: string,
  password: string,
): Map<string, number> {
  const output = cypher(
    database,
    password,
    "MATCH (t:Task)-[:HAS_ATTEMPT]->(a:Attempt) WITH t.identity AS taskId, count(a) AS attempts RETURN taskId + '|' + toString(attempts) AS row ORDER BY row;",
  );
  const counts = new Map<string, number>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^"?([A-Za-z0-9][A-Za-z0-9._-]*)\|(\d+)"?$/);
    if (match) counts.set(match[1]!, Number(match[2]));
  }
  if (output.trim() && counts.size === 0) {
    throw new Error(`could not parse per-task attempt counts: ${output}`);
  }
  return counts;
}

function imageId(image: string): string {
  return docker(["image", "inspect", "--format", "{{.Id}}", image]);
}

export function capturePatch(
  checkout: string,
  baseCommit: string,
): string | null {
  run("git", ["-C", checkout, "add", "-N", "--", "."]);
  return (
    run("git", ["-C", checkout, "diff", "--binary", baseCommit], {
      trim: false,
    }) || null
  );
}

async function performAttempt(
  manifest: Manifest,
  task: Task,
  runDir: string,
  image: string,
  arm: Arm,
  attempt: number,
  codexHome: string,
  network: string,
  neo4jPassword: string,
  openRouterKey: string,
): Promise<ContainerAudit | null> {
  const benchData = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    ".data",
  );
  await mkdir(benchData, { recursive: true });
  const scratch = await mkdtemp(join(benchData, `mentis-${task.task_id}-`));
  const checkout = join(scratch, "checkout");
  const configPath = join(codexHome, "config.toml");
  await mkdir(checkout);
  await chmod(configPath, 0o600).catch(() => {});
  await writeFile(configPath, codexConfig(arm), { mode: 0o444 });
  await chmod(configPath, 0o444);
  let events = "";
  let eventTiming:
    Array<{ end_byte_offset: number; elapsed_ms: number }> | undefined;
  let patch: string | null = null;
  let exitCode: number | null = null;
  let elapsedMs = 0;
  let error: string | undefined;
  let metrics = eventMetrics(events);
  let containerAudit: ContainerAudit | null = null;
  const started = Date.now();
  try {
    const agentNetwork = arm === "baseline" ? "bridge" : network;
    codexConfigProbe(image, checkout, codexHome, configPath, arm, agentNetwork);
    await checkoutTask(task, checkout);
    const result = await runCodex(
      image,
      task,
      arm,
      attempt,
      manifest.run_id,
      checkout,
      configPath,
      codexHome,
      agentNetwork,
      manifest.agent.model,
      manifest.execution,
      manifest.agent.reasoning_effort,
      manifest.execution.limits.wall_clock_seconds,
      neo4jPassword,
      openRouterKey,
    );
    ({ exitCode, events, eventTiming, elapsedMs, error, containerAudit } =
      result);
    metrics = {
      usage: result.usage,
      memoryCalls: result.memoryCalls,
      retrievedTaskIds: result.retrievedTaskIds,
    };
    patch = capturePatch(checkout, task.base_commit);
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  } finally {
    if (elapsedMs === 0) elapsedMs = Date.now() - started;
    try {
      await recordAttempt(manifest, runDir, {
        task_id: task.task_id,
        attempt,
        arm,
        exit_code: exitCode,
        elapsed_ms: elapsedMs,
        events,
        event_timing: eventTiming,
        patch,
        failure_kind:
          containerAudit && !containerAudit.ok
            ? "infrastructure"
            : exitCode === null && error
              ? "infrastructure"
              : exitCode !== null && exitCode !== 0
                ? "codex_failure"
                : undefined,
        image_id: imageId(image),
        token_usage: metrics.usage,
        memory_calls: metrics.memoryCalls,
        retrieved_task_ids: metrics.retrievedTaskIds,
        ...(error ? { error } : {}),
      });
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  return containerAudit;
}

async function recordInfrastructureFailure(
  manifest: Manifest,
  task: Task,
  runDir: string,
  arm: Arm,
  attempt: number,
  error: unknown,
): Promise<void> {
  await recordAttempt(manifest, runDir, {
    task_id: task.task_id,
    attempt,
    arm,
    exit_code: null,
    elapsed_ms: 0,
    events: "",
    patch: null,
    failure_kind: "infrastructure",
    error: error instanceof Error ? error.message : String(error),
    token_usage: null,
    memory_calls: [],
    retrieved_task_ids: [],
  });
}

async function main(): Promise<void> {
  const [manifestArg, runDirArg, codexHomeArg, evaluatorDirArg] =
    process.argv.slice(2);
  if (
    !manifestArg ||
    !runDirArg ||
    !codexHomeArg ||
    !evaluatorDirArg ||
    process.argv.length !== 6
  ) {
    throw new Error(
      "usage: node .data/execute.js <manifest.json> <run-directory> <dedicated-CODEX_HOME> <pinned-evaluator-checkout>",
    );
  }
  const manifestPath = resolve(manifestArg);
  const runDir = resolve(runDirArg);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const selectionPath = join(dirname(manifestPath), "selection.json");
  const selection = JSON.parse(await readFile(selectionPath, "utf8")) as {
    linked_pairs: Array<{
      target_task_id: string;
      experience_task_id: string;
    }>;
  };
  const prepareScript = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "prepare.py",
  );
  execFileSync(
    "python3",
    [prepareScript, "validate-selection", manifestPath, selectionPath],
    {
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  const codexHome = resolve(codexHomeArg);
  const evaluatorDir = resolve(evaluatorDirArg);
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openRouterKey) {
    throw new Error("OPENROUTER_API_KEY is required in the runner environment");
  }
  if (
    manifest.agent.model !== "gpt-6-luna" ||
    manifest.agent.reasoning_effort !== "xhigh"
  ) {
    throw new Error(
      `unsupported Codex model/effort: ${manifest.agent.model}/${manifest.agent.reasoning_effort}`,
    );
  }
  const tasks = new Map(manifest.tasks.map((task) => [task.task_id, task]));
  const experiences = manifest.experience_task_ids.map((id) => tasks.get(id)!);
  const targets = manifest.target_task_ids.map((id) => tasks.get(id)!);
  await initializeRun(manifest, runDir);

  // Stop before any model task if the released grader's known/empty fixtures fail.
  await gradeSmoke(runDir, evaluatorDir);

  const context = await makeBuildContext();
  const imageByTask = new Map<string, string>();
  const imageRecords: Record<
    string,
    {
      task_image: string;
      image_source: string;
      task_image_id: string;
      agent_image_id: string;
      base_commit: string;
      task_runtime: { python: string; pytest: string };
      agent_runtime: string[];
    }
  > = {};
  const runId = `${manifest.run_id}-${randomUUID().slice(0, 8)}`;
  const safeRunId = runId.replaceAll("-", "");
  const network = `mentis-net-${safeRunId}`;
  const volume = `mentis-data-${safeRunId}`;
  const password = randomBytes(24).toString("base64url");
  const startedAt = new Date().toISOString();
  let database: string | undefined;
  let frozenSnapshot: string | undefined;
  try {
    database = startDatabase(safeRunId, network, volume, password);
    await prepareVectorIndex(database, password);

    const agentImageFor = async (task: Task): Promise<string> => {
      const existing = imageByTask.get(task.task_id);
      if (existing) return existing;
      const prepared = prepareTaskImage(task, context, evaluatorDir);
      imageByTask.set(task.task_id, prepared.image);
      imageRecords[task.task_id] = {
        task_image: prepared.taskImage,
        image_source: prepared.imageSource,
        task_image_id: imageId(prepared.taskImage),
        agent_image_id: imageId(prepared.image),
        base_commit: task.base_commit,
        task_runtime: prepared.taskRuntime,
        agent_runtime: prepared.agentRuntime,
      };
      await writeFile(
        join(runDir, "agent-images.json"),
        `${JSON.stringify(imageRecords, null, 2)}\n`,
      );
      return prepared.image;
    };

    const runTask = async (
      task: Task,
      arm: Arm,
      attempt: number,
    ): Promise<ContainerAudit | null> => {
      let image: string;
      try {
        image = await agentImageFor(task);
      } catch (error) {
        await recordInfrastructureFailure(
          manifest,
          task,
          runDir,
          arm,
          attempt,
          error,
        );
        return null;
      }
      return performAttempt(
        manifest,
        task,
        runDir,
        image,
        arm,
        attempt,
        codexHome,
        network,
        password,
        openRouterKey,
      );
    };

    for (let index = 0; index < experiences.length; index += 1) {
      const task = experiences[index]!;
      console.error(
        `experience ${index + 1}/${experiences.length}: ${task.task_id}`,
      );
      await runTask(task, "experience", 1);
    }

    const counts = storedAttemptsByTask(database, password);
    const experienceCounts = Object.fromEntries(
      manifest.experience_task_ids.map((taskId) => [
        taskId,
        counts.get(taskId) ?? 0,
      ]),
    );
    const selectedExperienceAttempts = Object.values(experienceCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    const actualAttemptsStored = [...counts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const unexpectedTaskIds = [...counts.keys()].filter(
      (taskId) => !manifest.experience_task_ids.includes(taskId),
    );
    const ingestionFailures = manifest.experience_task_ids.filter(
      (taskId) => (counts.get(taskId) ?? 0) === 0,
    );
    const frozenData = databaseSnapshotData(database, password);
    frozenSnapshot = createHash("sha256").update(frozenData).digest("hex");
    await writeFile(join(runDir, "experience-db-snapshot.txt"), frozenData, {
      flag: "wx",
    });
    await writeFile(
      join(runDir, "experience-db.json"),
      `${JSON.stringify(
        {
          schema_version: 1,
          run_id: manifest.run_id,
          database: "neo4j",
          container_name: database,
          volume,
          neo4j_image: NEO4J_IMAGE,
          neo4j_image_id: imageId(NEO4J_IMAGE),
          experience_tasks_scheduled: experiences.length,
          actual_attempts_stored: actualAttemptsStored,
          selected_experience_attempts_stored: selectedExperienceAttempts,
          experience_task_attempt_counts: experienceCounts,
          ingestion_failures: ingestionFailures,
          unexpected_database_task_ids: unexpectedTaskIds,
          snapshot_sha256: frozenSnapshot,
          frozen_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
    if (unexpectedTaskIds.length) {
      throw new Error(
        `unexpected task IDs were recorded in Mentis: ${unexpectedTaskIds.join(", ")}`,
      );
    }

    const targetIds = new Set(manifest.target_task_ids);
    const pilotPair = selection.linked_pairs.find(
      (pair) => (counts.get(pair.experience_task_id) ?? 0) > 0,
    );
    if (!pilotPair) {
      await writeFile(
        join(runDir, "phase-gate.json"),
        `${JSON.stringify(
          {
            passed: false,
            reason: "no linked experience task was successfully stored",
            eligible_pairs: selection.linked_pairs.length,
            actual_experience_attempts_stored: selectedExperienceAttempts,
          },
          null,
          2,
        )}\n`,
        { flag: "wx" },
      );
      throw new Error(
        "phase gate blocked: no stored linked experience is available for the pilot pair",
      );
    }
    const pilotTarget = tasks.get(pilotPair.target_task_id)!;
    const pilotArmAudits: Array<{
      arm: "baseline" | "mentis";
      attempt: number;
      container: ContainerAudit | null;
      database_unchanged: boolean;
      target_ids_absent_from_database: boolean;
    }> = [];
    for (const [arm, attempt] of [
      ["baseline", 100],
      ["mentis", 101],
    ] as const) {
      const container = await runTask(pilotTarget, arm, attempt);
      const snapshot = databaseSnapshot(database, password);
      const currentCounts = storedAttemptsByTask(database, password);
      const databaseUnchanged = snapshot === frozenSnapshot;
      const targetIdsAbsent = [...targetIds].every(
        (taskId) => !currentCounts.has(taskId),
      );
      const audit = {
        task_id: pilotTarget.task_id,
        linked_experience_task_id: pilotPair.experience_task_id,
        arm,
        attempt,
        database_unchanged: databaseUnchanged,
        target_ids_absent_from_database: targetIdsAbsent,
        agent_mount_audit_passed: container?.ok ?? false,
        grader_paths_absent: container?.grader_paths_absent ?? false,
        mounts: container?.mounts ?? [],
        tmpfs: container?.tmpfs ?? {},
      };
      await appendFile(
        join(runDir, "target-db-audit.jsonl"),
        `${JSON.stringify(audit)}\n`,
      );
      pilotArmAudits.push({
        arm,
        attempt,
        container,
        database_unchanged: databaseUnchanged,
        target_ids_absent_from_database: targetIdsAbsent,
      });
    }
    const pilotPassed = pilotArmAudits.every(
      (audit) =>
        audit.container?.ok === true &&
        audit.container.grader_paths_absent &&
        audit.database_unchanged &&
        audit.target_ids_absent_from_database,
    );
    await writeFile(
      join(runDir, "phase-gate.json"),
      `${JSON.stringify(
        {
          passed: pilotPassed,
          task_id: pilotTarget.task_id,
          linked_experience_task_id: pilotPair.experience_task_id,
          linked_experience_attempts_stored: counts.get(
            pilotPair.experience_task_id,
          ),
          arms: pilotArmAudits.map(
            ({
              arm,
              attempt,
              database_unchanged,
              target_ids_absent_from_database,
              container,
            }) => ({
              arm,
              attempt,
              database_unchanged,
              target_ids_absent_from_database,
              agent_mount_audit_passed: container?.ok ?? false,
              grader_paths_absent: container?.grader_paths_absent ?? false,
              mounts: container?.mounts ?? [],
              tmpfs: container?.tmpfs ?? {},
            }),
          ),
          target_answer_audit: {
            absent_from_experience_database: pilotArmAudits.every(
              (audit) => audit.target_ids_absent_from_database,
            ),
            absent_from_agent_mounts: pilotArmAudits.every(
              (audit) => audit.container?.grader_paths_absent === true,
            ),
          },
          completed_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
    if (!pilotPassed)
      throw new Error(
        "phase gate failed: pilot pair database/container audit did not pass",
      );

    for (let index = 0; index < targets.length; index += 1) {
      const task = targets[index]!;
      console.error(`target ${index + 1}/${targets.length}: ${task.task_id}`);
      for (const [arm, attempt] of [
        ["baseline", 1],
        ["mentis", 2],
      ] as const) {
        const container = await runTask(task, arm, attempt);
        const snapshot = databaseSnapshot(database, password);
        const currentCounts = storedAttemptsByTask(database, password);
        const databaseUnchanged = snapshot === frozenSnapshot;
        const targetIdsAbsent = [...targetIds].every(
          (taskId) => !currentCounts.has(taskId),
        );
        await appendFile(
          join(runDir, "target-db-audit.jsonl"),
          `${JSON.stringify({
            task_id: task.task_id,
            arm,
            attempt,
            database_unchanged: databaseUnchanged,
            target_ids_absent_from_database: targetIdsAbsent,
            agent_mount_audit_passed: container?.ok ?? false,
            grader_paths_absent: container?.grader_paths_absent ?? false,
            mounts: container?.mounts ?? [],
            tmpfs: container?.tmpfs ?? {},
          })}\n`,
        );
        if (!databaseUnchanged || !targetIdsAbsent) {
          throw new Error(
            `frozen Mentis DB changed or received target task data during ${task.task_id}/${arm}`,
          );
        }
      }
    }

    const snapshotAfterTargets = databaseSnapshot(database, password);
    const unchanged = frozenSnapshot === snapshotAfterTargets;
    await writeFile(
      join(runDir, "experience-db-verification.json"),
      `${JSON.stringify(
        {
          run_id: manifest.run_id,
          frozen_snapshot_sha256: frozenSnapshot,
          after_targets_snapshot_sha256: snapshotAfterTargets,
          unchanged,
          verified_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
    if (!unchanged)
      throw new Error("experience database changed during target trials");
    await gradeCohort(runDir, evaluatorDir);
    await writeFile(
      join(runDir, "runner.json"),
      `${JSON.stringify(
        { started_at: startedAt, finished_at: new Date().toISOString() },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
  } finally {
    try {
      if (database) docker(["rm", "--force", database]);
    } catch (error) {
      console.error(`Docker cleanup failed for database: ${String(error)}`);
    }
    try {
      docker(["network", "rm", network]);
    } catch (error) {
      console.error(`Docker cleanup failed for network: ${String(error)}`);
    }
    try {
      docker(["volume", "rm", volume]);
    } catch (error) {
      console.error(`Docker cleanup failed for volume: ${String(error)}`);
    }
    await rm(context, { recursive: true, force: true });
  }
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
