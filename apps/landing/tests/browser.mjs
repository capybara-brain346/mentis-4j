import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, request } from "playwright";
import {
  claudeCommand,
  clientConfig,
  mcpServerUrl,
  sourceUrl,
} from "../lib/demo.ts";

const workerConfig = JSON.parse(
  await readFile(new URL("../../../wrangler.jsonc", import.meta.url), "utf8"),
);
assert.equal(mcpServerUrl, `${workerConfig.vars.PUBLIC_BASE_URL}/mcp`);
assert.equal(JSON.parse(clientConfig).mcpServers.mentis.url, mcpServerUrl);

const baseUrl = process.env.LANDING_URL ?? "http://127.0.0.1:3000";
const output = resolve("../../.impeccable/review");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const report = [];

async function checkPage(name, viewport) {
  const context = await browser.newContext({
    viewport,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  await page.evaluate(() => document.fonts.ready);
  assert.match(await page.title(), /Mentis/);
  const actionContrast = await page.locator(".pill").evaluateAll((nodes) => {
    const luminance = (color) => {
      const values = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map((value) => {
          const channel = Number(value) / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    return nodes.map((node) => {
      const style = getComputedStyle(node);
      const colors = [
        luminance(style.color),
        luminance(style.backgroundColor),
      ].sort((a, b) => a - b);
      return {
        text: node.textContent,
        ratio: (colors[1] + 0.05) / (colors[0] + 0.05),
      };
    });
  });
  assert.ok(
    actionContrast.every((action) => action.ratio >= 4.5),
    "Action labels must meet text contrast",
  );

  const links = await page.locator('a[href^="#"]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute("href"),
      exists: !!document.getElementById(node.getAttribute("href").slice(1)),
    })),
  );
  assert.ok(
    links.every((link) => link.exists),
    "All page anchors must have a target",
  );
  assert.equal(
    await page
      .locator("a")
      .filter({ hasText: "View source" })
      .first()
      .getAttribute("href"),
    sourceUrl,
  );

  const demo = page.getByLabel("Mentis product demonstration", { exact: true });
  await demo.getByRole("tab", { name: "Find", exact: true }).click();
  assert.ok(
    await demo.getByText("Similarity 0.92", { exact: true }).isVisible(),
  );
  await demo.getByRole("tab", { name: "Inspect", exact: true }).click();
  assert.ok(await demo.getByText("Check failed", { exact: true }).isVisible());
  assert.ok(
    await demo
      .getByText("Git state is reported by the agent.", { exact: true })
      .isVisible(),
  );
  const recordTab = demo.getByRole("tab", { name: "Record", exact: true });
  await recordTab.focus();
  await recordTab.press("ArrowRight");
  await demo
    .locator('[role="tab"][aria-selected="true"]')
    .filter({ hasText: "Find" })
    .waitFor();
  assert.equal(
    await demo
      .getByRole("tab", { name: "Find", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await recordTab.click();
  await demo.getByRole("button", { name: "Play demo", exact: true }).click();
  assert.ok(
    await demo
      .getByRole("button", { name: "Pause demo", exact: true })
      .isVisible(),
  );
  await page.waitForTimeout(6200);
  assert.equal(
    await demo
      .getByRole("tab", { name: "Find", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await demo.getByRole("button", { name: "Pause demo", exact: true }).click();
  await recordTab.click();

  const correction = page.locator(".correction-demo");
  await correction
    .getByRole("button", { name: "Mark example outdated", exact: true })
    .click();
  assert.ok(
    await correction
      .getByText("Conclusion outdated", { exact: true })
      .isVisible(),
  );
  assert.ok(
    await correction
      .getByText("Cookie auth handles this route.", { exact: true })
      .isVisible(),
  );
  await correction
    .getByRole("tab", { name: "Remove attempt", exact: true })
    .click();
  await correction
    .getByRole("button", { name: "Remove example", exact: true })
    .click();
  assert.ok(
    await correction
      .getByText("Example attempt removed.", { exact: true })
      .isVisible(),
  );
  await correction
    .getByRole("button", { name: "Reset example", exact: true })
    .click();
  assert.ok(
    await correction
      .getByRole("button", { name: "Remove example", exact: true })
      .isEnabled(),
  );
  await correction
    .getByRole("tab", { name: "Mark outdated", exact: true })
    .click();
  assert.ok(
    await correction
      .getByRole("button", { name: "Mark example outdated", exact: true })
      .isEnabled(),
  );

  const setup = page.locator(".setup-panel");
  const configs = [
    ["MCP server URL", mcpServerUrl],
    ["MCP client configuration", clientConfig],
    ["Claude Code command", claudeCommand],
  ];
  for (const [label, code] of configs) {
    assert.equal(
      await setup.getByLabel(label, { exact: true }).innerText(),
      code,
    );
    await setup
      .getByRole("button", { name: `Copy ${label}`, exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      code,
    );
  }
  const accessibleSetup = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    resolve(output, `${name}-setup-a11y.json`),
    JSON.stringify(accessibleSetup.violations, null, 2),
  );
  assert.deepEqual(
    accessibleSetup.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
    "Remote setup must pass accessibility checks",
  );
  if (name === "mobile") {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    assert.ok(await dialog.isVisible());
    await page.keyboard.press("Escape");
    assert.ok(!(await dialog.isVisible()));
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await dialog.getByRole("link", { name: "Setup", exact: true }).click();
    assert.ok(!(await dialog.isVisible()));
    assert.equal(new URL(page.url()).hash, "#setup");
  }

  for (const image of await page.locator("img").all())
    await image.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  const images = await page.locator("img").evaluateAll((nodes) =>
    nodes.map((node) => ({
      src: node.currentSrc,
      loaded: node.complete && node.naturalWidth > 0,
    })),
  );
  assert.ok(images.every((image) => image.loaded));
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    resolve(output, `${name}-a11y.json`),
    JSON.stringify(audit.violations, null, 2),
  );
  assert.deepEqual(
    audit.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    [],
  );
  assert.deepEqual(errors, []);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    history.replaceState(null, "", location.pathname);
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, "Page must not overflow horizontally");
  await page.screenshot({ path: resolve(output, `${name}-top.png`) });
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: true,
  });

  await context.grantPermissions([]);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard denied");
        },
      },
    });
  });
  await setup
    .getByRole("button", { name: "Copy MCP server URL", exact: true })
    .click();
  assert.ok(
    await page
      .getByText("Copy failed. Select the code and copy it manually.", {
        exact: true,
      })
      .isVisible(),
  );
  report.push({
    name,
    viewport,
    checks:
      "tabs, keyboard, playback, corrections, copy and error, anchors, images, accessibility, overflow",
    violations: audit.violations.length,
    errors,
  });
  await context.close();
}

