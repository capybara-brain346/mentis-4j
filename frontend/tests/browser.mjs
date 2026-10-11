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
  await readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
);
assert.equal(mcpServerUrl, `${workerConfig.vars.PUBLIC_BASE_URL}/mcp`);
assert.equal(JSON.parse(clientConfig).mcpServers.mentis.url, mcpServerUrl);

const baseUrl = process.env.LANDING_URL ?? "http://127.0.0.1:3000";
const output = resolve("../.impeccable/review");
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
  assert.equal(await page.title(), "Home");
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
      .getByRole("link", { name: "GitHub", exact: true })
      .getAttribute("href"),
    sourceUrl,
  );
  assert.equal(await page.getByText("View source", { exact: true }).count(), 0);
  assert.equal(
    await page.getByText("Demonstration data", { exact: true }).count(),
    0,
  );

  const demo = page.getByLabel("Mentis product demonstration", { exact: true });
  for (const stage of ["1 Record", "2 Find", "3 Inspect"]) {
    await demo.getByRole("tab", { name: stage, exact: true }).click();
    assert.equal(await demo.locator(".demo-step-copy > code").count(), 0);
  }
  await demo.getByRole("tab", { name: "2 Find", exact: true }).click();
  assert.ok(
    await demo.getByText("Similarity 0.92", { exact: true }).isVisible(),
  );
  await demo.getByRole("tab", { name: "3 Inspect", exact: true }).click();
  const graph = demo.getByRole("group", {
    name: "Interactive memory graph",
    exact: true,
  });
  const canvas = graph.locator(".inspect-canvas");
  const scene = graph.locator(".graph-scene");
  const properties = graph.locator(".graph-properties");
  assert.equal(await graph.locator("[data-node]").count(), 4);
  assert.equal(await graph.locator("[data-edge]").count(), 3);
  for (const [node, title] of [
    ["Repository", "Repository"],
    ["Login task", "Login cookie investigation"],
    ["Redirect", "Change the login redirect"],
    ["Cookie", "Retain the session cookie over local HTTP"],
  ]) {
    await graph
      .getByRole("button", { name: `Inspect ${node}`, exact: true })
      .click();
    assert.ok(
      await properties
        .getByRole("heading", { name: title, exact: true })
        .isVisible(),
    );
  }
  assert.ok(
    await properties.getByText("Check passed", { exact: true }).isVisible(),
  );
  await graph
    .getByRole("button", { name: "Inspect Redirect", exact: true })
    .press("Enter");
  assert.ok(
    await properties.getByText("Check failed", { exact: true }).isVisible(),
  );
  assert.ok(await properties.getByText("a8c3f2", { exact: true }).isVisible());
  for (const [relation, type, target] of [
    [
      "Repository HAS_TASK Login task",
      "HAS_TASK",
      "Login cookie investigation",
    ],
    [
      "Login task HAS_ATTEMPT Redirect",
      "HAS_ATTEMPT",
      "Change the login redirect",
    ],
    [
      "Login task HAS_ATTEMPT Cookie",
      "HAS_ATTEMPT",
      "Retain the session cookie over local HTTP",
    ],
  ]) {
    await graph.getByRole("button", { name: relation, exact: true }).click();
    assert.ok(
      await properties
        .getByRole("heading", { name: type, exact: true })
        .isVisible(),
    );
    assert.ok(await properties.getByText(target, { exact: true }).isVisible());
  }
  const failedNode = graph.locator('[data-node="failed"]');
  const initialPosition = await failedNode.getAttribute("transform");
  const nodeBounds = await failedNode.locator("circle").boundingBox();
  const canvasBounds = await canvas.boundingBox();
  await page.mouse.move(
    nodeBounds.x + nodeBounds.width / 2,
    nodeBounds.y + nodeBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    nodeBounds.x + nodeBounds.width / 2 - 15,
    nodeBounds.y + nodeBounds.height / 2 + 20,
    { steps: 4 },
  );
  await page.mouse.up();
  assert.notEqual(
    await failedNode.getAttribute("transform"),
    initialPosition,
    "Dragging must move the node",
  );
  assert.equal(
    await properties.getByRole("heading").innerText(),
    "HAS_ATTEMPT",
    "Dragging must not change selection",
  );
  const initialView = await scene.getAttribute("transform");
  await page.mouse.move(canvasBounds.x + 10, canvasBounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(canvasBounds.x + 30, canvasBounds.y + 20, { steps: 4 });
  await page.mouse.up();
  assert.notEqual(
    await scene.getAttribute("transform"),
    initialView,
    "Dragging the background must pan",
  );
  await graph.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(
    await graph.getByLabel("Graph zoom", { exact: true }).innerText(),
    "120%",
  );
  await graph.getByRole("button", { name: "Zoom out", exact: true }).click();
  assert.equal(
    await graph.getByLabel("Graph zoom", { exact: true }).innerText(),
    "100%",
  );
  for (let i = 0; i < 5; i++)
    await graph.getByRole("button", { name: "Zoom in", exact: true }).click();
  assert.equal(
    await graph
      .getByRole("button", { name: "Zoom in", exact: true })
      .isEnabled(),
    false,
  );
  for (let i = 0; i < 7; i++)
    await graph.getByRole("button", { name: "Zoom out", exact: true }).click();
  assert.equal(
    await graph
      .getByRole("button", { name: "Zoom out", exact: true })
      .isEnabled(),
    false,
  );
  await graph.getByRole("button", { name: "Reset graph", exact: true }).click();
  assert.equal(await failedNode.getAttribute("transform"), initialPosition);
  assert.equal(await scene.getAttribute("transform"), initialView);
  assert.ok(
    await properties
      .getByRole("heading", { name: "Login cookie investigation", exact: true })
      .isVisible(),
  );
  await graph
    .getByRole("button", { name: "Inspect Redirect", exact: true })
    .click();
  const graphAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(graphAudit.violations, []);
  await demo.screenshot({ path: resolve(output, `${name}-inspect.png`) });
  assert.ok(
    await demo
      .getByText("Git state is reported by the agent.", { exact: true })
      .isVisible(),
  );
  const recordTab = demo.getByRole("tab", { name: "1 Record", exact: true });
  await recordTab.focus();
  const focusStyle = await recordTab.evaluate((node) => {
    const style = getComputedStyle(node);
    return { outline: style.outlineStyle, shadow: style.boxShadow };
  });
  assert.deepEqual(focusStyle, { outline: "none", shadow: "none" });
  await recordTab.press("ArrowRight");
  await demo
    .locator('[role="tab"][aria-selected="true"]')
    .filter({ hasText: "Find" })
    .waitFor();
  assert.equal(
    await demo
      .getByRole("tab", { name: "2 Find", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await recordTab.click();
  assert.equal(
    await page.getByRole("link", { name: "Get started", exact: true }).count(),
    1,
  );
  assert.equal(
    await page.locator(".memory-flow, .correction-demo, .feature").count(),
    0,
  );
  assert.equal(await page.locator(".memory-map").count(), 1);
  assert.equal(await page.locator(".agent-logos img").count(), 6);
  assert.equal(
    await page.locator('.agent-logos [aria-label="OpenAI"]').count(),
    0,
  );
  assert.equal(
    await page.getByText("Your coding agent", { exact: true }).count(),
    0,
  );
  assert.equal(
    await demo.locator("img").count(),
    0,
    "Demo must not show an agent logo",
  );
  assert.equal(await page.getByText(/river-app|One login problem/).count(), 0);
  assert.match(
    await page.locator(".memory-service img").last().getAttribute("src"),
    /neo4j/,
  );
  assert.equal(
    await page
      .getByRole("link", { name: "Piyush Choudhari", exact: true })
      .getAttribute("href"),
    "https://piyushc.com",
  );

  const setup = page.locator(".setup-panel");
  const agentSelect = setup.getByRole("combobox", {
    name: "Choose your agent",
  });
  await agentSelect.click();
  assert.equal(await page.getByRole("option").count(), 9);
  assert.equal(await page.locator(".agent-menu img").count(), 8);
  await page.getByRole("option", { name: "Server URL", exact: true }).click();
  const configs = [
    ["Server URL", "MCP server URL", mcpServerUrl],
    ["Cursor", "Cursor configuration", clientConfig],
    ["Claude Code", "Claude Code command", claudeCommand],
    [
      "Codex",
      "Codex commands",
      `codex mcp add mentis --url '${mcpServerUrl}'\ncodex mcp login mentis`,
    ],
    ["Amp", "Amp command", `amp mcp add mentis '${mcpServerUrl}'`],
    [
      "OpenCode",
      "OpenCode configuration",
      JSON.stringify(
        { mcp: { mentis: { type: "remote", url: mcpServerUrl } } },
        null,
        2,
      ),
    ],
    [
      "OpenClaw",
      "OpenClaw commands",
      `openclaw mcp add mentis --url '${mcpServerUrl}' --transport streamable-http\nopenclaw mcp login mentis`,
    ],
    [
      "Hermes Agent",
      "Hermes configuration",
      `mcp_servers:\n  mentis:\n    url: "${mcpServerUrl}"\n    auth: oauth`,
    ],
    [
      "Pi",
      "Pi commands",
      `pi mcp add mentis --url '${mcpServerUrl}'\npi mcp login mentis`,
    ],
  ];
  for (const [agent, label, code] of configs) {
    await agentSelect.click();
    await page.getByRole("option", { name: agent, exact: true }).click();
    assert.equal(await setup.locator("pre").count(), 1);
    assert.ok(!(await setup.locator("pre").innerText()).includes("localhost"));
    if (agent !== "Server URL")
      assert.equal(await agentSelect.locator("img").count(), 1);
    assert.equal(
      await agentSelect.evaluate((node) => getComputedStyle(node).outlineStyle),
      "none",
    );
    assert.equal(
      await setup.getByLabel(label, { exact: true }).innerText(),
      code,
    );
    await setup
      .getByRole("button", { name: `Copy ${code}`, exact: true })
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
  await page
    .locator(".memory-map")
    .screenshot({ path: resolve(output, `${name}-graph.png`) });
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: true,
  });
  await agentSelect.click();
  await page.screenshot({ path: resolve(output, `${name}-agents.png`) });
  await page.getByRole("option", { name: "Server URL", exact: true }).click();

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
    .getByRole("button", { name: `Copy ${mcpServerUrl}`, exact: true })
    .click();
  assert.ok(
    await page
      .getByText("Copy failed. Select and copy the text.", {
        exact: true,
      })
      .isVisible(),
  );
  report.push({
    name,
    viewport,
    checks:
      "tabs, keyboard, graph, logos, public URL, single action, copy and error, anchors, images, accessibility, overflow",
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
  for (const stage of ["1 Record", "3 Inspect", "2 Find"]) {
    await page.getByRole("tab", { name: stage, exact: true }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `320px ${stage} view must fit`,
    );
  }
  assert.equal(
    await page
      .getByRole("tab", { name: "2 Find", exact: true })
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
      .locator(".demo-step-content[data-state='active']")
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
