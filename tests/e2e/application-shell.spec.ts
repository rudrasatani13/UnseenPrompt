import { expect, test } from "@playwright/test";

import { waitForProductReady } from "./helpers";

test.describe("application shell", () => {
  test("matches the locked responsive chrome", async ({ page }, testInfo) => {
    await page.goto("/");
    await waitForProductReady(page);

    const project = testInfo.project.name;
    const isDesktop = project === "desktop" || project === "wide";

    if (isDesktop) {
      const sidebar = page.locator('[data-slot="shell-sidebar"]');
      await expect(sidebar).toBeVisible();
      const box = await sidebar.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs((box?.width ?? 0) - 232)).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-slot="shell-mobile-header"]')).toBeHidden();
    } else {
      const header = page.locator('[data-slot="shell-mobile-header"]');
      await expect(header).toBeVisible();
      const box = await header.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.abs((box?.height ?? 0) - 56)).toBeLessThanOrEqual(1);
      await expect(page.locator('[data-slot="shell-sidebar"]')).toBeHidden();
      await expect(page.locator('[data-slot="bottom-navigation"]')).toHaveCount(0);
    }

    if (!isDesktop) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }

    const navigation = isDesktop
      ? page.locator("#desktop-shell-navigation")
      : page.getByRole("dialog").locator("#mobile-shell-navigation");

    for (const label of ["Projects", "Usage"]) {
      const soon = navigation.getByText(label, { exact: true });
      await expect(soon).toBeVisible();
      await expect(soon.locator("xpath=ancestor::a")).toHaveCount(0);
    }

    await expect(navigation.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );

    if (!isDesktop) {
      await page.keyboard.press("Escape");
    }
  });

  test("mobile sheet traps focus and restores on close", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "desktop" || testInfo.project.name === "wide");

    await page.goto("/");
    await waitForProductReady(page);
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("New Project");

    const focusInside = async (): Promise<boolean> =>
      page.evaluate(() => {
        const dialogEl = document.querySelector('[role="dialog"]');
        return Boolean(dialogEl && dialogEl.contains(document.activeElement));
      });

    expect(await focusInside()).toBe(true);

    // Walk forward through the trap without escaping.
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      expect(await focusInside()).toBe(true);
    }

    // Walk backward through the trap without escaping.
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusInside()).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("200% text scaling keeps critical controls reachable", async ({ page }) => {
    await page.goto("/");
    await waitForProductReady(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Start with the messy version.",
      }),
    ).toBeVisible();

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  });
});
