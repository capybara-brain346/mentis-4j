import type { RecordAttemptInput, SearchInput } from "../../../src/lib/graph";

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

export const installCommands = `git clone ${sourceUrl}.git
cd mentis-4j
npm ci
npm run build`;

export const environmentCommands = `export NEO4J_PASSWORD='replace-with-your-password'
export OPENROUTER_API_KEY='replace-with-your-key'
docker compose up -d`;

export const indexCommand = `CREATE VECTOR INDEX attempt_embedding IF NOT EXISTS
FOR (a:Attempt) ON (a.embedding)
OPTIONS {indexConfig: {
  \`vector.dimensions\`: 1024,
  \`vector.similarity_function\`: 'cosine'
}};`;

export const clientConfig = `{
  "mcpServers": {
    "mentis": {
      "command": "node",
      "args": ["/absolute/path/mentis-4j/dist/process/server.js"],
      "env": {
        "NEO4J_PASSWORD": "replace-with-your-password",
        "OPENROUTER_API_KEY": "replace-with-your-key"
      }
    }
  }
}`;
