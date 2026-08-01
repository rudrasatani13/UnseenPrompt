import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DeletionRequestCard } from "@/features/account/deletion-request-card";

const REQUESTED_AT = "2026-08-01T10:00:00.000Z";

describe("DeletionRequestCard", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ deletionRequestedAt: REQUESTED_AT }, { status: 200 }),
      ) as typeof fetch,
    );
  });

  it("states that this is a request and no data is deleted in this phase", async () => {
    const { container } = render(<DeletionRequestCard deletionRequestedAt={null} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Request account deletion");
    expect(alert).toHaveTextContent("Submitting this request does not delete any data");
    expect(alert).toHaveTextContent("A later operational phase will perform the removal");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("requires explicit dialog confirmation before submitting", async () => {
    const user = userEvent.setup();
    render(<DeletionRequestCard deletionRequestedAt={null} />);

    await user.click(screen.getByRole("button", { name: "Request account deletion" }));
    expect(fetch).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog", { name: "Request account deletion" });
    await user.click(within(dialog).getByRole("button", { name: "Submit deletion request" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/account/deletion-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    });
    expect(await screen.findByText(/Deletion request pending/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows an existing request and can cancel it without deleting data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ deletionRequestedAt: null }, { status: 200 }),
      ) as typeof fetch,
    );
    const user = userEvent.setup();
    render(<DeletionRequestCard deletionRequestedAt={REQUESTED_AT} />);

    expect(screen.getByText(/Deletion request pending/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel deletion request" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/account/deletion-request", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    });
    expect(await screen.findByText("No deletion request is pending.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps the current state and exposes a retryable error when the provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "provider_error" } }, { status: 502 }),
      ) as typeof fetch,
    );
    const user = userEvent.setup();
    render(<DeletionRequestCard deletionRequestedAt={REQUESTED_AT} />);

    await user.click(screen.getByRole("button", { name: "Cancel deletion request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t update the deletion request. Try again.",
    );
    expect(screen.getByText(/Deletion request pending/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
