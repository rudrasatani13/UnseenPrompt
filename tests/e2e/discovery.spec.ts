import { expect, test } from "@playwright/test";

import newBuildFixture from "../fixtures/discovery/new-build-beginner.json";
import { hasAuthenticatedE2EState, waitForProductReady } from "./helpers";

const enabled = process.env.E2E_PHASE7 === "on" && hasAuthenticatedE2EState();
const projectId = process.env.E2E_PHASE7_PROJECT_ID;

/**
 * These full journeys require an isolated authenticated browser state and seeded Phase 7 data.
 * They stay skipped for ordinary local UI runs and the regular CI quality job; an operator may
 * enable them with E2E_PHASE7=on and a disposable project ID. The CI phase7-browser job covers the
 * resume invariant through the isolated, network-mocked discovery-mock.spec.ts gate instead. No
 * provider credentials or user content are embedded in either test.
 */
test.describe("Phase 7 discovery journeys", () => {
  test.beforeEach(async ({}, testInfo) => {
    testInfo.skip(!enabled || !projectId, "requires isolated authenticated Phase 7 E2E state");
  });

  test("composer confirms intent before promotion", async ({ page }) => {
    await page.goto("/");
    await waitForProductReady(page);
    const composer = page.getByRole("textbox", { name: /idea|request|work on/i });
    await composer.fill(newBuildFixture.initialRequestText);
    await page.getByRole("button", { name: /submit|continue|generate/i }).click();
    await expect(page.getByRole("heading", { name: /right kind of work/i })).toBeVisible();
    await expect(page.getByText(/starting point, not a decision/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm and continue/i })).toBeVisible();
  });

  test("resume renders the active question without an advance_discovery command", async ({
    page,
  }) => {
    let advanceCalls = 0;
    let resumeCalls = 0;
    await page.route(`**/api/projects/${projectId}/discovery/commands`, async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as {
          readonly command?: { readonly type?: unknown };
        };
        if (body.command?.type === "advance_discovery") advanceCalls += 1;
        if (body.command?.type === "resume_discovery") resumeCalls += 1;
      }
      await route.continue();
    });
    await page.goto(`/projects/${projectId}/discovery`);
    await expect(page.getByRole("button", { name: "Resume workspace" })).toBeVisible();
    await page.getByRole("button", { name: "Resume workspace" }).click();
    await expect.poll(() => resumeCalls).toBe(1);
    expect(advanceCalls).toBe(0);
    await expect(page.locator('[data-slot="discovery-thread"]')).toBeVisible();
  });

  test("clarification stays inline in the thread before anything is sent", async ({ page }) => {
    await page.goto(`/projects/${projectId}/discovery`);
    await expect(page.locator('[data-slot="discovery-thread"]')).toBeVisible();
    await expect(page.locator('[data-slot="discovery-progress"]')).toBeVisible();

    // The open question answers inline: a suggestion chip or explicit text is
    // required before the send control becomes usable.
    const activeInput = page.getByLabel("Your answer");
    if (await activeInput.isVisible()) {
      await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
      await activeInput.fill("A concrete answer");
      await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
      await page.getByRole("button", { name: "Send" }).click();
    }
    await expect(page.locator('[data-slot="discovery-question-card"]').first()).toBeVisible();
  });
});
