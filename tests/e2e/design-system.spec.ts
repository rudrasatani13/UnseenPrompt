import { expect, test } from "@playwright/test";

import { waitForGalleryReady } from "./helpers";

const CORE = [
  "Button",
  "Input",
  "Textarea",
  "Card",
  "Badge",
  "Separator",
  "Tooltip",
  "ScrollArea",
  "Tabs",
  "Dialog",
  "AlertDialog",
  "Sheet",
  "DropdownMenu",
  "Progress",
  "FileItem",
  "Skeleton",
  "EmptyState",
  "Alert",
  "Toast",
] as const;

const PRODUCT = [
  "LifecycleSteps",
  "ConfirmationCard",
  "EvidenceLabel",
  "PromptPanel",
  "QuestionChoice",
  "ToolSelector",
  "UsageMeter",
  "RiskWarning",
] as const;

test.describe("design-system gallery", () => {
  test("is available outside production with full inventory", async ({ page }) => {
    const response = await page.goto("/design-system");
    expect(response?.status()).toBe(200);
    await waitForGalleryReady(page);

    await expect(page).toHaveTitle(/Design System/);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "").toMatch(/noindex/i);
    expect(robots ?? "").toMatch(/nofollow/i);

    await expect(page.getByRole("heading", { level: 1, name: "Design System" })).toBeVisible();

    for (const name of [...CORE, ...PRODUCT]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }

    await expect(page.getByRole("heading", { name: "Reduced motion", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Forced colors", exact: true })).toBeVisible();
    await expect(page.getByText("success-background", { exact: true })).toBeVisible();
    await expect(page.getByText("on canvas ≈ 21:1", { exact: true })).toBeVisible();

    await expect(page.getByText(/intentionally long gallery copy/i)).toBeVisible();
    for (const status of ["ready", "uploading", "processing", "error", "complete"] as const) {
      await expect(page.locator(`[data-slot="file-item"][data-status="${status}"]`)).toBeVisible();
    }
    await expect(
      page.locator('[data-slot="file-item"][data-status="error"] [role="alert"]'),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
