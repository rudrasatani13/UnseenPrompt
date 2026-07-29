import { expect, test } from "@playwright/test";

import { assertNoSeriousAxeViolations, waitForComingSoonReady } from "./helpers";

test.describe("production coming soon @production", () => {
  test.beforeEach(async ({ page }) => {
    // Deterministic Managed Turnstile: no network call to Cloudflare.
    await page.addInitScript(() => {
      let callback: ((token: string) => void) | null = null;
      (
        window as unknown as {
          turnstile: {
            render: (
              _container: HTMLElement,
              options: {
                callback: (token: string) => void;
              },
            ) => string;
            execute: () => void;
            reset: () => void;
            remove: () => void;
          };
        }
      ).turnstile = {
        render: (_container, options) => {
          callback = options.callback;
          return "widget-id";
        },
        execute: () => {
          callback?.("test-turnstile-token");
        },
        reset: () => undefined,
        remove: () => undefined,
      };
    });

    await page.route("**/api/waitlist/request", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({ status: 405, body: "method not allowed" });
        return;
      }
      const body = route.request().postDataJSON() as { email?: string };
      if (!body.email?.includes("@")) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ kind: "invalid_email" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ kind: "accepted" }),
      });
    });

    await page.route("**/api/waitlist/confirm", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ kind: "confirmed" }),
      });
    });

    await page.route("**/api/waitlist/remove", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ kind: "removed" }),
      });
    });
  });

  test("serves the white-canvas landing without shell chrome", async ({ page }) => {
    await page.goto("/");
    await waitForComingSoonReady(page);

    await expect(page.getByText("UnseenPrompt is being built")).toBeVisible();
    await expect(page.getByText("Work in progress")).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep me posted" })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "New Project" })).toHaveCount(0);
    await assertNoSeriousAxeViolations(page);
  });

  test("accepts a waitlist submission through the intercepted API", async ({ page }) => {
    await page.goto("/");
    await waitForComingSoonReady(page);

    await page.getByLabel("Email address").fill("person@example.com");
    await page.getByRole("button", { name: "Keep me posted" }).click();

    await expect(
      page.getByText("Check your inbox. We sent a confirmation email."),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("requires explicit confirmation action", async ({ page }) => {
    await page.goto("/waitlist/confirm#token=opaque-token");
    await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm my email" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm my email" }).click();
    await expect(page.getByText("You’re on the list.")).toBeVisible();
  });

  test("requires explicit removal action", async ({ page }) => {
    await page.goto("/waitlist/remove#token=opaque-token");
    await expect(page.getByRole("heading", { name: "Remove your email" })).toBeVisible();
    await page.getByRole("button", { name: "Remove my email" }).click();
    await expect(page.getByText("Your email has been removed.")).toBeVisible();
  });

  test("returns an exact production design-system 404", async ({ page }) => {
    const response = await page.goto("/design-system");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Design System" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
