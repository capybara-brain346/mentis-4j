import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { CONFIG } from "../config/config.js";
import { D1Store } from "../db/d1.js";
import { sameOriginPost } from "../utils/auth-urls.js";
import {
  clearSessionCookie,
  cookieValue,
  SESSION_COOKIE,
} from "../utils/cookies.js";
import { apiResponse, escapeHtml, htmlPage } from "../utils/http-responses.js";
import { requireOAuthProvider } from "./provider.js";
import { readSession } from "./session.js";
import type { WorkerEnvironment } from "./types.js";

export async function handleAccountApiGet(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const session = await readSession(request, new D1Store(env.DB));
  if (!session) return apiResponse({ error: "Sign-in required" }, 401);
  return apiResponse({
    name: session.displayName,
    email: session.email,
    workspace: session.workspaceName,
    workspaceId: session.workspaceId,
    expiresAt: session.expiresAt,
  });
}

export async function handleConnectionsApiGet(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const store = new D1Store(env.DB);
  const session = await readSession(request, store);
  if (!session) return apiResponse({ error: "Sign-in required" }, 401);
  const consents = await store.listActiveConsents(session.userId);
  const newest = new Map<string, (typeof consents)[number]>();
  for (const consent of consents) {
    if (!newest.has(consent.clientId)) newest.set(consent.clientId, consent);
  }
  const oauth = requireOAuthProvider(env);
  const connections = await Promise.all(
    [...newest.values()].map(async (consent) => ({
      id: consent.id,
      name: await displayClientName(oauth, consent.clientId),
      description: "Registered client. Name is not verified.",
      status: "active",
      connected: consent.createdAt,
      expires: consent.expiresAt,
    })),
  );
  return apiResponse(connections);
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
      const name = await displayClientName(oauth, consent.clientId);
      return `<li>${escapeHtml(name)} <form method="post" action="/connections/disconnect"><input type="hidden" name="consentId" value="${escapeHtml(consent.id)}"><button type="submit">Disconnect</button></form></li>`;
    }),
  );
  return htmlPage(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Connected clients</title><h1>Connected clients</h1><ul>${rows.join("")}</ul><form method="post" action="/logout"><button type="submit">Log out</button></form></html>`,
  );
}

async function displayClientName(
  oauth: OAuthHelpers,
  clientId: string,
): Promise<string> {
  try {
    return (await oauth.lookupClient(clientId))?.clientName ?? clientId;
  } catch {
    return clientId;
  }
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
      limit: CONFIG.oauth.grantPageLimit,
      ...(cursor ? { cursor } : {}),
    });
    for (const grant of page.items) {
      if (grant.clientId === consent.clientId) {
        await oauth.revokeGrant(grant.id, session.userId);
      }
    }
    cursor = page.cursor;
  } while (cursor);
  if (new URL(request.url).pathname === "/api/connections/disconnect") {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
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
    status: new URL(request.url).pathname === "/api/logout" ? 204 : 303,
    headers: {
      ...(new URL(request.url).pathname === "/api/logout"
        ? {}
        : { Location: "/" }),
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

function accountPage(session: {
  displayName: string;
  email: string;
}): Response {
  return htmlPage(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Mentis account</title><h1>${escapeHtml(session.displayName)}</h1><p>${escapeHtml(session.email)}</p><p><a href="/connections">Connected clients</a></p><form method="post" action="/logout"><button type="submit">Log out</button></form></html>`,
  );
}
