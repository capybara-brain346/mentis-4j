import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { WorkerEnvironment } from "./types.js";

export class OAuthProviderUnavailableError extends Error {}

export function requireOAuthProvider(env: WorkerEnvironment): OAuthHelpers {
  if (!env.OAUTH_PROVIDER) throw new OAuthProviderUnavailableError();
  return env.OAUTH_PROVIDER;
}
