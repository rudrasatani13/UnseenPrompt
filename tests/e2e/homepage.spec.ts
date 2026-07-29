import { expect, test, type Page, type Request } from "@playwright/test";

import { waitForProductReady } from "./helpers";

const PREVIEW_HEADING = "Turn project context into an agent-ready prompt";
const DISCLOSURE = "Prompt generation becomes interactive in a later phase.";

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(0);
}

async function assertFocusWithinViewport(page: Page): Promise<void> {
  const box = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) {
      return null;
    }

    const rect = active.getBoundingClientRect();
    // For tall landmarks focused via skip link, only the focus origin
    // (top edge) must sit in the viewport — the whole element may overflow.
    return {
      top: rect.top,
      left: rect.left,
      right: Math.min(rect.right, rect.left + Math.min(rect.width, 40)),
      bottom: Math.min(rect.bottom, rect.top + Math.min(rect.height, 40)),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });

  if (!box) {
    return;
  }

  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.top).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(box.viewportWidth + 1);
  expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight + 1);
}

test.describe("homepage preview", () => {
  test("shows the locked preview contract without editable controls", async ({ page }) => {
    const mutating: Request[] = [];
    page.on("request", (request) => {
      const method = request.method().toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        mutating.push(request);
      }
    });

    await page.goto("/");
    await waitForProductReady(page);

    await expect(page.getByRole("heading", { level: 1, name: PREVIEW_HEADING })).toBeVisible();
    await expect(page.getByText(DISCLOSURE)).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /submit|generate|send/i })).toHaveCount(0);

    await assertNoHorizontalOverflow(page);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#main-workspace")).toBeFocused();
    await assertFocusWithinViewport(page);

    expect(mutating).toEqual([]);
  });
});
