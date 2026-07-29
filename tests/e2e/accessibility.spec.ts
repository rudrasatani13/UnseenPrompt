import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { waitForGalleryReady, waitForProductReady } from "./helpers";

async function assertNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );

  if (serious.length > 0) {
    const details = serious
      .map((violation) => {
        const nodes = violation.nodes
          .map((node) => node.target.join(" "))
          .slice(0, 5)
          .join(", ");
        return `${violation.id} [${violation.impact}] ${violation.help} → ${nodes}`;
      })
      .join("\n");
    throw new Error(`Serious/critical axe violations:\n${details}`);
  }
}

async function assertFocusedElementNotObscured(page: Page): Promise<void> {
  const obscured = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) {
      return false;
    }

    const rect = active.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    return !(top === active || active.contains(top));
  });

  expect(obscured).toBe(false);
}

function hasVisibleBorderOrOutline(styles: {
  outlineStyle: string;
  outlineWidth: string;
  borderStyle: string;
  borderWidth: string;
}): boolean {
  return (
    (styles.outlineStyle !== "none" && styles.outlineWidth !== "0px") ||
    (styles.borderStyle !== "none" && styles.borderWidth !== "0px")
  );
}

test.describe("accessibility", () => {
  test("homepage and design-system have no serious axe violations", async ({ page }) => {
    await page.goto("/");
    await waitForProductReady(page);
    await assertNoSeriousAxeViolations(page);

    await page.goto("/design-system");
    await waitForGalleryReady(page);
    await assertNoSeriousAxeViolations(page);

    await page.getByRole("button", { name: "Open dialog" }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");
    await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    // Scope to the open panel so the page under the scrim is not sampled.
    const dialogResults = await new AxeBuilder({ page })
      .include('[data-slot="dialog-content"]')
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const dialogSerious = dialogResults.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(dialogSerious, JSON.stringify(dialogSerious, null, 2)).toEqual([]);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open sheet" }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCSS("opacity", "1");
    await expect(sheet).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const sheetResults = await new AxeBuilder({ page })
      .include('[data-slot="sheet-content"]')
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const sheetSerious = sheetResults.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(sheetSerious, JSON.stringify(sheetSerious, null, 2)).toEqual([]);
  });

  test("reduced motion keeps equivalent text and icon state", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/design-system");
    await waitForGalleryReady(page);

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy prompt" }).first().click();
    // Success uses a live status region; clipboard failure still surfaces text recovery.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Copied" })
        .or(page.getByRole("alert").filter({ hasText: /Copy failed/ })),
    ).toBeVisible();

    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Open sheet" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");

    const tablist = page.getByRole("tablist").first();
    await tablist.getByRole("tab").nth(0).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tablist.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  });

  test("forced colors keep control borders and selection visible", async ({ page }, testInfo) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await waitForProductReady(page);

    const skip = page.getByRole("link", { name: "Skip to main content" });
    await skip.focus();
    await expect(skip).toBeFocused();
    expect(
      hasVisibleBorderOrOutline(
        await skip.evaluate((el) => {
          const styles = getComputedStyle(el);
          return {
            outlineStyle: styles.outlineStyle,
            outlineWidth: styles.outlineWidth,
            borderStyle: styles.borderStyle,
            borderWidth: styles.borderWidth,
          };
        }),
      ),
    ).toBe(true);
    await assertFocusedElementNotObscured(page);

    const isDesktop = testInfo.project.name === "desktop" || testInfo.project.name === "wide";

    if (isDesktop) {
      const newProject = page.locator("#desktop-shell-navigation").getByRole("link", {
        name: "New Project",
      });
      await newProject.focus();
      await expect(newProject).toBeFocused();
      expect(
        hasVisibleBorderOrOutline(
          await newProject.evaluate((el) => {
            const styles = getComputedStyle(el);
            return {
              outlineStyle: styles.outlineStyle,
              outlineWidth: styles.outlineWidth,
              borderStyle: styles.borderStyle,
              borderWidth: styles.borderWidth,
            };
          }),
        ),
      ).toBe(true);
    } else {
      const menu = page.getByRole("button", { name: "Open navigation" });
      await menu.focus();
      await expect(menu).toBeFocused();
      expect(
        hasVisibleBorderOrOutline(
          await menu.evaluate((el) => {
            const styles = getComputedStyle(el);
            return {
              outlineStyle: styles.outlineStyle,
              outlineWidth: styles.outlineWidth,
              borderStyle: styles.borderStyle,
              borderWidth: styles.borderWidth,
            };
          }),
        ),
      ).toBe(true);
    }

    await page.goto("/design-system");
    await waitForGalleryReady(page);

    const forcedTarget = page.getByRole("button", { name: "Forced-colors focus target" });
    await forcedTarget.scrollIntoViewIfNeeded();
    await forcedTarget.focus();
    await expect(forcedTarget).toBeFocused();
    expect(
      hasVisibleBorderOrOutline(
        await forcedTarget.evaluate((el) => {
          const styles = getComputedStyle(el);
          return {
            outlineStyle: styles.outlineStyle,
            outlineWidth: styles.outlineWidth,
            borderStyle: styles.borderStyle,
            borderWidth: styles.borderWidth,
          };
        }),
      ),
    ).toBe(true);

    const selectedRadio = page
      .locator('[data-gallery-forced-colors-specimen] [data-slot="radio-group-item"]')
      .first();
    await expect(selectedRadio).toHaveAttribute("data-state", "checked");
    const radioBorder = await selectedRadio.evaluate((el) => getComputedStyle(el).borderWidth);
    expect(radioBorder).not.toBe("0px");
  });
});
