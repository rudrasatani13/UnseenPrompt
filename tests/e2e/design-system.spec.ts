import { expect, test } from "@playwright/test";

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

    await expect(page).toHaveTitle(/Design System/);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots ?? "").toMatch(/noindex/i);
    expect(robots ?? "").toMatch(/nofollow/i);

    await expect(page.getByRole("heading", { level: 1, name: "Design System" })).toBeVisible();

    for (const name of [...CORE, ...PRODUCT]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }

    await expect(page.getByText(/intentionally long gallery copy/i)).toBeVisible();
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
