import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import { D1Store, initializeD1Schema } from "../dist/db/d1.js";

// Node unit tests do not use the provider's RPC entrypoint; Worker tests use workerd.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: "data:text/javascript,export class WorkerEntrypoint {}",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { AuthorizationError, getOAuthApi } = await import(
  "@cloudflare/workers-oauth-provider"
);
const {
  handleAuthorizationGet,
  handleAuthorizationPost,
  handleGoogleCallback,
  renderBrowserError,
} = await import("../dist/auth/oauth.js");
hooks.deregister();

import {
  createGoogleAuthorizationRequest,
  createGoogleConfiguration,
  exchangeGoogleCode,
} from "../dist/auth/google.js";

import {
  googleClientId as clientId,
  googleClientSecret as clientSecret,
  googleDiscovery,
  googleTokenReply,
  googleIssuer as issuer,
  googleJwksUrl as jwksUrl,
  googleKey as key,
  pkceChallenge,
  googleTokenUrl as tokenUrl,
} from "./fixtures/google.js";

const callbackUrl = "https://mentis.example/google/callback";

function mockGoogleEndpoints(
  context,
  claimOverrides = {},
  signatureValid = true,
) {
  let authorization;
  context.mock.method(globalThis, "fetch", async (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${issuer}/.well-known/openid-configuration`) {
      return Response.json(googleDiscovery);
    }
    if (url === jwksUrl) return Response.json({ keys: [key] });
    if (url === tokenUrl) {
      const reply = googleTokenReply(
        new URLSearchParams(options.body),
        authorization,
        claimOverrides,
        signatureValid,
      );
      return Response.json(reply.data, { status: reply.statusCode });
    }
    throw new Error(`Unexpected OIDC request: ${url}`);
  });
  return { setAuthorization: (value) => (authorization = value) };
}

async function startFlow(context, claimOverrides = {}, signatureValid = true) {
  const google = mockGoogleEndpoints(context, claimOverrides, signatureValid);
  const configuration = await createGoogleConfiguration(clientId, clientSecret);
  const verifier = randomPKCECodeVerifier();
  const authorization = {
    state: randomState(),
    nonce: randomNonce(),
    verifier,
    challenge: pkceChallenge(verifier),
  };
  authorization.url = createGoogleAuthorizationRequest(
    configuration,
    callbackUrl,
    authorization.state,
    authorization.nonce,
    authorization.challenge,
  );
  google.setAuthorization(authorization);
  const callback = new URL(callbackUrl);
  callback.searchParams.set("code", "test-code");
  callback.searchParams.set("state", authorization.state);
  return { configuration, authorization, callback };
}

test("Google OIDC adapter builds a request and maps verified identity", async (context) => {
  const { configuration, authorization, callback } = await startFlow(context);
  assert.equal(authorization.url.searchParams.get("client_id"), clientId);
  assert.equal(authorization.url.searchParams.get("redirect_uri"), callbackUrl);
  assert.equal(authorization.url.searchParams.get("response_type"), "code");
  assert.equal(
    authorization.url.searchParams.get("scope"),
    "openid email profile",
  );
  assert.ok(authorization.state);
  assert.equal(
    authorization.url.searchParams.get("state"),
    authorization.state,
  );
  assert.equal(
    authorization.url.searchParams.get("nonce"),
    authorization.nonce,
  );
  assert.equal(
    authorization.url.searchParams.get("code_challenge"),
    authorization.challenge,
  );
  assert.equal(
    authorization.url.searchParams.get("code_challenge_method"),
    "S256",
  );

  const profile = await exchangeGoogleCode(
    configuration,
    callback,
    authorization.state,
    authorization.nonce,
    authorization.verifier,
  );
  assert.deepEqual(profile, {
    googleSub: "google-user-1",
    displayName: "Example User",
    email: "user@example.com",
    emailVerified: true,
    avatarUrl: "https://example.com/avatar.png",
  });
});

test("Google OIDC adapter rejects invalid protocol claims and signatures", async (context) => {
  const cases = [
    [
      "wrong state",
      {},
      true,
      (callback) => callback.searchParams.set("state", "wrong"),
    ],
    ["wrong nonce", { nonce: "wrong" }, true],
    ["wrong audience", { aud: "another-client" }, true],
    ["expired ID token", { exp: Math.floor(Date.now() / 1000) - 60 }, true],
    [
      "future not-before claim",
      { nbf: Math.floor(Date.now() / 1000) + 600 },
      true,
    ],
    ["invalid signature", {}, false],
    ["unverified email", { email_verified: false }, true],
  ];

  for (const [name, claims, signatureValid, alterCallback] of cases) {
    await context.test(name, async (subtest) => {
      const { configuration, authorization, callback } = await startFlow(
        subtest,
        claims,
        signatureValid,
      );
      if (alterCallback) alterCallback(callback);
      await assert.rejects(
        exchangeGoogleCode(
          configuration,
          callback,
          authorization.state,
          authorization.nonce,
          authorization.verifier,
        ),
      );
    });
  }
});

test("Google OIDC adapter sends the verifier checked by the token endpoint", async (context) => {
  const { configuration, authorization, callback } = await startFlow(context);
  await assert.rejects(
    exchangeGoogleCode(
      configuration,
      callback,
      authorization.state,
      authorization.nonce,
      randomPKCECodeVerifier(),
    ),
  );
});

test("Consent policy permits Google and only the requested client origin", async () => {
  for (const redirectUri of [
    "https://chatgpt.com/connector/callback?state=private",
    "http://localhost:3456/callback",
    "https://client.example/callback%27%3B?next=https://unrelated.example",
  ]) {
    const authRequest = { clientId: "trusted", redirectUri, scope: [] };
    const response = await handleAuthorizationGet(
      new Request("https://mentis.example/authorize"),
      {
        DB: {},
        OAUTH_PROVIDER: {
          async parseAuthRequest() {
            return authRequest;
          },
          async describeConsent() {
            return {
              clientName: "Trusted client",
              redirectHost: new URL(redirectUri).hostname,
              scope: [],
            };
          },
          async beginConsent() {
            return { handle: "handle", headers: new Headers() };
          },
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("content-security-policy"),
      `default-src 'none'; form-action 'self' https://accounts.google.com ${new URL(redirectUri).origin}; base-uri 'none'; frame-ancestors 'none'`,
    );
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("Consent approval precedes provider upstream storage", async (context) => {
  mockGoogleEndpoints(context);
  const calls = [];
  const approvedRequest = {
    clientId: "trusted",
    redirectUri: "https://client.example/callback",
    scope: [],
  };
  let stored;
  const headers = new Headers({
    "Set-Cookie": "__Host-oauth-consent-test=; Max-Age=0",
  });
  const response = await handleAuthorizationPost(
    new Request("https://mentis.example/authorize", {
      method: "POST",
      body: new URLSearchParams({
        handle: "handle",
        decision: "allow",
        client_id: "evil",
        redirect_uri: "https://evil.example",
      }),
    }),
    {
      PUBLIC_BASE_URL: "https://mentis.example",
      GOOGLE_CLIENT_ID: clientId,
      GOOGLE_CLIENT_SECRET: clientSecret,
      DB: {},
      OAUTH_PROVIDER: {
        async approveConsent() {
          calls.push("approve");
          return { request: approvedRequest, headers };
        },
        async beginUpstream(request, options) {
          calls.push("upstream");
          assert.equal(request, approvedRequest);
          assert.equal(options.headers, headers);
          stored = options.data;
          headers.append("Set-Cookie", "__Host-oauth-upstream-test=binding");
          return { state: "provider-state", headers };
        },
      },
    },
  );
  assert.deepEqual(calls, ["approve", "upstream"]);
  assert.equal(response.headers.getSetCookie().length, 2);
  const url = new URL(response.headers.get("location"));
  assert.equal(url.searchParams.get("state"), "provider-state");
  assert.equal(url.searchParams.get("nonce"), stored.nonce);
  assert.equal(
    url.searchParams.get("code_challenge"),
    pkceChallenge(stored.verifier),
  );
  assert.equal(response.status, 302);
});

test("Google callback validates recovered protocol data before handling errors", async () => {
  for (const data of [
    null,
    {},
    { nonce: "", verifier: "valid" },
    { nonce: "valid", verifier: 1 },
    { nonce: "valid", verifier: " " },
  ]) {
    const response = await handleGoogleCallback(
      new Request(`${callbackUrl}?state=state&error=access_denied`),
      {
        DB: {},
        OAUTH_PROVIDER: {
          async finishUpstream() {
            return {
              data,
              request: { redirectUri: "https://evil.example" },
              headers: new Headers({
                "Set-Cookie": "__Host-oauth-upstream-test=; Max-Age=0",
              }),
            };
          },
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("location"), null);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  }
});

test("Google callback preserves clearing cookies on application and network outages", async (context) => {
  for (const failure of ["D1", "network"]) {
    await context.test(failure, async (subtest) => {
      const { authorization, callback } = await startFlow(subtest);
      if (failure === "network")
        subtest.mock.method(globalThis, "fetch", async () => {
          throw new Error("Google unavailable");
        });
      const response = await handleGoogleCallback(new Request(callback), {
        PUBLIC_BASE_URL: "https://mentis.example",
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        DB: {
          prepare() {
            throw new Error("D1 unavailable");
          },
        },
        OAUTH_PROVIDER: {
          async finishUpstream() {
            return {
              data: {
                nonce: authorization.nonce,
                verifier: authorization.verifier,
              },
              request: {},
              headers: new Headers({
                "Set-Cookie": "__Host-oauth-upstream-test=; Max-Age=0",
              }),
            };
          },
        },
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("location"), null);
      assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
    });
  }
});

test("Upstream storage outages remain distinct from invalid browser input", async () => {
  const outage = new Error("KV unavailable");
  await assert.rejects(
    handleGoogleCallback(new Request(`${callbackUrl}?state=state`), {
      DB: {},
      OAUTH_PROVIDER: {
        async finishUpstream() {
          throw outage;
        },
      },
    }),
    (error) => error === outage,
  );
  assert.equal(renderBrowserError(outage).status, 503);
  const invalidRequest = renderBrowserError(
    new AuthorizationError("invalid_request", { description: "Expired" }),
  );
  assert.equal(invalidRequest.status, 400);
  assert.equal(
    invalidRequest.headers.get("content-security-policy"),
    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
});

test("Provider consent and upstream helpers reject expired storage records", async () => {
  let now = 0;
  const records = new Map();
  const kv = {
    async put(key, value, options) {
      records.set(key, { value, expires: now + options.expirationTtl });
    },
    async get(key) {
      const record = records.get(key);
      return record && record.expires > now ? record.value : null;
    },
    async delete(key) {
      records.delete(key);
    },
  };
  const oauth = getOAuthApi(
    {
      apiRoute: "/mcp",
      apiHandler: { fetch: () => new Response() },
      defaultHandler: { fetch: () => new Response() },
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      resourceMetadata: { resource: "https://mentis.example/mcp" },
      clientIdMetadataDocumentEnabled: false,
    },
    { OAUTH_KV: kv },
  );
  const request = {
    responseType: "code",
    clientId: "client",
    redirectUri: "https://client.example/callback",
    state: "mcp-state",
    scope: [],
  };
  const consent = await oauth.beginConsent(request);
  const upstream = await oauth.beginUpstream(request, {
    data: { nonce: "nonce", verifier: "verifier" },
  });
  const cookie = (headers) =>
    headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const post = new Request("https://mentis.example/authorize", {
    method: "POST",
    headers: { Cookie: cookie(consent.headers) },
  });
  const callback = new Request(`${callbackUrl}?state=${upstream.state}`, {
    headers: { Cookie: cookie(upstream.headers) },
  });
  now = 601;
  await assert.rejects(
    oauth.approveConsent(post, consent.handle),
    AuthorizationError,
  );
  await assert.rejects(
    oauth.denyConsent(post, consent.handle),
    AuthorizationError,
  );
  await assert.rejects(oauth.finishUpstream(callback), AuthorizationError);
});

function localD1() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const binding = {
    prepare(query) {
      let statement;
      let parameters = [];
      const prepare = () => (statement ??= database.prepare(query));
      const prepared = {
        bind(...values) {
          parameters = values;
          return prepared;
        },
        async all() {
          return {
            success: true,
            results: prepare().all(...parameters),
          };
        },
        async run() {
          const result = prepare().run(...parameters);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
      return prepared;
    },
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { database, binding };
}

test("D1 auth records enforce session and consent policy", async () => {
  const { database, binding } = localD1();
  try {
    await initializeD1Schema(binding);
    const store = new D1Store(binding);
    const account = await store.getOrCreateGoogleAccount({
      googleSub: "google-user-1",
      displayName: "Example User",
      email: "user@example.com",
      emailVerified: true,
      avatarUrl: null,
    });
    assert.equal(account.user.googleSub, "google-user-1");
    assert.equal(account.workspace.ownerUserId, account.user.id);

    const session = await store.createBrowserSession({
      userId: account.user.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(
      (await store.getBrowserSession(session.secret)).userId,
      account.user.id,
    );

    assert.equal(
      await store.getBrowserSession(
        session.secret,
        new Date(Date.now() + 120_000).toISOString(),
      ),
      null,
    );

    const resource = "https://mentis.example/mcp";
    const scope = JSON.stringify(["mcp:read"]);
    const consentId = await store.createConsent({
      userId: account.user.id,
      clientId: "test-client",
      workspaceId: account.workspace.id,
      resource,
      scope,
      consentVersion: "1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const access = {
      userId: account.user.id,
      workspaceId: account.workspace.id,
      consentId,
      clientId: "test-client",
      resource,
      scope,
    };
    assert.ok(await store.getActiveOAuthAccess(access));
    assert.equal(
      await store.getActiveOAuthAccess(
        access,
        new Date(Date.now() + 120_000).toISOString(),
      ),
      null,
    );
    assert.equal(
      await store.revokeClientConsents(account.user.id, "test-client"),
      1,
    );
    assert.equal(await store.getActiveOAuthAccess(access), null);

    assert.equal(await store.revokeBrowserSession(session.secret), true);
    assert.equal(await store.getBrowserSession(session.secret), null);
  } finally {
    database.close();
  }
});
