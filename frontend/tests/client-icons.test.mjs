import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PUBLIC_CONFIG } from "../../src/config/config.ts";
import { clientIcon } from "../lib/client-icons.ts";

test("client names select local symbol assets by exact normalized name", async () => {
  for (const [name, file] of Object.entries(
    PUBLIC_CONFIG.frontend.clientIcons,
  )) {
    assert.equal(clientIcon(`  ${name.toUpperCase()}  `), `/icons/${file}`);
    assert.match(
      await readFile(
        new URL(`../assets/icons/${file}`, import.meta.url),
        "utf8",
      ),
      /<svg/,
    );
  }
  for (const name of [
    "Cursor",
    "unknown",
    "consent_live",
    "Claude Code impostor",
    "toString",
    "__proto__",
    "",
  ])
    assert.equal(clientIcon(name), undefined);
});

test("build preparation copies every mapped logo without changing its bytes", async () => {
  execFileSync(process.execPath, [
    new URL("../scripts/prepare-assets.mjs", import.meta.url).pathname,
  ]);
  for (const file of new Set(
    Object.values(PUBLIC_CONFIG.frontend.clientIcons),
  )) {
    assert.deepEqual(
      await readFile(new URL(`../public/icons/${file}`, import.meta.url)),
      await readFile(new URL(`../assets/icons/${file}`, import.meta.url)),
    );
  }
});
