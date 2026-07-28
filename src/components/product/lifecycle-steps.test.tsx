import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { LifecycleSteps, type LifecycleStep } from "@/components/product/lifecycle-steps";

const steps = [
  {
    id: "context",
    label: "Describe the project",
    description: "Explain the outcome you want.",
    state: "complete",
  },
  {
    id: "clarify",
    label: "Answer clarifying questions",
    description: "Confirm assumptions before generation.",
    state: "current",
  },
  {
    id: "prompt",
    label: "Review the generated prompt",
    description: null,
    state: "pending",
  },
  {
    id: "handoff",
    label: "Hand off to a coding tool",
    description: "Blocked until the prompt is confirmed.",
    state: "blocked",
  },
] as const satisfies readonly LifecycleStep[];

describe("LifecycleSteps", () => {
  it("renders an ordered list with the caller-supplied accessible label", () => {
    render(<LifecycleSteps steps={steps} label="Project lifecycle" />);

    const list = screen.getByRole("list", { name: "Project lifecycle" });

    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows visible state text for every step", () => {
    render(<LifecycleSteps steps={steps} label="Project lifecycle" />);

    expect(screen.getByText("Complete")).toBeVisible();
    expect(screen.getByText("Current step")).toBeVisible();
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.getByText("Blocked")).toBeVisible();
  });

  it("marks only the current step with aria-current", () => {
    render(<LifecycleSteps steps={steps} label="Project lifecycle" />);

    const current = screen
      .getAllByRole("listitem")
      .filter((item) => item.getAttribute("aria-current") === "step");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Answer clarifying questions");
  });

  it("signals a blocked step with an icon and text rather than colour alone", () => {
    render(<LifecycleSteps steps={steps} label="Project lifecycle" />);

    const blocked = screen
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("data-state") === "blocked");

    expect(blocked).toBeDefined();
    expect(blocked).toHaveTextContent("Blocked");
    expect(blocked?.querySelector("svg")).not.toBeNull();
  });

  it("renders every supplied label and non-null description", () => {
    render(<LifecycleSteps steps={steps} label="Project lifecycle" />);

    for (const step of steps) {
      expect(screen.getByText(step.label)).toBeInTheDocument();

      if (step.description !== null) {
        expect(screen.getByText(step.description)).toBeInTheDocument();
      }
    }

    expect(screen.getByText("Review the generated prompt")).toBeInTheDocument();
  });

  it("wraps long labels instead of truncating them", () => {
    const longLabel =
      "Describe the project context, the constraints that matter, and the outcome you expect from the coding tool";

    render(
      <LifecycleSteps
        steps={[{ id: "long", label: longLabel, description: null, state: "current" }]}
        label="Project lifecycle"
      />,
    );

    const label = screen.getByText(longLabel);

    expect(label.className).not.toMatch(/truncate|line-clamp|whitespace-nowrap/);
    expect(label.className).not.toMatch(/\bw-\d/);
  });

  it("renders a labelled empty list rather than inventing progress", () => {
    render(<LifecycleSteps steps={[]} label="Project lifecycle" />);

    const list = screen.getByRole("list", { name: "Project lifecycle" });

    expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    expect(screen.queryByText("Current step")).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Lifecycle</h1>
        <LifecycleSteps steps={steps} label="Project lifecycle" />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
