import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type { ProjectMode } from "@/domain/project/contracts";

import { IntentConfirmation, MODE_OPTIONS, type ComposerIntent } from "./intent-confirmation";

const intent: ComposerIntent = {
  mode: "new_build",
  confidence: 0.93,
  rationale: "The request describes a new product build.",
  detectedLanguage: "en",
};

function ControlledConfirmation() {
  const [selectedMode, setSelectedMode] = useState<ProjectMode>(intent.mode);
  const [title, setTitle] = useState("Field notebook");

  return (
    <IntentConfirmation
      intent={intent}
      title={title}
      selectedMode={selectedMode}
      pending={false}
      error={null}
      onTitleChange={setTitle}
      onModeChange={setSelectedMode}
      onConfirm={vi.fn()}
      onEditRequest={vi.fn()}
      onRetry={vi.fn()}
    />
  );
}

describe("IntentConfirmation", () => {
  it("offers all seven correction modes and keeps title editing controlled", async () => {
    const user = userEvent.setup();
    render(<ControlledConfirmation />);

    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByText(/Supporting signal:/)).toHaveTextContent("93% confidence");
    expect(screen.getByText(/Supporting signal:/)).toHaveTextContent("language detected as");

    await user.click(screen.getByRole("radio", { name: "Bug" }));
    expect(screen.getByRole("radio", { name: "Bug" })).toBeChecked();

    const title = screen.getByRole("textbox", { name: "Project title" });
    await user.clear(title);
    await user.type(title, "Offline field notes");
    expect(title).toHaveValue("Offline field notes");
  });

  it("disables confirmation for an empty title and exposes safe retry controls", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <IntentConfirmation
        intent={intent}
        title=""
        selectedMode="new_build"
        pending={false}
        error="The intent check is unavailable right now."
        onTitleChange={vi.fn()}
        onModeChange={vi.fn()}
        onConfirm={vi.fn()}
        onEditRequest={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm and continue" })).toBeDisabled();
    expect(screen.getByText("The intent check is unavailable right now.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ControlledConfirmation />);
    expect(await axe(container)).toHaveNoViolations();
    expect(MODE_OPTIONS).toHaveLength(7);
  });
});
