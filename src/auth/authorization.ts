import {
  AuthorizationError,
  type AuthRequest,
  authorizationErrorRedirect,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import {
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { CONFIG } from "../config/config.js";
import { parsePositiveIntegerEnvironment } from "../config/environment.js";
import { D1Store } from "../db/d1.js";
import {
  callbackUrl,
  frontendUrl,
  mcpResource,
  requiredEnv,
} from "../utils/auth-urls.js";
import { appendSetCookie, sessionCookie } from "../utils/cookies.js";
import {
  escapeHtml,
  htmlPage,
  renderBrowserError,
  setSecurityHeaders,
} from "../utils/http-responses.js";
import { isObject } from "../utils/oauth-validation.js";
import {
  createGoogleAuthorizationRequest,
  createGoogleConfiguration,
  exchangeGoogleCode,
} from "./google.js";
import { requireOAuthProvider } from "./provider.js";
import { readSession } from "./session.js";
import type { McpAuthorizationProps, WorkerEnvironment } from "./types.js";

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
  const params = new URL(request.url).searchParams;
  if (params.get("state")?.startsWith("browser-")) {
    const callback = new URL(frontendUrl(env, "/api/auth/callback"));
    callback.search = params.toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: callback.href,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return finishGoogleSignIn(
    request,
    env,
    requireOAuthProvider(env),
    new D1Store(env.DB),
  );
}

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
    const sessionTtl = parsePositiveIntegerEnvironment(
      env.BROWSER_SESSION_TTL_SECONDS,
      "BROWSER_SESSION_TTL_SECONDS",
    );
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
  // Chrome also checks form-action on redirects after form submission.
  setSecurityHeaders(
    headers,
    `'self' ${new URL(CONFIG.google.issuer).origin} ${new URL(authRequest.redirectUri).origin}`,
  );
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
  const isUrlMetadataClient = isUrlMetadataClientId(authRequest.clientId);
  const oldConsentIds = (await store.listActiveConsents(session.userId))
    .filter(
      (consent) =>
        consent.clientId === authRequest.clientId &&
        consent.resource === resource &&
        (!isUrlMetadataClient ||
          consent.redirectUri === authRequest.redirectUri),
    )
    .map((consent) => consent.id);
  const consentId = await store.createConsent({
    userId: session.userId,
    clientId: authRequest.clientId,
    workspaceId: session.workspaceId,
    resource,
    redirectUri: authRequest.redirectUri,
    scope: JSON.stringify(scope),
    consentVersion: CONFIG.oauth.consentVersion,
    expiresAt: new Date(
      Date.now() + CONFIG.oauth.pendingTransactionTtlSeconds * 1000,
    ).toISOString(),
  });
  let authorization: { redirectTo: string };
  try {
    authorization = await oauth.completeAuthorization({
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
  } catch (error) {
    await store.revokeConsent(session.userId, consentId);
    throw error;
  }
  await Promise.all(
    oldConsentIds.map((oldConsentId) =>
      store.revokeConsent(session.userId, oldConsentId),
    ),
  );
  headers.set("Location", authorization.redirectTo);
  headers.set("Cache-Control", "no-store");
  return new Response(null, { status: 302, headers });
}

function isUrlMetadataClientId(clientId: string): boolean {
  // The provider uses this URL shape to select Client ID Metadata Documents.
  const schemeEnd = clientId.indexOf("://");
  if (schemeEnd === -1) return false;
  const authorityStart = schemeEnd + 3;
  const pathOffset = clientId.slice(authorityStart).search(/[/?#]/);
  return (
    new URL(clientId).protocol === "https:" &&
    pathOffset !== -1 &&
    clientId[authorityStart + pathOffset] === "/"
  );
}
