import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RemovalPanel } from "@/features/waitlist/removal-panel";

describe("RemovalPanel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/waitlist/remove#token=opaque-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ kind: "removed" }, { status: 200 })) as typeof fetch,
    );
  });

  it("requires an explicit removal action", async () => {
    const user = userEvent.setup();
    render(<RemovalPanel />);

    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Remove my email" }));

    await waitFor(() => {
      expect(screen.getByText("Your email has been removed.")).toBeInTheDocument();
    });
  });

  it("describes a temporary removal failure accurately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ kind: "temporary_error" }, { status: 503 }),
      ) as typeof fetch,
    );
    const user = userEvent.setup();
    render(<RemovalPanel />);

    await user.click(screen.getByRole("button", { name: "Remove my email" }));

    expect(
      await screen.findByText("We couldn’t remove your email. Try again in a minute."),
    ).toBeInTheDocument();
  });
});
