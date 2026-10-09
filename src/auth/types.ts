import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export type WorkerEnvironment = Pick<Env, "DB" | "OAUTH_KV"> & {
  OAUTH_PROVIDER?: OAuthHelpers;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PUBLIC_BASE_URL?: string;
  FRONTEND_BASE_URL?: string;
  BROWSER_SESSION_TTL_SECONDS?: string;
  NEO4J_URI?: string;
  NEO4J_USERNAME?: string;
  NEO4J_PASSWORD?: string;
  NEO4J_DATABASE?: string;
  OPENROUTER_API_KEY?: string;
  LOG_LEVEL?: string;
};

export interface McpAuthorizationProps {
  userId: string;
  workspaceId: string;
  consentId: string;
  resource: string;
  scope: string[];
}

export type McpRequestHandler = (
  request: Request,
  env: WorkerEnvironment,
  workspaceId: string,
) => Promise<Response>;

export type BrowserRequestHandler = (
  request: Request,
  env: WorkerEnvironment,
) => Promise<Response>;
