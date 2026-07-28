import { expect, test } from "@playwright/test";

test.describe("production guard @production", () => {
  test("hides the design-system gallery and keeps the homepage", async ({ page }) => {
    const gallery = await page.goto("/design-system");
    /*
     * App Router notFound() renders the not-found UI. Next.js 16 dev may report
     * HTTP 200 for that document while production builds emit 404. Accept either
     * status when the gallery inventory is absent and the not-found page is shown.
     */
    expect([200, 404]).toContain(gallery?.status());
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design System" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Button" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "PromptPanel" })).toHaveCount(0);

    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Turn project context into an agent-ready prompt",
      }),
    ).toBeVisible();

    const html = await page.content();
    expect(html).not.toContain("MAINTENANCE_MODE");
    expect(html).not.toContain("RELEASE_SHA");
    expect(html).not.toContain('"APP_ENV"');
  });
});
