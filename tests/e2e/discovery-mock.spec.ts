import { expect, test } from "@playwright/test";

import activeSnapshot from "../fixtures/discovery/e2e/resume-active-snapshot.json";
import { PHASE7_MOCK_PROJECT_ID } from "./phase7-fixtures";

const enabled = process.env.E2E_PHASE7_MOCK === "on";
const RESUME_EVENT_ID = "88888888-8888-4888-8888-888888888888";

/**
 * Deterministic browser coverage for the resume invariant. The page is authenticated against a
 * disposable local Supabase fixture; only the browser-facing discovery responses are mocked, so
 * this test never reaches a model provider and never carries a persistent credential.
 */
test("resume renders the saved question and never sends advance_discovery", async ({ page }) => {
  test.skip(!enabled, "requires the isolated local Phase 7 E2E fixture");

  const commandTypes: string[] = [];
  await page.route(
    `**/api/projects/${PHASE7_MOCK_PROJECT_ID}/discovery/commands`,
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
        return;
      }

      const body = route.request().postDataJSON() as {
        readonly command?: { readonly type?: unknown };
      };
      const type = body.command?.type;
      if (typeof type === "string") commandTypes.push(type);

      if (type !== "resume_discovery") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "validation_failed" } }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: PHASE7_MOCK_PROJECT_ID,
          stateVersion: 2,
          eventId: RESUME_EVENT_ID,
          replayed: false,
        }),
      });
    },
  );
  await page.route(`**/api/projects/${PHASE7_MOCK_PROJECT_ID}/discovery`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, contentType: "application/json", body: "{}" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(activeSnapshot),
    });
  });

  await page.goto(`/projects/${PHASE7_MOCK_PROJECT_ID}/discovery`);
  const resumeButton = page.getByRole("button", { name: "Resume discovery" });
  await expect(resumeButton).toBeVisible();
  await resumeButton.click();

  await expect.poll(() => commandTypes).toEqual(["resume_discovery"]);
  await expect(page.locator('[data-slot="discovery-question"]')).toBeVisible();
  await expect(page.getByText(activeSnapshot.activeQuestion.questionText)).toBeVisible();
  expect(commandTypes.filter((type) => type === "advance_discovery")).toHaveLength(0);
});
