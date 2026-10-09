import assert from "node:assert/strict";

export const widths = [
  320, 360, 390, 440, 768, 800, 801, 1024, 1150, 1151, 1440,
];

export async function assertLayout(page, label) {
  const failures = await page.evaluate(() => {
    const failures = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      failures.push("Document overflows horizontally");
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const text = walker.currentNode;
      if (!text.textContent.trim()) continue;
      const element = text.parentElement;
      if (
        !element ||
        element.closest("pre, script, style, .sr-only, [aria-hidden=true]")
      )
        continue;
      if (
        !element.checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) {
        if (!rect.width || !rect.height) continue;
        for (
          let parent = element;
          parent && parent !== document.body;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          const bounds = parent.getBoundingClientRect();
          const clipsX = ["hidden", "clip"].includes(style.overflowX);
          const clipsY = ["hidden", "clip"].includes(style.overflowY);
          if (
            (clipsX &&
              (rect.left < bounds.left - 2 || rect.right > bounds.right + 2)) ||
            (clipsY &&
              (rect.top < bounds.top - 2 || rect.bottom > bounds.bottom + 2))
          ) {
            failures.push(
              `${text.textContent.trim().slice(0, 60)} clipped by ${parent.className}`,
            );
            break;
          }
        }
      }
    }
    for (const node of document.querySelectorAll(
      "main button, main input, main select, [role=dialog] button, [role=dialog] input, main summary",
    )) {
      if (
        !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      )
        continue;
      const rect = node.getBoundingClientRect();
      if (rect.height < 43 || rect.width < 43)
        failures.push(
          `Small control: ${node.textContent || node.getAttribute("aria-label")} (${rect.width} x ${rect.height})`,
        );
    }
    for (const node of document.querySelectorAll(
      ".record-fields dd, .record-fields dt, .status, .connection-meta, .connection-details, .status-badge, .consent-permissions span, .detail-list dd",
    )) {
      if (
        node.checkVisibility() &&
        parseFloat(getComputedStyle(node).fontSize) < 14
      )
        failures.push(`Small required text: ${node.className}`);
    }
    return [...new Set(failures)];
  });
  assert.deepEqual(failures, [], label);
}
