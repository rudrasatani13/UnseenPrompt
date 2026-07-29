import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { AppProviders } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

describe("AppProviders", () => {
  it("renders supplied children exactly once", () => {
    render(
      <AppProviders>
        <p>workspace content</p>
      </AppProviders>,
    );

    expect(screen.getAllByText("workspace content")).toHaveLength(1);
  });

  it("makes tooltip behavior available to descendants without a local provider", async () => {
    const user = userEvent.setup();

    render(
      <AppProviders>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Copy prompt</Button>
          </TooltipTrigger>
          <TooltipContent>Copies the example prompt text</TooltipContent>
        </Tooltip>
      </AppProviders>,
    );

    await user.tab();

    expect(screen.getByRole("button", { name: "Copy prompt" })).toHaveFocus();
    await waitFor(
      () => {
        expect(screen.getAllByText("Copies the example prompt text").length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
  });

  it("mounts exactly one application toast region", () => {
    const { baseElement } = render(
      <AppProviders>
        <p>content</p>
      </AppProviders>,
    );

    const toastRegions = baseElement.querySelectorAll(
      "section[aria-live][aria-label*='otification']",
    );

    expect(toastRegions).toHaveLength(1);
    expect(toastRegions[0]).toHaveAttribute("aria-live", "polite");
  });

  it("reads no browser storage, cookie, or user identity", () => {
    const storageKeys: string[] = [];
    const originalGetItem = Storage.prototype.getItem;

    Storage.prototype.getItem = function getItem(key: string) {
      storageKeys.push(key);
      return originalGetItem.call(this, key);
    };

    try {
      render(
        <AppProviders>
          <p>content</p>
        </AppProviders>,
      );
    } finally {
      Storage.prototype.getItem = originalGetItem;
    }

    expect(storageKeys).toEqual([]);
  });

  it("has no axe violations around its children", async () => {
    const { container } = render(
      <AppProviders>
        <main>
          <h1>Workspace</h1>
          <Button>Continue</Button>
        </main>
      </AppProviders>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
