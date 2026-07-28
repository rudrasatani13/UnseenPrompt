import { expect, test } from "@playwright/test";

test.describe("maintenance mode @maintenance", () => {
  test("shows maintenance on the product surface and keeps health ready", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "UnseenPrompt is temporarily unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Turn project context into an agent-ready prompt" }),
    ).toHaveCount(0);

    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const body = await health.json();
    expect(body).toMatchObject({ status: "ok" });

    const gallery = await page.goto("/design-system");
    expect(gallery?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Design System" })).toBeVisible();
  });
});
