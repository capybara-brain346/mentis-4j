import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { mcpServerUrl } from "../lib/demo.ts";

const baseURL = process.env.LANDING_URL ?? "http://127.0.0.1:3000";
const output = resolve("../.impeccable/review/access");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];

async function audit(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;
  await writeFile(
    resolve(output, `${name}-a11y.json`),
    JSON.stringify(violations, null, 2),
  );
  assert.deepEqual(
    violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
    [],
    name,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `${name} must fit the viewport`,
  );
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: true,
  });
  report.push({ name, accessibilityViolations: violations.length });
}

try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      permissions: ["clipboard-read", "clipboard-write"],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.route("**/api/auth/sign-in", (route) =>
      route.fulfill({
        status: 302,
        headers: { Location: "/sign-in?error=unavailable" },
      }),
    );
    await page.route("**/api/auth/account", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"error":"Sign-in required"}',
      }),
    );
    const errors = [];
    const authRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/accounts\.google\.com|\/oauth\/token/.test(request.url()))
        authRequests.push(request.url());
    });
    await page.goto(`${baseURL}/account`);
    await page.getByRole("link", { name: "Go to sign-in" }).waitFor();
    await page.getByRole("link", { name: "Go to sign-in" }).click();
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.locator(".inline-alert").waitFor();
    assert.match(
      await page.locator(".inline-alert").innerText(),
      /could not finish/,
    );
    await audit(page, `${name}-sign-in`);
    await page.getByRole("button", { name: "Open workspace preview" }).click();
    await page
      .getByRole("heading", { name: "Your account", exact: true })
      .waitFor();
    await audit(page, `${name}-account`);
    await page.getByRole("button", { name: /^Copy ID/ }).click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "ws_example_alex",
    );
    if (name === "mobile") {
      await page
        .getByRole("button", { name: "Open account navigation" })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Connected clients" })
        .click();
      assert.equal(await page.getByRole("dialog").count(), 0);
    } else
      await page
        .getByRole("link", { name: "Connected clients", exact: true })
        .click();
    await page
      .getByRole("heading", { name: "Connected clients", exact: true })
      .waitFor();
    await audit(page, `${name}-connections`);
    await page
      .getByRole("searchbox", { name: "Search clients" })
      .fill("no such client");
    await page.getByRole("heading", { name: "No matching clients" }).waitFor();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page
      .getByRole("combobox", { name: "Filter clients by status" })
      .selectOption("expired");
    assert.equal(await page.locator(".connection-row").count(), 1);
    assert.match(await page.locator(".connection-row").innerText(), /Codex/);
    await page
      .getByRole("combobox", { name: "Filter clients by status" })
      .selectOption("all");
    const cursor = page.locator(".connection-row").filter({
      has: page.getByRole("heading", { name: "Cursor", exact: true }),
    });
    await cursor.getByText("Access details", { exact: true }).click();
    assert.match(await cursor.innerText(), /name is not verified/i);
    await cursor
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Keep connected" })
      .click();
    assert.match(await cursor.innerText(), /Connected/);
    await cursor
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Disconnect client" })
      .click();
    assert.match(await cursor.innerText(), /Disconnected/);
    await page.reload();
    await cursor.getByRole("link", { name: "Reconnect" }).waitFor();
    await page.getByRole("button", { name: "Connect a client" }).click();
    const setup = page.getByRole("dialog");
    assert.equal(
      await setup.getByRole("textbox", { name: "MCP server URL" }).inputValue(),
      mcpServerUrl,
    );
    await setup.getByRole("button", { name: /^Copy configuration/ }).click();
    assert.equal(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
        .mcpServers.mentis.url,
      mcpServerUrl,
    );
    await setup.getByRole("tab", { name: "Claude Code", exact: true }).click();
    await setup.getByRole("button", { name: /^Copy command/ }).click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      `claude mcp add --transport http mentis '${mcpServerUrl}'`,
    );
    await setup
      .getByRole("textbox", { name: "MCP server URL" })
      .fill("https://example.com/mcp?q='$(touch /tmp/nope)'");
    await setup.getByRole("button", { name: /^Copy command/ }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.startsWith("claude mcp add --transport http mentis '"));
    assert.ok(copied.includes("'\\''"), "User input must be shell quoted");
    await setup
      .getByRole("textbox", { name: "MCP server URL" })
      .fill("http://invalid.example.com");
    await setup.getByRole("tab", { name: "Cursor", exact: true }).click();
    assert.equal(
      await setup.getByRole("button", { name: /^Copy configuration/ }).count(),
      0,
    );
    await setup.getByText("Enter a valid HTTPS server URL.").waitFor();
    await setup
      .getByRole("textbox", { name: "MCP server URL" })
      .fill(mcpServerUrl);
    await setup.getByRole("tab", { name: "Cursor", exact: true }).click();
    await audit(page, `${name}-setup`);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await cursor.getByRole("link", { name: "Reconnect" }).click();
    await page
      .getByRole("heading", { name: "Allow Cursor to use Mentis?" })
      .waitFor();
    await page
      .getByText("Client and redirect details", { exact: true })
      .click();
    await audit(page, `${name}-consent`);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("heading", { name: "Access was not granted." })
      .waitFor();
    await page.getByRole("button", { name: "Review request" }).click();
    await page
      .getByRole("button", { name: "Allow access", exact: true })
      .click();
    await page.getByRole("heading", { name: "Cursor is connected." }).waitFor();
    await page.getByRole("link", { name: "View connected clients" }).click();
    assert.match(await cursor.innerText(), /Connected/);
    await page.goto(`${baseURL}/account/security`);
    await page
      .getByRole("heading", { name: "Security", exact: true })
      .waitFor();
    await audit(page, `${name}-security`);
    await page
      .getByRole("button", { name: "Sign out of this browser" })
      .click();
    await page
      .getByRole("group", { name: "Confirm sign-out" })
      .getByRole("button", { name: "Sign out of preview", exact: true })
      .click();
    await page.goto(`${baseURL}/authorize?preview=1&client=claude`);
    await page.getByRole("button", { name: "Allow and continue" }).click();
    await page
      .getByRole("heading", { name: "Continue with your account." })
      .waitFor();
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.locator(".inline-alert").waitFor();
    await page
      .getByRole("button", { name: "Continue with example account" })
      .click();
    await page
      .getByRole("heading", { name: "Claude Code is connected." })
      .waitFor();
    await page.goto(`${baseURL}/authorize?preview=1&state=expired`);
    await page
      .getByRole("heading", { name: "This request has expired." })
      .waitFor();
    await page.goto(
      `${baseURL}/authorize?client_id=untrusted&redirect_uri=https://evil.example`,
    );
    await page
      .getByRole("heading", { name: "Start from your MCP client." })
      .waitFor();
    assert.deepEqual(
      authRequests,
      [],
      "The preview must not issue real OAuth requests",
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  const narrow = await browser.newContext({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const page = await narrow.newPage();
  await page.goto(`${baseURL}/sign-in`);
  await page.getByRole("button", { name: "Open workspace preview" }).click();
  for (const route of [
    "account",
    "connections",
    "account/security",
    "authorize?preview=1",
  ]) {
    await page.goto(`${baseURL}/${route}`);
    await page.locator("main h1").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `320px ${route}`,
    );
  }
  await narrow.close();
  await writeFile(
    resolve(output, "checks.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        screens: report.length,
        checks:
          "sign-in boundary, account gate, clipboard, filter, disconnect, persistence, setup, consent order, cancellation, expiry, untrusted requests, mobile menu, accessibility, 320px overflow",
        report,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
