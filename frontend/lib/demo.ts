import { PUBLIC_CONFIG } from "../../src/config/config.ts";
import type { RecordAttemptInput, SearchInput } from "../../src/lib/graph";

export const sourceUrl = "https://github.com/capybara-brain346/mentis-4j";
export const exampleRepository = "https://github.com/example/river-app";
export const exampleTask = "login-cookie-investigation";

const context = {
  repository: exampleRepository,
  taskId: exampleTask,
  codeContext: "Vite, local HTTP",
  affectedFiles: ["src/Login.tsx"],
};

export const failedAttempt = {
  ...context,
  action: "Change the login redirect",
  observation: "Authentication still returns to the sign-in page",
  inference: "Cookie auth handles this route",
  check: { method: "browser test", result: "failed" },
  gitCommit: "a8c3f2",
  gitDirty: true,
} satisfies RecordAttemptInput;

export const passedAttempt = {
  ...context,
  action: "Retain the session cookie over local HTTP",
  observation: "The browser stays signed in after login",
  check: { method: "browser test", result: "passed" },
} satisfies RecordAttemptInput;

export const exampleSearch = {
  repository: exampleRepository,
  query: "Login returns to the sign-in page on local HTTP",
  limit: 3,
} satisfies SearchInput;

export const mcpServerUrl = new URL(
  PUBLIC_CONFIG.worker.mcpPath,
  PUBLIC_CONFIG.frontend.backendBaseUrl,
).href;

export const clientConfig = JSON.stringify(
  { mcpServers: { mentis: { url: mcpServerUrl } } },
  null,
  2,
);

export const claudeCommand = `claude mcp add --transport http mentis '${mcpServerUrl}'`;
