import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const baseURL = process.env.LANDING_URL ?? "http://127.0.0.1:3000";
const output = resolve("../.impeccable/review/access");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function audit(page, name) {
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations;
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
  await writeFile(
    resolve(output, `${name}-a11y.json`),
    JSON.stringify(violations),
  );
}

try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.route("**/api/auth/account", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"error":"Sign-in required"}',
      }),
    );
    await page.goto(`${baseURL}/connections`);
    await page.waitForURL(`${baseURL}/dashboard`);
    await page.getByRole("link", { name: "Go to sign-in" }).waitFor();
    await page.goto(`${baseURL}/account`);
    await page.waitForURL(`${baseURL}/dashboard`);
    await page.getByRole("link", { name: "Go to sign-in" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Open workspace preview" })
        .count(),
      0,
    );
    assert.equal(await page.title(), "Dashboard");
    await audit(page, `${name}-signed-out`);
    await page.getByRole("link", { name: "Go to sign-in" }).click();
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
    assert.equal(
      await page.getByText("Open workspace preview", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page
        .getByText("Preview the consent screen", { exact: true })
        .count(),
      0,
    );
    assert.equal(await page.title(), "Sign In");
    assert.equal(
      await page
        .getByRole("link", { name: "Back to Mentis", exact: true })
        .count(),
      0,
    );
    await audit(page, `${name}-sign-in`);
    await page.goto(`${baseURL}/sign-in?error=cancelled`);
    await page.locator(".inline-alert").waitFor();
    await audit(page, `${name}-sign-in-error`);
    await page.goto(`${baseURL}/authorize?preview=1&client=cursor`);
    await page.waitForURL(`${baseURL}/dashboard`);
    assert.equal(
      await page.getByText("UI preview", { exact: true }).count(),
      0,
    );
    assert.equal(
      (await page.request.get(`${baseURL}/account/security`)).status(),
      404,
    );
    await context.close();
  }
  console.log(
    `Access checks passed on desktop and mobile. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
