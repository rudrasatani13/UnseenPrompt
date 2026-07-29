import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { MaintenanceNotice } from "@/components/shell/maintenance-notice";

describe("MaintenanceNotice", () => {
  it("renders the exact maintenance heading", () => {
    render(<MaintenanceNotice />);

    expect(
      screen.getByRole("heading", { name: "UnseenPrompt is temporarily unavailable" }),
    ).toBeInTheDocument();
  });

  it("offers concise retry-later guidance without a fake estimate", () => {
    render(<MaintenanceNotice />);

    expect(screen.getByText(/try again later/i)).toBeVisible();
    expect(screen.queryByText(/%|minutes? remaining|eta/i)).not.toBeInTheDocument();
  });

  it("does not expose mutation controls or automatic refresh", () => {
    const { container } = render(<MaintenanceNotice />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("meta[http-equiv='refresh']")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <MaintenanceNotice />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
