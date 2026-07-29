import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { ConfirmationCard } from "@/components/product/confirmation-card";

const details = [
  "Creates one project record",
  "Stores nothing outside this preview",
  "Runs no coding agent",
] as const;

function noop() {}

describe("ConfirmationCard", () => {
  it("shows the title, summary, and every detail", () => {
    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next before continuing."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={noop}
      />,
    );

    expect(screen.getByText("Confirm the project scope")).toBeVisible();
    expect(screen.getByText("Review what happens next before continuing.")).toBeVisible();

    for (const detail of details) {
      expect(screen.getByText(detail)).toBeVisible();
    }
  });

  it("renders details as a semantic list", () => {
    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={noop}
      />,
    );

    const list = screen.getByRole("list");

    expect(within(list).getAllByRole("listitem")).toHaveLength(details.length);
  });

  it("invokes confirm exactly once", async () => {
    const user = userEvent.setup();
    let confirmations = 0;

    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={() => (confirmations += 1)}
        onReject={noop}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm scope" }));

    expect(confirmations).toBe(1);
  });

  it("invokes reject exactly once", async () => {
    const user = userEvent.setup();
    let rejections = 0;

    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={() => (rejections += 1)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Change scope" }));

    expect(rejections).toBe(1);
  });

  it("disables both controls and announces busy state while working", async () => {
    const user = userEvent.setup();
    let activations = 0;

    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy
        onConfirm={() => (activations += 1)}
        onReject={() => (activations += 1)}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Confirm scope" });
    const reject = screen.getByRole("button", { name: "Change scope" });

    expect(confirm).toBeDisabled();
    expect(reject).toBeDisabled();
    expect(confirm).toHaveAttribute("aria-busy", "true");

    await user.click(confirm);
    await user.click(reject);

    expect(activations).toBe(0);
  });

  it("keeps its labels, and therefore its button dimensions, while busy", () => {
    const { rerender } = render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={noop}
      />,
    );

    const idleConfirmClasses = screen.getByRole("button", { name: "Confirm scope" }).className;

    rerender(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy
        onConfirm={noop}
        onReject={noop}
      />,
    );

    const busyConfirm = screen.getByRole("button", { name: "Confirm scope" });

    expect(busyConfirm).toHaveTextContent("Confirm scope");
    expect(busyConfirm.className).toBe(idleConfirmClasses);
  });

  it("renders no list when there are no details", () => {
    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={[]}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={noop}
      />,
    );

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("does not make rejection look destructive", () => {
    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary="Review what happens next."
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={noop}
      />,
    );

    const reject = screen.getByRole("button", { name: "Change scope" });
    const confirm = screen.getByRole("button", { name: "Confirm scope" });

    expect(reject).not.toHaveAttribute("data-variant", "destructive");
    expect(reject.getAttribute("data-variant")).not.toBe(confirm.getAttribute("data-variant"));
  });

  it("wraps long content", () => {
    const longSummary =
      "This confirmation explains, at length, that nothing is generated, stored, transmitted, or executed while the product preview is the only available surface.";

    render(
      <ConfirmationCard
        title="Confirm the project scope"
        summary={longSummary}
        details={details}
        confirmLabel="Confirm scope"
        rejectLabel="Change scope"
        busy={false}
        onConfirm={noop}
        onReject={noop}
      />,
    );

    expect(screen.getByText(longSummary).className).not.toMatch(/truncate|line-clamp/);
  });

  it.each([false, true])("has no axe violations when busy is %s", async (busy) => {
    const { container } = render(
      <main>
        <h1>Confirmation</h1>
        <ConfirmationCard
          title="Confirm the project scope"
          summary="Review what happens next."
          details={details}
          confirmLabel="Confirm scope"
          rejectLabel="Change scope"
          busy={busy}
          onConfirm={noop}
          onReject={noop}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
