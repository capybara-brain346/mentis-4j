import assert from "node:assert/strict";
import { test } from "node:test";
import { backendOrigin, proxyAuthRequest } from "../lib/auth-proxy.ts";

function configure(t) {
  const previous = process.env.MENTIS_BACKEND_URL;
  const previousFrontend = process.env.FRONTEND_BASE_URL;
  process.env.MENTIS_BACKEND_URL = "https://backend.example";
  process.env.FRONTEND_BASE_URL = "https://frontend.example";
  t.after(() => {
    if (previous === undefined) delete process.env.MENTIS_BACKEND_URL;
    else process.env.MENTIS_BACKEND_URL = previous;
    if (previousFrontend === undefined) delete process.env.FRONTEND_BASE_URL;
    else process.env.FRONTEND_BASE_URL = previousFrontend;
  });
}
const request = (action, options) =>
  new Request(`https://frontend.example/api/auth/${action}`, options);

test("proxy rejects unknown routes, wrong methods, foreign origins, and large bodies", async (t) => {
  configure(t);
  const fetch = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not fetch");
  });
  assert.equal(
    (await proxyAuthRequest(request("unknown"), "unknown")).status,
    404,
  );
  assert.equal(
    (await proxyAuthRequest(request("logout"), "logout")).status,
    405,
  );
  for (const origin of [undefined, "https://evil.example"]) {
    assert.equal(
      (
        await proxyAuthRequest(
          request("logout", {
            method: "POST",
            headers: origin ? { Origin: origin } : {},
          }),
          "logout",
        )
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await proxyAuthRequest(
        request("disconnect", {
          method: "POST",
          headers: { Origin: "https://frontend.example" },
          body: "x".repeat(4097),
        }),
        "disconnect",
      )
    ).status,
    413,
  );
  assert.equal(
    (await proxyAuthRequest(request("constructor"), "constructor")).status,
    404,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("proxy sends only Mentis cookies and preserves redirects and separate Set-Cookie headers", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(
      String(url),
      "https://backend.example/api/google/callback?state=state&code=code",
    );
    assert.equal(
      options.headers.get("cookie"),
      "__Host-mentis-sign-in=state; __Host-mentis-session=secret",
    );
    assert.equal(options.redirect, "manual");
    assert.equal(options.cache, "no-store");
    const headers = new Headers({
      Location: "https://frontend.example/account",
    });
    headers.append(
      "Set-Cookie",
      "__Host-mentis-sign-in=; Path=/; Secure; HttpOnly; Max-Age=0",
    );
    headers.append(
      "Set-Cookie",
      "__Host-mentis-session=new; Path=/; Secure; HttpOnly; SameSite=Lax",
    );
    return new Response(null, { status: 302, headers });
  });
  const response = await proxyAuthRequest(
    request("callback?state=state&code=code", {
      headers: {
        Cookie:
          "analytics=private; __Host-mentis-sign-in=state; __Host-mentis-session=secret",
      },
    }),
    "callback",
  );
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://frontend.example/account",
  );
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("proxy forwards a same-origin mutation and does not turn backend errors into success", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(
      String(url),
      "https://backend.example/api/connections/disconnect",
    );
    assert.equal(options.headers.get("origin"), "https://backend.example");
    assert.equal(options.method, "POST");
    assert.equal(options.body, "consentId=owned-consent");
    return new Response("Consent not found", { status: 404 });
  });
  const response = await proxyAuthRequest(
    new Request("http://localhost:3000/api/auth/disconnect", {
      method: "POST",
      headers: { Origin: "https://frontend.example" },
      body: new URLSearchParams({ consentId: "owned-consent" }),
    }),
    "disconnect",
  );
  assert.equal(response.status, 404);
});

test("proxy fails closed when the backend is missing or unavailable", async (t) => {
  configure(t);
  for (const origin of [
    "",
    "https://user:secret@backend.example",
    "http://public.example",
    "https://backend.example/path",
  ]) {
    process.env.MENTIS_BACKEND_URL = origin;
    assert.throws(backendOrigin);
  }
  delete process.env.MENTIS_BACKEND_URL;
  assert.equal(
    (await proxyAuthRequest(request("account"), "account")).status,
    503,
  );
  assert.equal(
    (await proxyAuthRequest(request("sign-in"), "sign-in")).headers.get(
      "location",
    ),
    "/sign-in?error=unavailable",
  );
  process.env.MENTIS_BACKEND_URL = "https://backend.example";
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("secret upstream failure");
  });
  const response = await proxyAuthRequest(request("account"), "account");
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret/);
});
