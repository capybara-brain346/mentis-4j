import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { CONFIG } from "../../src/config/config.ts";

// The Worker/OIDC protocol is tested in tests/worker.test.js. This fixture checks the Next server and browser together.
const sessions = new Map();
const states = new Set();
let frontend;
let failDisconnect = false;
let failAccount = false;
let mutations = 0;
const failures = [];
const backend = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://fixture");
    const cookies = Object.fromEntries(
      (request.headers.cookie ?? "")
        .split("; ")
        .filter(Boolean)
        .map((cookie) => cookie.split("=")),
    );
    const send = (status, data) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(data === undefined ? undefined : JSON.stringify(data));
    };
    if (url.pathname === "/api/sign-in") {
      const state = randomUUID();
      states.add(state);
      response.writeHead(302, {
        Location: `${frontend}/api/auth/callback?state=${state}&code=fixture`,
        "Set-Cookie": `__Host-mentis-sign-in=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${CONFIG.oauth.pendingTransactionTtlSeconds}`,
      });
      return response.end();
    }
    if (url.pathname === "/api/google/callback") {
      const state = url.searchParams.get("state");
      assert.equal(cookies["__Host-mentis-sign-in"], state);
      assert.ok(states.delete(state));
      const secret = randomUUID();
      sessions.set(secret, { connected: true });
      response.writeHead(302, {
        Location: `${frontend}/account`,
        "Set-Cookie": [
          "__Host-mentis-sign-in=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
          `__Host-mentis-session=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`,
        ],
      });
      return response.end();
    }
    const session = sessions.get(cookies["__Host-mentis-session"]);
    if (!session) return send(401, { error: "Sign-in required" });
    if (url.pathname === "/api/account") {
      if (failAccount) return send(503, { error: "Fixture outage" });
      return send(200, {
        name: "Live User",
        email: "live@example.com",
        workspace: "Private workspace",
        workspaceId: "ws_live",
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
    }
    if (url.pathname === "/api/connections")
      return send(
        200,
        session.connected
          ? [
              {
                id: "consent_live",
                name: "Codex",
                description: "Registered client. Name is not verified.",
                status: "active",
                connected: new Date().toISOString(),
                expires: new Date(
                  Date.now() + CONFIG.oauth.refreshTokenTtlSeconds * 1000,
                ).toISOString(),
              },
            ]
          : [],
      );
    assert.equal(request.method, "POST");
    assert.equal(
      request.headers.origin,
      `http://127.0.0.1:${backend.address().port}`,
    );
    mutations++;
    if (url.pathname === "/api/connections/disconnect") {
      let body = "";
      for await (const chunk of request) body += chunk;
      assert.equal(new URLSearchParams(body).get("consentId"), "consent_live");
      if (failDisconnect) return send(503, { error: "Fixture outage" });
      session.connected = false;
      return send(204);
    }
    if (url.pathname === "/api/logout") {
      sessions.delete(cookies["__Host-mentis-session"]);
      response.setHeader(
        "Set-Cookie",
        "__Host-mentis-session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      return send(204);
    }
    send(404);
  } catch (error) {
    failures.push(error);
    response.writeHead(500);
    response.end();
  }
});
await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
const reserve = createServer();
await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
frontend = `http://127.0.0.1:${reserve.address().port}`;
await new Promise((resolve) => reserve.close(resolve));
const next = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL("../node_modules/next/dist/bin/next", import.meta.url),
    ),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    new URL(frontend).port,
  ],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      MENTIS_BACKEND_URL: `http://127.0.0.1:${backend.address().port}`,
      FRONTEND_BASE_URL: frontend,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
