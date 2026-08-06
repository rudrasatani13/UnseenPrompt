import { expect, test, type Request } from "@playwright/test";

import { waitForAnonymousHomeReady } from "./helpers";

test.describe("homepage anonymous guard", () => {
  test("redirects signed-out visitors to sign in without product mutations", async ({ page }) => {
    const mutating: Request[] = [];
    page.on("request", (request) => {
      const method = request.method().toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        mutating.push(request);
      }
    });

    await page.goto("/");
    await waitForAnonymousHomeReady(page);

    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Prompt" })).toHaveCount(0);
    await expect(page.getByRole("navigation")).toHaveCount(0);

    expect(mutating).toEqual([]);
  });
});
