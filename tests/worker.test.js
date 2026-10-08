import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { D1Store, initializeD1Schema } from "../dist/db/d1.js";
import {
  googleClientId,
  googleClientSecret,
  googleDiscovery,
  googleIssuer,
  googleJwksUrl,
  googleKey,
  googleTokenReply,
  googleTokenUrl,
  pkceChallenge,
} from "./fixtures/google.js";

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
test("Worker protects MCP access and serves browser routes", {
  timeout: 30_000,
}, async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const storage = mkdtempSync(join(tmpdir(), "mentis-worker-test-"));
  const migrations = spawnSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "mentis-auth",
      "--local",
      "--persist-to",
      storage,
    ],
    { encoding: "utf8" },
  );
  if (migrations.status !== 0) {
    rmSync(storage, { recursive: true, force: true });
    assert.equal(migrations.status, 0, migrations.stderr);
  }
  const server = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      storage,
      "--var",
      `PUBLIC_BASE_URL:${origin}`,
    ],
    { stdio: "ignore" },
  );

  try {
    await waitForWorker(server, origin);

    const root = await fetch(`${origin}/`);
    assert.equal(root.status, 200);
    assert.equal(await root.text(), "Mentis MCP");

    const account = await fetch(`${origin}/account`);
    assert.equal(account.status, 401);
    const connections = await fetch(`${origin}/connections`);
    assert.equal(connections.status, 401);

    const unauthorized = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "anonymous-test", version: "1.0.0" },
        },
      }),
    });
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers.get("www-authenticate") ?? "", /Bearer/i);

    const metadataResponse = await fetch(
      `${origin}/.well-known/oauth-authorization-server`,
    );
    assert.equal(metadataResponse.status, 200);
    const metadata = await metadataResponse.json();
    assert.equal(metadata.authorization_endpoint, `${origin}/authorize`);
    assert.equal(metadata.token_endpoint, `${origin}/oauth/token`);
    assert.equal(metadata.registration_endpoint, `${origin}/oauth/register`);

    const registration = await fetch(`${origin}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Worker smoke client",
        redirect_uris: [`${origin}/callback`],
      }),
    });
    assert.equal(registration.status, 201);
    assert.ok((await registration.json()).client_id);

    const authorizationError = await fetch(`${origin}/authorize`);
    assert.equal(authorizationError.status, 400);

    const callbackMissingState = await fetch(`${origin}/google/callback`);
    assert.equal(callbackMissingState.status, 400);

    const crossOriginLogout = await fetch(`${origin}/logout`, {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(crossOriginLogout.status, 403);

    const wrongMethod = await fetch(`${origin}/authorize`, {
      method: "PUT",
    });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "GET, POST");

    const unknownRoute = await fetch(`${origin}/not-a-route`);
    assert.equal(unknownRoute.status, 404);
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
    rmSync(storage, { recursive: true, force: true });
  }
});

test("Worker uses consent-first upstream sign-in and real MCP tokens", {
  timeout: 30_000,
}, async () => {
  const storage = mkdtempSync(join(tmpdir(), "mentis-oauth-test-"));
  const bundle = join(storage, "server.js");
  const build = spawnSync(
    process.execPath,
    [wrangler, "deploy", "--dry-run", "--outdir", storage],
    { encoding: "utf8" },
  );
  assert.equal(build.status, 0, build.stderr);
  const origin = "https://mentis.example";
  let discoveryRequests = 0;
  let tokenRequests = 0;
  const googleCodes = new Map();
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      rootPath: storage,
      scriptPath: bundle,
      compatibilityDate: "2025-03-01",
      compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
      d1Databases: ["DB"],
      kvNamespaces: ["OAUTH_KV"],
      d1Persist: storage,
      kvPersist: storage,
      bindings: {
        PUBLIC_BASE_URL: origin,
        FRONTEND_BASE_URL: "https://console.example",
        GOOGLE_CLIENT_ID: googleClientId,
        GOOGLE_CLIENT_SECRET: googleClientSecret,
        BROWSER_SESSION_TTL_SECONDS: "3600",
      },
      outboundService: async (request) => {
        if (
          request.url === `${googleIssuer}/.well-known/openid-configuration`
        ) {
          discoveryRequests++;
          return Response.json(googleDiscovery);
        }
        if (request.url === googleJwksUrl)
          return Response.json({ keys: [googleKey] });
        if (request.url === googleTokenUrl) {
          tokenRequests++;
          const parameters = new URLSearchParams(await request.text());
          const fixture = googleCodes.get(parameters.get("code"));
          assert.ok(fixture);
          assert.equal(
            parameters.get("redirect_uri"),
            fixture.redirectUri ?? `${origin}/google/callback`,
          );
          const reply = googleTokenReply(parameters, fixture, fixture.claims);
          return Response.json(reply.data, { status: reply.statusCode });
        }
        if (request.url === "https://client.example/metadata")
          return Response.json({});
        if (request.url === "https://client.example/valid-metadata") {
          return Response.json({
            client_id: request.url,
            client_name: "Metadata client",
            redirect_uris: ["http://localhost:3456/callback"],
            token_endpoint_auth_method: "none",
          });
        }
        throw new Error("Unexpected outbound request");
      },
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    const kv = await mf.getKVNamespace("OAUTH_KV");
    await initializeD1Schema(db);
    const send = (path, options = {}) =>
      mf.dispatchFetch(`${origin}${path}`, {
        redirect: "manual",
        ...options,
      });
    const registration = await send("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "<script>untrusted</script>",
        redirect_uris: ["http://localhost:3456/callback"],
        token_endpoint_auth_method: "none",
      }),
    });
    assert.equal(registration.status, 201);
    const client = await registration.json();
    const mcpVerifier =
      "mcp-verifier-that-is-independent-of-google-pkce-1234567890";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://localhost:3456/callback",
      state: "mcp-original-state",
      resource: `${origin}/mcp`,
      scope: "test:a test:b",
      code_challenge: pkceChallenge(mcpVerifier),
      code_challenge_method: "S256",
    });
    const consentPage = async (cookie = "", extra = {}) => {
      const query = new URLSearchParams(params);
      for (const [key, value] of Object.entries(extra)) query.set(key, value);
      const response = await send(`/authorize?${query}`, {
        headers: { Cookie: cookie },
      });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /&#60;script&#62;untrusted/);
      assert.doesNotMatch(html, /<script>/);
      assert.match(html, /name is not verified/);
      assert.match(html, /test:a, test:b/);
      assert.match(html, /localhost/);
      assert.match(html, /app on your computer/);
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.match(
        response.headers.get("content-security-policy"),
        /form-action 'self'/,
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
      return {
        handle: html.match(/name="handle" value="([^"]+)"/)[1],
        cookie: cookiesFrom(response),
        html,
        response,
      };
    };
    const approve = (
      page,
      decision = "allow",
      cookie = page.cookie,
      fields = {},
    ) =>
      send("/authorize", {
        method: "POST",
        headers: { Cookie: cookie },
        body: new URLSearchParams({
          handle: page.handle,
          decision,
          ...fields,
        }),
      });
    const checkDenied = (response) => {
      assert.equal(response.status, 302);
      const redirect = new URL(response.headers.get("location"));
      assert.equal(redirect.origin, "http://localhost:3456");
      assert.equal(redirect.searchParams.get("error"), "access_denied");
      assert.equal(redirect.searchParams.get("state"), "mcp-original-state");
      assert.equal(redirect.searchParams.get("iss"), origin);
    };
    const startGoogle = async (page) => {
      page ??= await consentPage();
      const response = await approve(page, "allow", page.cookie, {
        redirect_uri: "https://evil.example",
        client_id: "evil",
        state: "evil",
        scope: "evil",
      });
      assert.equal(response.status, 302);
      const url = new URL(response.headers.get("location"));
      assert.equal(url.origin, googleIssuer);
      assert.equal(
        url.searchParams.get("redirect_uri"),
        `${origin}/google/callback`,
      );
      assert.equal(url.searchParams.get("scope"), "openid email profile");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.ok(url.searchParams.get("nonce"));
      assert.notEqual(
        url.searchParams.get("code_challenge"),
        params.get("code_challenge"),
      );
      assert.equal(response.headers.getSetCookie().length, 2);
      assert.match(
        response.headers.getSetCookie()[0],
        /__Host-oauth-consent-.*Max-Age=0/,
      );
      assert.match(
        response.headers.getSetCookie()[1],
        /__Host-oauth-upstream-/,
      );
      return { url, cookie: cookiesFrom(response), response };
    };
    const googleCallback = (flow, values, cookie = flow.cookie) =>
      send(
        `/google/callback?${new URLSearchParams({ state: flow.url.searchParams.get("state"), ...values })}`,
        { headers: { Cookie: cookie } },
      );
    const codeCallback = (flow, claims = {}) => {
      const code = `fixture-code-${googleCodes.size}`;
      googleCodes.set(code, {
        nonce: flow.url.searchParams.get("nonce"),
        challenge: flow.url.searchParams.get("code_challenge"),
        claims,
      });
      return googleCallback(flow, { code });
    };
    const token = async (values) => {
      const response = await send("/oauth/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: client.client_id,
          resource: `${origin}/mcp`,
          ...values,
        }),
      });
      return { response, data: await response.json() };
    };
    const exchange = (callback) =>
      token({
        grant_type: "authorization_code",
        code: new URL(callback.headers.get("location")).searchParams.get(
          "code",
        ),
        redirect_uri: params.get("redirect_uri"),
        code_verifier: mcpVerifier,
      });
    const access = (value) =>
      send("/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${value}` },
      });

    const first = await consentPage();
    assert.match(first.html, /Approval continues to Google/);
    assert.equal(discoveryRequests, 0);
    assert.equal((await kv.list({ prefix: "transaction:" })).keys.length, 1);
    assert.equal(
      await db
        .prepare("SELECT COUNT(*) AS count FROM auth_transactions")
        .first("count"),
      0,
    );
    for (const [handle, cookie] of [
      [first.handle, ""],
      [first.handle, first.cookie.replace(/=.*/, "=wrong")],
      ["altered", first.cookie],
      ["", first.cookie],
    ]) {
      const response = await approve({ handle, cookie });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("location"), null);
    }
    assert.equal(discoveryRequests, 0);
    const denial = await approve(first, "cancel");
    checkDenied(denial);
    assert.match(denial.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await approve(first)).status, 400);
    assert.equal(discoveryRequests, 0);

    const invalidMetadata = await send(
      `/authorize?${new URLSearchParams({ ...Object.fromEntries(params), client_id: "https://client.example/metadata" })}`,
    );
    assert.equal(invalidMetadata.status, 400);
    assert.equal(invalidMetadata.headers.get("location"), null);
    assert.equal((await kv.list({ prefix: "transaction:" })).keys.length, 0);

    const metadataConsent = await send(
      `/authorize?${new URLSearchParams({
        ...Object.fromEntries(params),
        client_id: "https://client.example/valid-metadata",
      })}`,
    );
    assert.equal(metadataConsent.status, 200);
    const metadataHtml = await metadataConsent.text();
    assert.match(
      metadataHtml,
      /Client domain: <strong>client.example<\/strong>/,
    );
    assert.doesNotMatch(metadataHtml, /name is not verified/);
    checkDenied(
      await approve(
        {
          handle: metadataHtml.match(/name="handle" value="([^"]+)"/)[1],
          cookie: cookiesFrom(metadataConsent),
        },
        "cancel",
      ),
    );

    const tab1 = await consentPage();
    const tab2 = await consentPage();
    assert.notEqual(tab1.cookie, tab2.cookie);
    const flow1 = await startGoogle({
      ...tab1,
      cookie: `${tab1.cookie}; ${tab2.cookie}`,
    });
    const flow2 = await startGoogle({
      ...tab2,
      cookie: `${tab1.cookie}; ${tab2.cookie}`,
    });
    assert.notEqual(flow1.cookie, flow2.cookie);
    assert.equal(
      (await googleCallback(flow1, { error: "access_denied" }, flow2.cookie))
        .status,
      400,
    );
    assert.equal(
      (await googleCallback(flow1, { error: "access_denied" }, "")).status,
      400,
    );
    const googleDenial = await googleCallback(flow1, {
      error: "access_denied",
    });
    checkDenied(googleDenial);
    assert.match(
      googleDenial.headers.get("set-cookie"),
      /__Host-oauth-upstream-.*Max-Age=0/,
    );
    assert.equal(
      (await googleCallback(flow1, { error: "access_denied" })).status,
      400,
    );
    const missingCode = await googleCallback(flow2, {});
    assert.equal(missingCode.status, 400);
    assert.match(missingCode.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(tokenRequests, 0);

    const invalidToken = await codeCallback(await startGoogle(), {
      nonce: "wrong",
    });
    assert.equal(invalidToken.status, 503);
    assert.equal(invalidToken.headers.get("location"), null);
    assert.match(invalidToken.headers.get("set-cookie"), /Max-Age=0/);

    const flow = await startGoogle();
    const callback = await codeCallback(flow);
    assert.equal(callback.status, 302);
    assert.equal(
      new URL(callback.headers.get("location")).searchParams.get("state"),
      "mcp-original-state",
    );
    assert.equal(callback.headers.getSetCookie().length, 2);
    assert.match(
      callback.headers.getSetCookie()[0],
      /__Host-oauth-upstream-.*Max-Age=0/,
    );
    assert.match(callback.headers.getSetCookie()[1], /__Host-mentis-session=/);
    const sessionCookie = cookiesFrom(callback)
      .split("; ")
      .find((cookie) => cookie.startsWith("__Host-mentis-session="));
    assert.equal((await codeCallback(flow)).status, 400);
    assert.equal(
      await db
        .prepare("SELECT COUNT(*) AS count FROM auth_transactions")
        .first("count"),
      0,
    );
    const exchangeStarted = Date.now();
    const exchanged = await exchange(callback);
    assert.equal(exchanged.response.status, 200);
    const consent = await db
      .prepare(
        "SELECT id, user_id, workspace_id, expires_at FROM oauth_consents WHERE revoked_at IS NULL",
      )
      .first();
    const deadline = Date.parse(consent.expires_at);
    assert.ok(deadline >= exchangeStarted + 604800_000);
    assert.ok(deadline <= Date.now() + 604800_000);
    assert.equal(exchanged.data.expires_in, 600);
    assert.ok(exchanged.data.refresh_token);
    assert.equal(exchanged.data.scope, "test:a test:b");
    const allowed = await access(exchanged.data.access_token);
    assert.equal(allowed.status, 503);
    assert.equal(await allowed.text(), "Mentis database is not configured");
    const refreshed = await token({
      grant_type: "refresh_token",
      refresh_token: exchanged.data.refresh_token,
    });
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.data.expires_in, 600);
    assert.notEqual(refreshed.data.refresh_token, exchanged.data.refresh_token);
    assert.equal(
      await db
        .prepare("SELECT expires_at FROM oauth_consents WHERE id = ?")
        .bind(consent.id)
        .first("expires_at"),
      consent.expires_at,
    );
    assert.equal((await access(refreshed.data.access_token)).status, 503);

    // Reproduce the existing policy mismatch; do not grant operations to narrowed tokens.
    const narrowed = await token({
      grant_type: "refresh_token",
      refresh_token: refreshed.data.refresh_token,
      scope: "test:a",
    });
    assert.equal(narrowed.response.status, 200);
    assert.equal(narrowed.data.scope, "test:a");
    assert.equal((await access(narrowed.data.access_token)).status, 401);

    for (const [table, id] of [
      ["users", consent.user_id],
      ["workspaces", consent.workspace_id],
    ]) {
      const page = await consentPage(sessionCookie);
      const approval = await approve(
        page,
        "allow",
        `${page.cookie}; ${sessionCookie}`,
      );
      const disabledTokens = await exchange(approval);
      assert.equal(disabledTokens.response.status, 200);
      await db
        .prepare(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`)
        .bind(id)
        .run();
      assert.equal(
        (await access(disabledTokens.data.access_token)).status,
        401,
      );
      await db
        .prepare(`UPDATE ${table} SET status = 'active' WHERE id = ?`)
        .bind(id)
        .run();
      assert.equal(
        (await access(disabledTokens.data.access_token)).status,
        503,
      );
      await db
        .prepare(`UPDATE ${table} SET status = 'inactive' WHERE id = ?`)
        .bind(id)
        .run();
      assert.equal(
        (
          await token({
            grant_type: "refresh_token",
            refresh_token: disabledTokens.data.refresh_token,
          })
        ).data.error,
        "invalid_grant",
      );
      await db
        .prepare(`UPDATE ${table} SET status = 'active' WHERE id = ?`)
        .bind(id)
        .run();
    }

    const requestsBeforeSession = discoveryRequests;
    const signedInConsent = await consentPage(sessionCookie);
    assert.match(signedInConsent.html, /Signed in as user@example.com/);
    const signedInApproval = await approve(
      signedInConsent,
      "allow",
      `${signedInConsent.cookie}; ${sessionCookie}`,
    );
    assert.equal(signedInApproval.status, 302);
    assert.equal(
      new URL(signedInApproval.headers.get("location")).origin,
      "http://localhost:3456",
    );
    assert.equal(discoveryRequests, requestsBeforeSession);
    const secondTokens = await exchange(signedInApproval);
    assert.equal(secondTokens.response.status, 200);
    const connections = await send("/connections", {
      headers: { Cookie: sessionCookie },
    });
    const consentId = (await connections.text()).match(
      /name="consentId" value="([^"]+)"/,
    )[1];
    const disconnect = await send("/connections/disconnect", {
      method: "POST",
      headers: { Cookie: sessionCookie, Origin: origin },
      body: new URLSearchParams({ consentId }),
    });
    assert.equal(disconnect.status, 303);
    assert.equal((await access(secondTokens.data.access_token)).status, 401);
    assert.equal((await access(exchanged.data.access_token)).status, 401);
    assert.equal(
      (
        await token({
          grant_type: "refresh_token",
          refresh_token: secondTokens.data.refresh_token,
        })
      ).data.error,
      "invalid_grant",
    );

    const expiringConsent = await consentPage(sessionCookie);
    const expiringCallback = await approve(
      expiringConsent,
      "allow",
      `${expiringConsent.cookie}; ${sessionCookie}`,
    );
    const expiringTokens = await exchange(expiringCallback);
    assert.equal(expiringTokens.response.status, 200);
    await db
      .prepare(
        "UPDATE oauth_consents SET expires_at = ? WHERE revoked_at IS NULL",
      )
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();
    assert.equal((await access(expiringTokens.data.access_token)).status, 401);
    assert.equal(
      (
        await token({
          grant_type: "refresh_token",
          refresh_token: expiringTokens.data.refresh_token,
        })
      ).data.error,
      "invalid_grant",
    );

    const logout = await send("/logout", {
      method: "POST",
      headers: { Cookie: sessionCookie, Origin: origin },
    });
    assert.equal(logout.status, 303);
    assert.match(
      logout.headers.get("set-cookie"),
      /__Host-mentis-session=.*Max-Age=0/,
    );
    assert.equal(
      (await send("/account", { headers: { Cookie: sessionCookie } })).status,
      401,
    );

    assert.equal((await send("/api/account")).status, 401);
    assert.equal((await send("/api/connections")).status, 401);
    const startBrowser = async (code) => {
      const start = await send("/api/sign-in");
      assert.equal(start.status, 302);
      const google = new URL(start.headers.get("location"));
      assert.equal(
        google.searchParams.get("redirect_uri"),
        `${origin}/google/callback`,
      );
      assert.equal(google.searchParams.get("code_challenge_method"), "S256");
      googleCodes.set(code, {
        state: google.searchParams.get("state"),
        nonce: google.searchParams.get("nonce"),
        challenge: google.searchParams.get("code_challenge"),
        redirectUri: `${origin}/google/callback`,
        claims: { sub: "browser-user", email: "browser@example.com" },
      });
      return {
        cookie: cookiesFrom(start),
        state: google.searchParams.get("state"),
      };
    };
    const browser = await startBrowser("browser-code");
    const callbackPath = `/api/google/callback?state=${browser.state}&code=browser-code`;
    const requestsBeforeBrowser = tokenRequests;
    assert.match(browser.state, /^browser-/);
    const relay = await send(
      `/google/callback?state=${browser.state}&code=browser-code`,
    );
    assert.equal(relay.status, 302);
    assert.equal(
      relay.headers.get("location"),
      `https://console.example/api/auth/callback?state=${browser.state}&code=browser-code`,
    );
    assert.equal(relay.headers.get("cache-control"), "no-store");
    assert.equal(relay.headers.get("referrer-policy"), "no-referrer");
    assert.equal(relay.headers.getSetCookie().length, 0);
    assert.equal(tokenRequests, requestsBeforeBrowser);
    const unbound = await send(callbackPath);
    assert.equal(
      unbound.headers.get("location"),
      "https://console.example/sign-in?error=failed",
    );
    assert.equal(tokenRequests, requestsBeforeBrowser);
    const browserCallback = await send(callbackPath, {
      headers: { Cookie: browser.cookie },
    });
    assert.equal(
      browserCallback.headers.get("location"),
      "https://console.example/account",
    );
    assert.match(browserCallback.headers.getSetCookie()[0], /Max-Age=0/);
    assert.match(
      browserCallback.headers.getSetCookie()[1],
      /Secure; HttpOnly; SameSite=Lax/,
    );
    const browserCookie = cookiesFrom(browserCallback)
      .split("; ")
      .find((cookie) => cookie.startsWith("__Host-mentis-session="));
    const browserAccount = await send("/api/account", {
      headers: { Cookie: browserCookie },
    });
    const accountData = await browserAccount.json();
    assert.equal(accountData.email, "browser@example.com");
    assert.equal(accountData.name, "Example User");
    assert.equal(accountData.workspace, "Private workspace");
    assert.ok(accountData.workspaceId);
    assert.equal(accountData.userId, undefined);
    assert.equal(browserAccount.headers.get("cache-control"), "no-store");
    assert.deepEqual(
      await (
        await send("/api/connections", { headers: { Cookie: browserCookie } })
      ).json(),
      [],
    );
    const replay = await send(callbackPath, {
      headers: { Cookie: browser.cookie },
    });
    assert.equal(
      replay.headers.get("location"),
      "https://console.example/sign-in?error=failed",
    );
    assert.equal(tokenRequests, requestsBeforeBrowser + 1);

    const cancelled = await startBrowser("cancelled-code");
    const deniedBrowser = await send(
      `/api/google/callback?state=${cancelled.state}&error=access_denied`,
      { headers: { Cookie: cancelled.cookie } },
    );
    assert.equal(
      deniedBrowser.headers.get("location"),
      "https://console.example/sign-in?error=cancelled",
    );
    assert.equal(tokenRequests, requestsBeforeBrowser + 1);
    const expiredBrowser = await startBrowser("expired-browser-code");
    await db
      .prepare(
        "UPDATE auth_transactions SET expires_at = ? WHERE transaction_type = 'browser-sign-in'",
      )
      .bind(new Date(Date.now() - 1000).toISOString())
      .run();
    const expiredBrowserCallback = await send(
      `/api/google/callback?state=${expiredBrowser.state}&code=expired-browser-code`,
      { headers: { Cookie: expiredBrowser.cookie } },
    );
    assert.equal(
      expiredBrowserCallback.headers.get("location"),
      "https://console.example/sign-in?error=failed",
    );
    assert.equal(tokenRequests, requestsBeforeBrowser + 1);

    const browserConsent = await consentPage(browserCookie);
    const browserApproval = await approve(
      browserConsent,
      "allow",
      `${browserConsent.cookie}; ${browserCookie}`,
    );
    const browserTokens = await exchange(browserApproval);
    assert.equal(browserTokens.response.status, 200);
    const browserConnections = await (
      await send("/api/connections", { headers: { Cookie: browserCookie } })
    ).json();
    assert.equal(browserConnections.length, 1);
    assert.equal(browserConnections[0].name, "<script>untrusted</script>");
    assert.equal(browserConnections[0].status, "active");
    const otherSession = await new D1Store(db).createBrowserSession({
      userId: consent.user_id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const otherCookie = `__Host-mentis-session=${otherSession.secret}`;
    assert.deepEqual(
      await (
        await send("/api/connections", { headers: { Cookie: otherCookie } })
      ).json(),
      [],
    );
    assert.equal(
      (
        await send("/api/connections/disconnect", {
          method: "POST",
          headers: { Cookie: otherCookie, Origin: origin },
          body: new URLSearchParams({ consentId: browserConnections[0].id }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await send("/api/connections/disconnect", {
          method: "POST",
          headers: { Cookie: browserCookie, Origin: "https://evil.example" },
          body: new URLSearchParams({ consentId: browserConnections[0].id }),
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await send("/api/connections/disconnect", {
          method: "POST",
          headers: { Cookie: sessionCookie, Origin: origin },
          body: new URLSearchParams({ consentId: browserConnections[0].id }),
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await send("/api/connections/disconnect", {
          method: "POST",
          headers: { Cookie: browserCookie, Origin: origin },
          body: new URLSearchParams({ consentId: browserConnections[0].id }),
        })
      ).status,
      204,
    );
    assert.equal((await access(browserTokens.data.access_token)).status, 401);
    assert.deepEqual(
      await (
        await send("/api/connections", { headers: { Cookie: browserCookie } })
      ).json(),
      [],
    );
    const browserLogout = await send("/api/logout", {
      method: "POST",
      headers: { Cookie: browserCookie, Origin: origin },
    });
    assert.equal(browserLogout.status, 204);
    assert.match(browserLogout.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(
      (await send("/api/account", { headers: { Cookie: browserCookie } }))
        .status,
      401,
    );
  } finally {
    await mf.dispose();
    rmSync(storage, { recursive: true, force: true });
  }
});

function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForWorker(server, origin) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("Wrangler exited before ready");
    try {
      const response = await fetch(`${origin}/`);
      if (response.status === 200) return response;
    } catch {
      // Wrangler is still starting.
    }
    await delay(200);
  }
  throw new Error("Wrangler did not start in time");
}
