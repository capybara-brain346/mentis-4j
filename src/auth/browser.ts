import {
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { CONFIG } from "../config/config.js";
import { parsePositiveIntegerEnvironment } from "../config/environment.js";
import { D1Store } from "../db/d1.js";
import { callbackUrl, frontendUrl, requiredEnv } from "../utils/auth-urls.js";
import {
  appendSetCookie,
  cookieValue,
  SIGN_IN_COOKIE,
  sessionCookie,
} from "../utils/cookies.js";
import {
  createGoogleAuthorizationRequest,
  createGoogleConfiguration,
  exchangeGoogleCode,
} from "./google.js";
import type { WorkerEnvironment } from "./types.js";

export async function handleBrowserSignIn(
  _request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  frontendUrl(env, "/api/auth/callback");
  const redirectUri = callbackUrl(env);
  const configuration = await createGoogleConfiguration(
    requiredEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
    requiredEnv(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
  );
  const state = `browser-${randomState()}`;
  const nonce = randomNonce();
  const verifier = randomPKCECodeVerifier();
  const challenge = await calculatePKCECodeChallenge(verifier);
  await new D1Store(env.DB).createBrowserSignIn({ state, nonce, verifier });
  const url = createGoogleAuthorizationRequest(
    configuration,
    redirectUri,
    state,
    nonce,
    challenge,
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie": `${SIGN_IN_COOKIE}=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${CONFIG.oauth.pendingTransactionTtlSeconds}`,
    },
  });
}

export async function handleBrowserCallback(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Set-Cookie": `${SIGN_IN_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
  });
  headers.set("Location", frontendUrl(env, "/sign-in?error=failed"));
  if (!state || state !== cookieValue(request, SIGN_IN_COOKIE)) {
    return new Response(null, { status: 302, headers });
  }
  try {
    const store = new D1Store(env.DB);
    const transaction = await store.consumeBrowserSignIn(state);
    if (!transaction) return new Response(null, { status: 302, headers });
    if (params.has("error")) {
      headers.set("Location", frontendUrl(env, "/sign-in?error=cancelled"));
      return new Response(null, { status: 302, headers });
    }
    const callback = new URL(callbackUrl(env));
    callback.search = params.toString();
    const configuration = await createGoogleConfiguration(
      requiredEnv(env.GOOGLE_CLIENT_ID, "GOOGLE_CLIENT_ID"),
      requiredEnv(env.GOOGLE_CLIENT_SECRET, "GOOGLE_CLIENT_SECRET"),
    );
    const profile = await exchangeGoogleCode(
      configuration,
      callback,
      state,
      transaction.nonce,
      transaction.verifier,
    );
    const account = await store.getOrCreateGoogleAccount(profile);
    const ttl = parsePositiveIntegerEnvironment(
      env.BROWSER_SESSION_TTL_SECONDS,
      "BROWSER_SESSION_TTL_SECONDS",
    );
    const session = await store.createBrowserSession({
      userId: account.user.id,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    });
    appendSetCookie(headers, sessionCookie(session.secret, ttl));
    headers.set("Location", frontendUrl(env, "/account"));
  } catch {
    // Never include upstream codes, tokens, or account data in the error response.
  }
  return new Response(null, { status: 302, headers });
}