next.stdout.on("data", (data) => {
  logs += data;
});
next.stderr.on("data", (data) => {
  logs += data;
});
let browser;
const screenshots = await mkdtemp(join(tmpdir(), "mentis-account-check-"));
try {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      if ((await fetch(`${frontend}/sign-in`)).ok) break;
    } catch {
      /* Wait for Next to start. */
    }
    if (next.exitCode !== null || Date.now() > deadline)
      throw new Error(`Next did not start: ${logs}`);
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${frontend}/sign-in`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    assert.equal(new URL(page.url()).pathname, "/dashboard");
    assert.equal(await page.title(), "Dashboard");
    assert.equal(
      await page.getByText("Account details", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByText("Your workspace", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.evaluate(() => document.cookie.includes("mentis-session")),
      false,
    );
    const cookie = (await context.cookies()).find(
      (item) => item.name === "__Host-mentis-session",
    );
    assert.ok(cookie.httpOnly && cookie.secure);
    await page.reload();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    const navigate = async (label) => {
      if (name === "mobile") {
        await page
          .getByRole("button", { name: "Open account navigation" })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("link", { name: label, exact: true })
          .click();
      } else
        await page
          .getByRole("navigation", { name: "Account navigation", exact: true })
          .getByRole("link", { name: label, exact: true })
          .click();
    };
    const audit = async (screen) => {
      const violations = (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations;
      assert.deepEqual(
        violations.map(({ id }) => id),
        [],
        `${name}-${screen}`,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: join(screenshots, `${name}-${screen}.png`),
        fullPage: true,
      });
    };
    await audit("account");
    console.log(`${name}: sign-in and account reload passed`);
    await navigate("Connected clients");
    await page.getByRole("heading", { name: "Codex", exact: true }).waitFor();
    assert.equal(await page.locator(".client-mark img").count(), 1);
    assert.ok(
      await page
        .locator(".client-mark img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    );
    await audit("connections");
    await page
      .getByRole("button", { name: "Connect a client", exact: true })
      .click();
    const setup = page.getByRole("dialog");
    for (const agent of ["Server URL", "Cursor", "Claude Code", "Codex"]) {
      await setup.getByRole("combobox", { name: "Choose your agent" }).click();
      assert.equal(await page.getByRole("option").count(), 4);
      await page.getByRole("option", { name: agent, exact: true }).click();
      assert.equal(await setup.locator("pre").count(), 1);
      assert.match(
        await setup.locator("pre").innerText(),
        agent === "Codex"
          ? /codex mcp login mentis/
          : agent === "Claude Code"
            ? /claude mcp add/
            : agent === "Cursor"
              ? /mcpServers/
              : /\/mcp$/,
      );
    }
    assert.equal(
      await setup.getByText("Preview consent", { exact: true }).count(),
      0,
    );
    await audit("connect-client");
    await page.getByRole("button", { name: "Close client setup" }).click();
    failDisconnect = true;
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    const failedRequest = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/disconnect"),
    );
    await page
      .getByRole("button", { name: "Disconnect client", exact: true })
      .click();
    const failedResponse = await failedRequest;
    assert.equal(failedResponse.status(), 503);
    await page.getByRole("dialog").getByRole("alert").waitFor();
    assert.equal(await page.locator(".connection-row").count(), 1);
    failDisconnect = false;
    const successRequest = page.waitForResponse((response) =>
      response.url().endsWith("/api/auth/disconnect"),
    );
    await page
      .getByRole("button", { name: "Disconnect client", exact: true })
      .click();
    const successResponse = await successRequest;
    assert.equal(
      successResponse.status(),
      204,
      failures.map((error) => error.stack).join("\n"),
    );
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".connection-row").count(), 0);
    console.log(`${name}: disconnect failure and retry passed`);
    if (name === "mobile")
      await page
        .getByRole("button", { name: "Open account navigation" })
        .click();
    const [logoutResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/logout"),
      ),
      page
        .getByRole("button", { name: "Sign out", exact: true })
        .filter({ visible: true })
        .click(),
    ]);
    assert.equal(logoutResponse.status(), 204);
    await page.waitForURL(`${frontend}/sign-in`);
    console.log(`${name}: logout passed`);
    assert.equal(
      (await context.cookies()).some(
        (item) => item.name === "__Host-mentis-session",
      ),
      false,
    );
    await page.goto(`${frontend}/account`);
    await page.getByRole("link", { name: "Go to sign-in" }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${frontend}/sign-in`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  failAccount = true;
  await page.reload();
  await page.locator(".inline-alert").waitFor();
  assert.equal(await page.locator(".profile-summary").count(), 0);
  failAccount = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.goto(`${frontend}/authorize?preview=1&client=cursor`);
  await page.waitForURL(`${frontend}/connections`);
  assert.equal(
    await page.getByText("Preview consent", { exact: true }).count(),
    0,
  );
  await page.goto(`${frontend}/account/security`);
  assert.equal(
    (await page.request.get(`${frontend}/account/security`)).status(),
    404,
  );
  assert.deepEqual(failures, []);
  console.log(
    `Account browser checks passed (desktop and mobile). Screenshots: ${screenshots}`,
  );
} finally {
  await browser?.close();
  if (next.exitCode === null) {
    const exited = once(next, "exit");
    next.kill("SIGTERM");
    const timer = setTimeout(() => next.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  }
  backend.closeAllConnections();
  await new Promise((resolve) => backend.close(resolve));
}
