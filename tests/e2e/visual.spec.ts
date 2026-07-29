import { expect, test } from "@playwright/test";

import { waitForGalleryReady, waitForProductReady } from "./helpers";

test.describe("visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("homepage mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
    await page.goto("/");
    await waitForProductReady(page);
    await expect(page).toHaveScreenshot("homepage-mobile.png", { fullPage: true });
  });

  test("homepage wide", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "wide");
    await page.goto("/");
    await waitForProductReady(page);
    await expect(page).toHaveScreenshot("homepage-wide.png", { fullPage: true });
  });

  test("gallery tokens mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
    await page.goto("/design-system");
    await waitForGalleryReady(page);
    const tokens = page.locator("#tokens");
    await expect(tokens).toHaveScreenshot("gallery-tokens-mobile.png");
  });

  test("gallery wide", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "wide");
    await page.goto("/design-system");
    await waitForGalleryReady(page);
    await expect(page).toHaveScreenshot("gallery-wide.png", { fullPage: true });
  });

  test("mobile navigation sheet open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
    await page.goto("/");
    await waitForProductReady(page);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText("New Project")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("mobile-nav-sheet.png");
  });

  test("danger alert dialog open", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.goto("/design-system");
    await waitForGalleryReady(page);
    await page.getByRole("button", { name: "Review danger" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("danger-alert-dialog.png");
  });
});
