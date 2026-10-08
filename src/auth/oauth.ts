import {
  AuthorizationError,
  type AuthRequest,
  authorizationErrorRedirect,
  CimdFetchError,
  OAuthError,
  type OAuthHelpers,
  OAuthProvider,
} from "@cloudflare/workers-oauth-provider";
import {
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
} from "openid-client";
import { CONFIG } from "../config/config.js";
import { D1Store, type OAuthAccessContext } from "../db/d1.js";
import {
  createGoogleAuthorizationRequest,
  createGoogleConfiguration,
  exchangeGoogleCode,
} from "./google.js";

const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const PENDING_CONSENT_TTL_SECONDS = 10 * 60;
const CONSENT_VERSION = "1";
const SESSION_COOKIE = "__Host-mentis-session";

export type WorkerEnvironment = Pick<Env, "DB" | "OAUTH_KV"> & {
  OAUTH_PROVIDER?: OAuthHelpers;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PUBLIC_BASE_URL?: string;
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

export function requestUsesCanonicalOrigin(
  request: Request,
  env: WorkerEnvironment,
): boolean {
  return new URL(request.url).origin === publicOrigin(env);
}

export function createOAuthProvider(
  env: WorkerEnvironment,
  handleMcpRequest: McpRequestHandler,
  routeBrowserRequest: BrowserRequestHandler,
): OAuthProvider<WorkerEnvironment> {
  const origin = publicOrigin(env);
  const resource = new URL(CONFIG.worker.mcpPath, origin).href;
  const apiHandler = {
    async fetch(
      request: Request,
      runtime: WorkerEnvironment,
      context: unknown,
    ) {
      const authContext = context as {
        props?: unknown;
        auth?: unknown;
      };
      const props = readAuthorizationProps(authContext.props);
      const token = readTokenFacts(authContext.auth);
      if (
        !props ||
        !token ||
        token.userId !== props.userId ||
        token.audience !== props.resource ||
        token.clientId.length === 0 ||
        !sameStrings(token.scope, props.scope)
      ) {
        return invalidTokenResponse();
      }

      const active = await new D1Store(runtime.DB).getActiveOAuthAccess({
        userId: props.userId,
        workspaceId: props.workspaceId,
        consentId: props.consentId,
        clientId: token.clientId,
        resource: props.resource,
        scope: JSON.stringify(props.scope),
      });
      if (!active) return invalidTokenResponse();
      return handleMcpRequest(request, runtime, active.workspaceId);
    },
  };

  return new OAuthProvider<WorkerEnvironment>({
    apiRoute: CONFIG.worker.mcpPath,
    apiHandler,
    defaultHandler: {
      fetch: (request, runtime) => routeBrowserRequest(request, runtime),
    },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    clientIdMetadataDocumentEnabled: true,
    accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTTL: REFRESH_TOKEN_TTL_SECONDS,
    resourceMetadata: {
      resource,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_name: CONFIG.app.name,
    },
    tokenExchangeCallback: async ({ grantType, clientId, userId, props }) => {
      const authProps = readAuthorizationProps(props);
      if (!authProps || authProps.userId !== userId) {
        throw new OAuthError("invalid_grant", {
          description: "The authorization is no longer active.",
        });
      }
      const store = new D1Store(env.DB);
      const accessContext = makeAccessContext(authProps, clientId);
      if (!(await store.getActiveOAuthAccess(accessContext))) {
        throw new OAuthError("invalid_grant", {
          description: "The authorization is no longer active.",
        });
      }
      if (grantType === "authorization_code") {
        const expiresAt = new Date(
          Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
        ).toISOString();
        if (!(await store.setConsentExpiry(authProps.consentId, expiresAt))) {
          throw new OAuthError("invalid_grant", {
            description: "The authorization is no longer active.",
          });
        }
      }
      return {
        accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
        ...(grantType === "authorization_code"
          ? { refreshTokenTTL: REFRESH_TOKEN_TTL_SECONDS }
          : {}),
      };
    },
  });
}

export async function handleAuthorizationGet(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const oauth = requireOAuthProvider(env);
  const store = new D1Store(env.DB);
  const authRequest = await oauth.parseAuthRequest(request);
  const session = await readSession(request, store);
  return renderConsent(authRequest, session, oauth);
}

export async function handleAuthorizationPost(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  return handleConsentPost(
    request,
    env,
    requireOAuthProvider(env),
    new D1Store(env.DB),
  );
}

export async function handleGoogleCallback(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  return finishGoogleSignIn(
    request,
    env,
    requireOAuthProvider(env),
    new D1Store(env.DB),
  );
}

export async function handleAccountGet(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  requireOAuthProvider(env);
  const session = await readSession(request, new D1Store(env.DB));
  if (!session) return new Response("Sign-in required", { status: 401 });
  return accountPage(session);
}

export async function handleConnectionsGet(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const oauth = requireOAuthProvider(env);
  const store = new D1Store(env.DB);
  const session = await readSession(request, store);
  if (!session) return new Response("Sign-in required", { status: 401 });
  return connectionsPage(session, store, oauth);
}

export async function handleDisconnectPost(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  return disconnectClient(
    request,
    env,
    requireOAuthProvider(env),
    new D1Store(env.DB),
  );
}

export async function handleLogoutPost(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  requireOAuthProvider(env);
  return logout(request, env, new D1Store(env.DB));
}

export function renderBrowserError(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    if (error.redirectTo) {
      return new Response(null, {
        status: 302,
        headers: { Location: error.redirectTo, "Cache-Control": "no-store" },
      });
    }
    return htmlPage(escapeHtml(error.description), 400);
  }
  if (error instanceof CimdFetchError) {
    return htmlPage("This client could not be verified. Start again.", 400);
  }
  if (error instanceof OAuthProviderUnavailableError) {
    return new Response("OAuth provider is not available", { status: 503 });
  }
  return new Response("Mentis authorization failed", { status: 503 });
}

