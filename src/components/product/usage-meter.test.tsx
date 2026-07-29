import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { UsageMeter } from "@/components/product/usage-meter";

describe("UsageMeter", () => {
  it("shows the used, remaining, limit, and unit values", () => {
    render(<UsageMeter label="Prompt allowance" used={3} limit={10} unit="prompts" />);

    expect(screen.getByText("Prompt allowance")).toBeVisible();
    expect(screen.getByText("3 of 10 prompts used")).toBeVisible();
    expect(screen.getByText("7 prompts remaining")).toBeVisible();
  });

  it("exposes exact progress semantics", () => {
    render(<UsageMeter label="Prompt allowance" used={3} limit={10} unit="prompts" />);

    const meter = screen.getByRole("progressbar", { name: "Prompt allowance" });

    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuenow", "3");
    expect(meter).toHaveAttribute("aria-valuemax", "10");
  });

  it("handles an unused allowance", () => {
    render(<UsageMeter label="Prompt allowance" used={0} limit={10} unit="prompts" />);

    expect(screen.getByText("0 of 10 prompts used")).toBeVisible();
    expect(screen.getByText("10 prompts remaining")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("handles a fully consumed allowance", () => {
    render(<UsageMeter label="Prompt allowance" used={10} limit={10} unit="prompts" />);

    expect(screen.getByText("10 of 10 prompts used")).toBeVisible();
    expect(screen.getByText("0 prompts remaining")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  });

  it("accepts finite fractional domain values", () => {
    render(<UsageMeter label="Prompt allowance" used={1.5} limit={10} unit="prompts" />);

    expect(screen.getByText("1.5 of 10 prompts used")).toBeVisible();
    expect(screen.getByText("8.5 prompts remaining")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1.5");
  });

  it.each([
    { used: 11, limit: 10 },
    { used: -1, limit: 10 },
    { used: 1, limit: 0 },
    { used: 1, limit: -5 },
    { used: Number.NaN, limit: 10 },
    { used: Number.POSITIVE_INFINITY, limit: 10 },
    { used: 1, limit: Number.POSITIVE_INFINITY },
  ])("rejects the invalid domain %o with a RangeError", ({ used, limit }) => {
    expect(() =>
      render(<UsageMeter label="Prompt allowance" used={used} limit={limit} unit="prompts" />),
    ).toThrow(RangeError);
  });

  it("names the component and the invalid values in its error", () => {
    expect(() =>
      render(<UsageMeter label="Prompt allowance" used={11} limit={10} unit="prompts" />),
    ).toThrow(/UsageMeter.*11.*10/s);
  });

  it("never silently clamps an out-of-range value", () => {
    expect(() =>
      render(<UsageMeter label="Prompt allowance" used={99} limit={10} unit="prompts" />),
    ).toThrow(RangeError);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Usage</h1>
        <UsageMeter label="Prompt allowance" used={3} limit={10} unit="prompts" />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
