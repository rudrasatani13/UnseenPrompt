import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmationPanel } from "@/features/waitlist/confirmation-panel";

describe("ConfirmationPanel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/waitlist/confirm#token=opaque-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ kind: "confirmed" }, { status: 200 })) as typeof fetch,
    );
  });

  it("does not mutate on load and requires an explicit button press", async () => {
    const user = userEvent.setup();
    render(<ConfirmationPanel />);

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Confirm your email");

    await user.click(screen.getByRole("button", { name: "Confirm my email" }));

    await waitFor(() => {
      expect(screen.getByText("You’re on the list.")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("");
  });
});
