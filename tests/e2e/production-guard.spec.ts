import { expect, test } from "@playwright/test";

import { waitForComingSoonReady } from "./helpers";

test.describe("production guard @production", () => {
  test("hides the design-system gallery and keeps the coming-soon homepage", async ({ page }) => {
    const gallery = await page.goto("/design-system");

    expect(gallery?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design System" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Button" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "PromptPanel" })).toHaveCount(0);

    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    await waitForComingSoonReady(page);

    const html = await page.content();
    expect(html).not.toContain("MAINTENANCE_MODE");
    expect(html).not.toContain("RELEASE_SHA");
    expect(html).not.toContain('"APP_ENV"');
    expect(html).not.toContain("TURNSTILE_SECRET_KEY");
    expect(html).not.toContain("SUPABASE_SECRET_KEY");
  });
});