function requireOAuthProvider(env: WorkerEnvironment): OAuthHelpers {
  if (!env.OAUTH_PROVIDER) throw new OAuthProviderUnavailableError();
  return env.OAUTH_PROVIDER;
}

class OAuthProviderUnavailableError extends Error {}

async function beginGoogleSignIn(
  authRequest: AuthRequest,
  env: WorkerEnvironment,
  oauth: OAuthHelpers,
  approvedHeaders: Headers,
): Promise<Response> {
  const configuration = await createGoogleConfiguration(
    requiredEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
    requiredEnv(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
  );
  const nonce = randomNonce();
  const verifier = randomPKCECodeVerifier();
  const challenge = await calculatePKCECodeChallenge(verifier);
  // ponytail: provider KV consumption is not atomic; revisit if atomic replay protection is required.
  const upstream = await oauth.beginUpstream(authRequest, {
    data: { nonce, verifier },
    headers: approvedHeaders,
  });
  const url = createGoogleAuthorizationRequest(
    configuration,
    callbackUrl(env),
    upstream.state,
    nonce,
    challenge,
  );
  upstream.headers.set("Location", url.href);
  return new Response(null, { status: 302, headers: upstream.headers });
}

async function finishGoogleSignIn(
  request: Request,
  env: WorkerEnvironment,
  oauth: OAuthHelpers,
  store: D1Store,
): Promise<Response> {
  const recovered = await oauth.finishUpstream(request);
  const { headers, data } = recovered;
  try {
    if (
      !isObject(data) ||
      typeof data.nonce !== "string" ||
      data.nonce.trim().length === 0 ||
      typeof data.verifier !== "string" ||
      data.verifier.trim().length === 0
    ) {
      throw new AuthorizationError("invalid_request", {
        description: "The Google sign-in request expired. Start again.",
      });
    }
    const callbackParams = new URL(request.url).searchParams;
    if (callbackParams.get("error")) {
      headers.set(
        "Location",
        authorizationErrorRedirect(recovered.request, "access_denied"),
      );
      return new Response(null, { status: 302, headers });
    }
    if (!callbackParams.get("code")) {
      throw new AuthorizationError("invalid_request", {
        description: "Google did not return an authorization code.",
      });
    }

    const callback = new URL(callbackUrl(env));
    callback.search = callbackParams.toString();
    const configuration = await createGoogleConfiguration(
      requiredEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
      requiredEnv(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
    );
    const profile = await exchangeGoogleCode(
      configuration,
      callback,
      callbackParams.get("state")!,
      data.nonce,
      data.verifier,
    );
    const account = await store.getOrCreateGoogleAccount(profile);
    const sessionTtl = browserSessionTtl(env);
    const session = await store.createBrowserSession({
      userId: account.user.id,
      expiresAt: new Date(Date.now() + sessionTtl * 1000).toISOString(),
    });
    appendSetCookie(headers, sessionCookie(session.secret, sessionTtl));
    return await completeMcpAuthorization(
      recovered.request,
      { userId: account.user.id, workspaceId: account.workspace.id },
      env,
      oauth,
      store,
      headers,
    );
  } catch (error) {
    const response = renderBrowserError(error);
    for (const [name, value] of response.headers) {
      headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  }
}

async function renderConsent(
  authRequest: AuthRequest,
  session: {
    userId: string;
    workspaceId: string;
    displayName: string;
    email: string;
  } | null,
  oauth: OAuthHelpers,
): Promise<Response> {
  const details = await oauth.describeConsent(authRequest);
  const consent = await oauth.beginConsent(authRequest);
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mentis access</title><h1>Allow ${escapeHtml(details.clientName)} to use Mentis?</h1>
${session ? `<p>Signed in as ${escapeHtml(session.email)}.</p>` : "<p>Approval continues to Google sign-in and applies to the account you select there.</p>"}
<p>This client will send access to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${details.clientDomain ? `<p>Client domain: <strong>${escapeHtml(details.clientDomain)}</strong></p>` : "<p>This client registered itself. Its name is not verified.</p>"}
<p>Requested scopes: ${details.scope.map(escapeHtml).join(", ") || "None"}.</p>
${details.redirectIsLoopback ? "<p>This sends access to an app on your computer. Continue only if you started sign-in from that app.</p>" : ""}
<p>Permitted operations: search and read memory, write memory, and delete memory.</p>
<p>Access lasts seven days after the first token exchange. The client can refresh access during this period.</p>
<p><a href="/account">Account and connected clients</a></p>
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${escapeHtml(consent.handle)}">
  <button type="submit" name="decision" value="allow">Allow</button>
  <button type="submit" name="decision" value="cancel">Cancel</button>
</form></html>`;
  const headers = new Headers(consent.headers);
  setSecurityHeaders(headers);
  return new Response(html, { status: 200, headers });
}

async function handleConsentPost(
  request: Request,
  env: WorkerEnvironment,
  oauth: OAuthHelpers,
  store: D1Store,
): Promise<Response> {
  const form = await request.formData();
  const handle = form.get("handle");
  if (typeof handle !== "string" || handle.length === 0) {
    return htmlPage("The consent request expired. Start again.", 400);
  }
  if (form.get("decision") !== "allow") {
    const denied = await oauth.denyConsent(request, handle);
    return new Response(null, { status: 302, headers: denied.headers });
  }

  const approved = await oauth.approveConsent(request, handle);
  const session = await readSession(request, store);
  if (!session) {
    return beginGoogleSignIn(approved.request, env, oauth, approved.headers);
  }
  return completeMcpAuthorization(
    approved.request,
    session,
    env,
    oauth,
    store,
    approved.headers,
  );
}

async function completeMcpAuthorization(
  authRequest: AuthRequest,
  session: { userId: string; workspaceId: string },
  env: WorkerEnvironment,
  oauth: OAuthHelpers,
  store: D1Store,
  headers: Headers,
): Promise<Response> {
  const resource = authRequest.resource ?? mcpResource(env);
  const scope = authRequest.scope;
  const consentId = await store.createConsent({
    userId: session.userId,
    clientId: authRequest.clientId,
    workspaceId: session.workspaceId,
    resource,
    scope: JSON.stringify(scope),
    consentVersion: CONSENT_VERSION,
    expiresAt: new Date(
      Date.now() + PENDING_CONSENT_TTL_SECONDS * 1000,
    ).toISOString(),
  });
  const authorization = await oauth.completeAuthorization({
    request: authRequest,
    userId: session.userId,
    metadata: {},
    scope,
    props: {
      userId: session.userId,
      workspaceId: session.workspaceId,
      consentId,
      resource,
      scope,
    } satisfies McpAuthorizationProps,
  });
  headers.set("Location", authorization.redirectTo);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

async function connectionsPage(
  session: { userId: string },
  store: D1Store,
  oauth: OAuthHelpers,
): Promise<Response> {
  const consents = await store.listActiveConsents(session.userId);
  const newestByClient = new Map<string, (typeof consents)[number]>();
  for (const consent of consents) {
    if (!newestByClient.has(consent.clientId)) {
      newestByClient.set(consent.clientId, consent);
    }
  }
  const rows = await Promise.all(
    [...newestByClient.values()].map(async (consent) => {
      const client = await oauth.lookupClient(consent.clientId);
      const name = client?.clientName ?? consent.clientId;
      return `<li>${escapeHtml(name)} <form method="post" action="/connections/disconnect"><input type="hidden" name="consentId" value="${escapeHtml(consent.id)}"><button type="submit">Disconnect</button></form></li>`;
    }),
  );
  return htmlPage(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Connected clients</title><h1>Connected clients</h1><ul>${rows.join("")}</ul><form method="post" action="/logout"><button type="submit">Log out</button></form></html>`,
  );
}

async function disconnectClient(
  request: Request,
  env: WorkerEnvironment,
  oauth: OAuthHelpers,
  store: D1Store,
): Promise<Response> {
  if (!sameOriginPost(request, env))
    return new Response("Forbidden", { status: 403 });
  const session = await readSession(request, store);
  if (!session) return new Response("Sign-in required", { status: 401 });
  const form = await request.formData();
  const consentId = form.get("consentId");
  if (typeof consentId !== "string" || consentId.length === 0) {
    return new Response("Consent not found", { status: 404 });
  }
  const consent = await store.getConsentForUser(session.userId, consentId);
  if (!consent) return new Response("Consent not found", { status: 404 });

  await store.revokeClientConsents(session.userId, consent.clientId);
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(session.userId, {
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const grant of page.items) {
      if (grant.clientId === consent.clientId) {
        await oauth.revokeGrant(grant.id, session.userId);
      }
    }
    cursor = page.cursor;
  } while (cursor);
  return new Response(null, {
    status: 303,
    headers: { Location: "/connections", "Cache-Control": "no-store" },
  });
}

async function logout(
  request: Request,
  env: WorkerEnvironment,
  store: D1Store,
): Promise<Response> {
  if (!sameOriginPost(request, env))
    return new Response("Forbidden", { status: 403 });
  const secret = cookieValue(request, SESSION_COOKIE);
  if (secret) await store.revokeBrowserSession(secret);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

async function readSession(
  request: Request,
  store: D1Store,
): Promise<{
  id: string;
  userId: string;
  workspaceId: string;
  displayName: string;
  email: string;
  expiresAt: string;
  createdAt: string;
} | null> {
  const secret = cookieValue(request, SESSION_COOKIE);
  return secret ? store.getBrowserSession(secret) : null;
}

function accountPage(session: {
  displayName: string;
  email: string;
}): Response {
  return htmlPage(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Mentis account</title><h1>${escapeHtml(session.displayName)}</h1><p>${escapeHtml(session.email)}</p><p><a href="/connections">Connected clients</a></p><form method="post" action="/logout"><button type="submit">Log out</button></form></html>`,
  );
}

function invalidTokenResponse(): Response {
  return new Response("Authorization is no longer active", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Bearer error="invalid_token"',
      "Cache-Control": "no-store",
    },
  });
}

function readAuthorizationProps(value: unknown): McpAuthorizationProps | null {
  if (
    !isObject(value) ||
    typeof value.userId !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.consentId !== "string" ||
    typeof value.resource !== "string" ||
    !isStringArray(value.scope)
  ) {
    return null;
  }
  return {
    userId: value.userId,
    workspaceId: value.workspaceId,
    consentId: value.consentId,
    resource: value.resource,
    scope: value.scope,
  };
}

function readTokenFacts(value: unknown): {
  userId: string;
  clientId: string;
  audience: string;
  scope: string[];
} | null {
  if (!isObject(value)) return null;
  const audience =
    typeof value.audience === "string"
      ? value.audience
      : Array.isArray(value.audience) && value.audience.length === 1
        ? value.audience[0]
        : null;
  if (
    typeof value.userId !== "string" ||
    typeof value.clientId !== "string" ||
    typeof audience !== "string" ||
    !isStringArray(value.scope)
  ) {
    return null;
  }
  return {
    userId: value.userId,
    clientId: value.clientId,
    audience,
    scope: value.scope,
  };
}

function makeAccessContext(
  props: McpAuthorizationProps,
  clientId: string,
): OAuthAccessContext {
  return {
    userId: props.userId,
    workspaceId: props.workspaceId,
    consentId: props.consentId,
    clientId,
    resource: props.resource,
    scope: JSON.stringify(props.scope),
  };
}
function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

function browserSessionTtl(env: WorkerEnvironment): number {
  const value = Number(
    requiredEnv(env.BROWSER_SESSION_TTL_SECONDS, "BROWSER_SESSION_TTL_SECONDS"),
  );
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("BROWSER_SESSION_TTL_SECONDS must be a positive integer");
  }
  return value;
}

function publicOrigin(env: WorkerEnvironment): string {
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

function callbackUrl(env: WorkerEnvironment): string {
  return new URL("/google/callback", publicOrigin(env)).href;
}

function mcpResource(env: WorkerEnvironment): string {
  return new URL(CONFIG.worker.mcpPath, publicOrigin(env)).href;
}

function sessionCookie(secret: string, ttlSeconds: number): string {
  return `${SESSION_COOKIE}=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of request.headers.get("Cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

function sameOriginPost(request: Request, env: WorkerEnvironment): boolean {
  return request.headers.get("Origin") === publicOrigin(env);
}

function setSecurityHeaders(headers: Headers): void {
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Cache-Control", "no-store");
}

function htmlPage(html: string, status = 200): Response {
  const headers = new Headers();
  setSecurityHeaders(headers);
  return new Response(html, { status, headers });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
}

function appendSetCookie(headers: Headers, cookie: string | null): void {
  if (cookie) headers.append("Set-Cookie", cookie);
}

function requiredEnv(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
