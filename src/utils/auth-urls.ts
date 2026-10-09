import type { WorkerEnvironment } from "../auth/types.js";
import { CONFIG } from "../config/config.js";

export function requestUsesCanonicalOrigin(
  request: Request,
  env: WorkerEnvironment,
): boolean {
  return new URL(request.url).origin === publicOrigin(env);
}

export function publicOrigin(env: WorkerEnvironment): string {
  const value = requiredEnv(env.PUBLIC_BASE_URL, "PUBLIC_BASE_URL");
  const url = new URL(value);
  if (
    !usesAllowedOriginProtocol(url) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("PUBLIC_BASE_URL must be a canonical HTTPS origin");
  }
  return url.origin;
}

function usesAllowedOriginProtocol(url: URL): boolean {
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  return url.protocol === "https:" || (url.protocol === "http:" && loopback);
}

export function callbackUrl(env: WorkerEnvironment): string {
  return new URL("/google/callback", publicOrigin(env)).href;
}

export function mcpResource(env: WorkerEnvironment): string {
  return new URL(CONFIG.worker.mcpPath, publicOrigin(env)).href;
}

export function frontendUrl(env: WorkerEnvironment, path: string): string {
  const origin = publicOrigin({
    ...env,
    PUBLIC_BASE_URL: requiredEnv(env.FRONTEND_BASE_URL, "FRONTEND_BASE_URL"),
  });
  return new URL(path, origin).href;
}

export function sameOriginPost(
  request: Request,
  env: WorkerEnvironment,
): boolean {
  return request.headers.get("Origin") === publicOrigin(env);
}

export function requiredEnv(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}