try {
  await checkPage("desktop", { width: 1440, height: 1000 });
  await checkPage("mobile", { width: 390, height: 844 });
  const reduced = await browser.newContext({
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const page = await reduced.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.ok(
    await page
      .getByRole("button", {
        name: "Playback disabled by reduced motion preference",
        exact: true,
      })
      .isDisabled(),
  );
  for (const stage of ["Record", "Inspect", "Find"]) {
    await page.getByRole("tab", { name: stage, exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `320px ${stage} view must fit`,
    );
  }
  await page.waitForTimeout(6200);
  assert.equal(
    await page
      .getByRole("tab", { name: "Find", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await page
      .locator(".demo-content[data-state='active']")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  for (const image of await page.locator("main img").all())
    await image.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({
    path: resolve(output, "narrow.png"),
    fullPage: true,
  });
  await reduced.close();
  const response = await request.newContext();
  const social = await response.get(`${baseUrl}/opengraph-image`);
  assert.equal(social.status(), 200);
  assert.match(social.headers()["content-type"], /image\/png/);
  await writeFile(resolve(output, "social-preview.png"), await social.body());
  const socialPage = await browser.newPage();
  await socialPage.goto(baseUrl, { waitUntil: "networkidle" });
  const imageRange = await socialPage.evaluate(async () => {
    const image = new Image();
    image.src = "/opengraph-image";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(60, 300, 1080, 220).data;
    let minimum = 255;
    let maximum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      minimum = Math.min(minimum, pixels[i]);
      maximum = Math.max(maximum, pixels[i]);
    }
    return maximum - minimum;
  });
  assert.ok(imageRange > 30, "Social preview must contain the landscape");
  await socialPage.close();
  await response.dispose();
  report.push({
    name: "reduced-motion",
    width: 320,
    checks: "no playback, no animation, tabs work, no overflow",
  });
  await writeFile(
    resolve(output, "browser-checks.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
