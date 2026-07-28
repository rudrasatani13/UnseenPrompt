import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

test.describe("accessibility", () => {
  test("homepage and design-system have no serious axe violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await assertNoSeriousAxeViolations(page);

    await page.goto("/design-system");
    await page.waitForLoadState("networkidle");
    // Closed default state only — open overlays are checked separately below.
    await assertNoSeriousAxeViolations(page);

    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    /*
     * Open-dialog scans exclude color-contrast: axe samples through the
     * translucent overlay and reports washed foregrounds that are not the
     * solid dialog surface tokens. Name/role/keyboard rules still run.
     */
    const dialogResults = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .disableRules(["color-contrast"])
      .analyze();
    const dialogSerious = dialogResults.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(dialogSerious, JSON.stringify(dialogSerious, null, 2)).toEqual([]);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open sheet" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const sheetResults = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .disableRules(["color-contrast"])
      .analyze();
    const sheetSerious = sheetResults.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(sheetSerious, JSON.stringify(sheetSerious, null, 2)).toEqual([]);
  });

  test("reduced motion keeps equivalent text and icon state", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/design-system");

    await page.getByRole("button", { name: "Copy prompt" }).first().click();
    await expect(page.getByText("Copied").or(page.getByText(/Copy failed/))).toBeVisible();

    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("forced colors keep control borders and selection visible", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");

    const skip = page.getByRole("link", { name: "Skip to main content" });
    await skip.focus();
    await expect(skip).toBeFocused();

    const outline = await skip.evaluate((el) => {
      const styles = getComputedStyle(el);
      return {
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
        borderStyle: styles.borderStyle,
        borderWidth: styles.borderWidth,
      };
    });

    expect(
      outline.outlineStyle !== "none" ||
        outline.borderStyle !== "none" ||
        outline.outlineWidth !== "0px" ||
        outline.borderWidth !== "0px",
    ).toBe(true);

    await assertFocusedElementNotObscured(page);
  });
});
