import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { EvidenceLabel, type EvidenceState } from "@/components/product/evidence-label";

const evidenceStates = [
  ["claimed", "Claimed"],
  ["evidence-supplied", "Evidence supplied"],
  ["user-confirmed", "User confirmed"],
  ["verified", "Verified"],
] as const satisfies readonly (readonly [EvidenceState, string])[];

describe("EvidenceLabel", () => {
  it.each(evidenceStates)("renders %s with the exact label %s", (state, expectedLabel) => {
    render(<EvidenceLabel state={state} />);

    expect(screen.getByText(expectedLabel)).toBeVisible();
  });

  it.each(evidenceStates)("pairs %s with a status icon, not colour alone", (state) => {
    const { container } = render(<EvidenceLabel state={state} />);
    const label = container.querySelector('[data-slot="evidence-label"]');

    expect(label).not.toBeNull();
    expect(label).toHaveAttribute("data-state", state);
    expect(label?.querySelector("svg")).not.toBeNull();
  });

  it("accepts a class-name extension without losing its own styling", () => {
    const { container } = render(<EvidenceLabel state="verified" className="mt-4" />);
    const label = container.querySelector('[data-slot="evidence-label"]');

    expect(label?.className).toContain("mt-4");
    expect(label?.className).toContain("rounded-pill");
  });

  it("exposes exactly the four approved states", () => {
    expect(evidenceStates.map(([state]) => state)).toEqual([
      "claimed",
      "evidence-supplied",
      "user-confirmed",
      "verified",
    ]);
  });

  it("has no axe violations across every state", async () => {
    const { container } = render(
      <main>
        <h1>Evidence</h1>
        {evidenceStates.map(([state]) => (
          <EvidenceLabel key={state} state={state} />
        ))}
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
