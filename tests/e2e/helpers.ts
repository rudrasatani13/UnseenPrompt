import { expect, type Page } from "@playwright/test";

const PRODUCT_HEADING = "Start with the messy version.";
const COMING_SOON_HEADING = "Bring the half-finished thing.";
const SIGN_IN_HEADING = "Sign in";

/** Authenticated browser journeys opt in with a disposable Playwright storage-state file. */
export function hasAuthenticatedE2EState(): boolean {
  return process.env.E2E_AUTH_STORAGE_STATE !== undefined;
}

/**
 * Wait until the product page has settled into real content — not a loading
 * skeleton, error boundary, or Next development overlay.
 */
export async function waitForProductReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: PRODUCT_HEADING,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-slot="app-loading"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/** Wait until an anonymous non-production visitor has been redirected to the sign-in surface. */
export async function waitForAnonymousHomeReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
  await expect(page.getByRole("heading", { level: 1, name: SIGN_IN_HEADING })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-slot="sign-in-panel"]')).toBeVisible();
  await expect(page.locator('[data-slot="app-loading"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Wait until the production coming-soon surface is ready (no application shell).
 */
export async function waitForComingSoonReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator('[data-slot="coming-soon-landing"]')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: COMING_SOON_HEADING,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "New Project" })).toHaveCount(0);
  await expect(page.locator('[data-slot="app-loading"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Wait until the design-system gallery has settled into real inventory content.
 */
export async function waitForGalleryReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { level: 1, name: "Design System" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "Button", exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="app-loading"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

export async function assertNoSeriousAxeViolations(page: Page): Promise<void> {
  const AxeBuilder = (await import("@axe-core/playwright")).default;
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
