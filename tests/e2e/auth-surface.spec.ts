import { expect, test } from "@playwright/test";

import { assertNoSeriousAxeViolations } from "./helpers";

/*
 * These are surface guards only. Full email/OAuth journeys need a live Supabase Auth stack and
 * remain Phase 17 end-to-end coverage; this suite intentionally runs without one.
 */
test.describe("authentication surface", () => {
  test("unauthenticated protected pages redirect to the sign-in page with their safe next path", async ({
    page,
  }) => {
    for (const [path, next] of [
      ["/profile", "%2Fprofile"],
      ["/onboarding", "%2Fonboarding"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${next}$`));
    }
  });

  test("sign-in exposes both methods accessibly and supports keyboard traversal", async ({
    page,
  }) => {
    const response = await page.goto("/sign-in");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

    const google = page.getByRole("button", { name: "Continue with Google" });
    const email = page.getByRole("textbox", { name: "Email address" });
    const magicLink = page.getByRole("button", { name: "Email me a sign-in link" });

    await expect(google).toBeVisible();
    await expect(email).toBeVisible();
    await expect(magicLink).toBeVisible();

    await google.focus();
    await page.keyboard.press("Tab");
    await expect(email).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(magicLink).toBeFocused();

    await assertNoSeriousAxeViolations(page);
  });
});
