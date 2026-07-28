import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { RiskWarning } from "@/components/product/risk-warning";

describe("RiskWarning", () => {
  it.each(["warning", "danger"] as const)("presents the %s level with visible text", (level) => {
    render(
      <RiskWarning
        level={level}
        title="This changes production data"
        description="The change cannot be reversed from this screen."
        confirmation={null}
      />,
    );

    const alert = screen.getByRole("alert");

    expect(alert).toHaveAttribute("data-level", level);
    expect(alert).toHaveTextContent("This changes production data");
    expect(alert).toHaveTextContent("The change cannot be reversed from this screen.");
  });

  it.each(["warning", "danger"] as const)(
    "labels the %s level in text so colour is not the only signal",
    (level) => {
      render(
        <RiskWarning
          level={level}
          title="Risky change"
          description="Read this before continuing."
          confirmation={null}
        />,
      );

      const expectedLabel = level === "danger" ? "Danger" : "Warning";

      expect(screen.getByText(expectedLabel)).toBeVisible();
      expect(screen.getByRole("alert").querySelector("svg")).not.toBeNull();
    },
  );

  it("renders no acknowledgement control when confirmation is null", () => {
    render(
      <RiskWarning
        level="danger"
        title="Risky change"
        description="Read this before continuing."
        confirmation={null}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("requires an explicit trigger and confirm before invoking the callback", async () => {
    const user = userEvent.setup();
    let confirmations = 0;

    render(
      <RiskWarning
        level="danger"
        title="Delete every generated prompt"
        description="This cannot be undone."
        confirmation={{
          triggerLabel: "Delete prompts",
          confirmLabel: "Delete prompts permanently",
          cancelLabel: "Keep prompts",
          onConfirm: () => (confirmations += 1),
        }}
      />,
    );

    expect(confirmations).toBe(0);

    const trigger = screen.getByRole("button", { name: "Delete prompts" });

    await user.click(trigger);

    const dialog = await screen.findByRole("alertdialog");

    expect(confirmations).toBe(0);

    await user.click(within(dialog).getByRole("button", { name: "Delete prompts permanently" }));

    expect(confirmations).toBe(1);
  });

  it("cancels without confirming and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    let confirmations = 0;

    render(
      <RiskWarning
        level="danger"
        title="Delete every generated prompt"
        description="This cannot be undone."
        confirmation={{
          triggerLabel: "Delete prompts",
          confirmLabel: "Delete prompts permanently",
          cancelLabel: "Keep prompts",
          onConfirm: () => (confirmations += 1),
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Delete prompts" });

    await user.click(trigger);

    const dialog = await screen.findByRole("alertdialog");

    await user.click(within(dialog).getByRole("button", { name: "Keep prompts" }));

    expect(confirmations).toBe(0);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("closes on Escape without acknowledging the risk", async () => {
    const user = userEvent.setup();
    let confirmations = 0;

    render(
      <RiskWarning
        level="danger"
        title="Delete every generated prompt"
        description="This cannot be undone."
        confirmation={{
          triggerLabel: "Delete prompts",
          confirmLabel: "Delete prompts permanently",
          cancelLabel: "Keep prompts",
          onConfirm: () => (confirmations += 1),
        }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Delete prompts" });

    await user.click(trigger);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(confirmations).toBe(0);
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("uses the destructive button treatment for a danger confirmation", async () => {
    const user = userEvent.setup();

    render(
      <RiskWarning
        level="danger"
        title="Delete every generated prompt"
        description="This cannot be undone."
        confirmation={{
          triggerLabel: "Delete prompts",
          confirmLabel: "Delete prompts permanently",
          cancelLabel: "Keep prompts",
          onConfirm: () => {},
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete prompts" }));

    const dialog = await screen.findByRole("alertdialog");

    expect(
      within(dialog).getByRole("button", { name: "Delete prompts permanently" }),
    ).toHaveAttribute("data-variant", "destructive");
  });

  it.each(["warning", "danger"] as const)("has no axe violations at %s level", async (level) => {
    const { container } = render(
      <main>
        <h1>Risk</h1>
        <RiskWarning
          level={level}
          title="Risky change"
          description="Read this before continuing."
          confirmation={{
            triggerLabel: "Acknowledge",
            confirmLabel: "Yes, continue",
            cancelLabel: "No, go back",
            onConfirm: () => {},
          }}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
