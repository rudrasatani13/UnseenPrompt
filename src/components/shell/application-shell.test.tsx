import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { productNavigation } from "@/components/shell/navigation";
import { ApplicationShell } from "@/components/shell/application-shell";

function renderShell() {
  return render(
    <ApplicationShell navigation={productNavigation}>
      <h1>Workspace</h1>
      <p>Main product content</p>
    </ApplicationShell>,
  );
}

describe("ApplicationShell", () => {
  it("places the skip link first and targets the main workspace", () => {
    renderShell();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const focusable = document.body.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );

    expect(focusable[0]).toBe(skip);
    expect(skip).toHaveAttribute("href", "#main-workspace");

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-workspace");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("exposes the required landmarks", () => {
    renderShell();

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Product" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("reuses the same navigation data for desktop and mobile surfaces", () => {
    renderShell();

    for (const label of ["New Prompt", "Profile"] as const) {
      expect(screen.getAllByRole("link", { name: label }).length).toBeGreaterThanOrEqual(1);
    }

    for (const label of ["Library", "Memories", "Search"] as const) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("names the mobile menu trigger Open navigation", () => {
    renderShell();

    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument();
  });

  it("opens the navigation sheet, traps focus, and restores on Escape", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("restores focus after the explicit close control", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close navigation" });
    await user.click(close);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not render bottom navigation", () => {
    const { container } = renderShell();

    expect(container.querySelector("[data-slot='bottom-navigation']")).toBeNull();
    expect(screen.queryByRole("navigation", { name: /bottom/i })).not.toBeInTheDocument();
  });

  it("shows the structural RECENT section with its empty state", () => {
    renderShell();

    const sections = screen.getAllByRole("region", { name: "Recent prompts" });
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Prompts you start will appear here.").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("keeps Soon entries non-interactive", () => {
    renderShell();

    for (const label of ["Library", "Memories", "Search"] as const) {
      const matches = screen.getAllByText(label);
      for (const match of matches) {
        expect(match.closest("a")).toBeNull();
      }
    }
  });

  it("has no axe violations when closed", async () => {
    const { container } = renderShell();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no axe violations when the mobile sheet is open", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog");

    expect(await axe(container)).toHaveNoViolations();
  });
});
