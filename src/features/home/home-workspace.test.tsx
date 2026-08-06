import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { HomeWorkspace } from "./home-workspace";

interface CapturedComposerProps {
  readonly prefill: { readonly token: number; readonly value: string } | null;
  readonly onHomeStateChange: (inHomeView: boolean) => void;
}

const composerProps = vi.hoisted<{ current: CapturedComposerProps | null }>(() => ({
  current: null,
}));

vi.mock("@/features/discovery/home-composer", () => ({
  HomeComposer: (props: CapturedComposerProps) => {
    composerProps.current = props;
    return <div data-testid="home-composer-stub" />;
  },
}));

describe("HomeWorkspace", () => {
  beforeEach(() => {
    composerProps.current = null;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders the hero, composer, mode toggle, and Discover grid", async () => {
    const { container } = render(<HomeWorkspace />);

    expect(
      screen.getByRole("heading", { name: "Turn lazy prompts into great ones" }),
    ).toBeVisible();
    expect(screen.getByTestId("home-composer-stub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prompt" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Template" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Discover" })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("prefills the composer when a Discover card is selected", async () => {
    const user = userEvent.setup();
    render(<HomeWorkspace />);

    await user.click(screen.getByRole("button", { name: /Distill meeting notes/ }));

    expect(composerProps.current?.prefill?.value).toBe(
      "Turn my messy meeting notes into a clear summary with decisions, owners, and next steps.",
    );
  });

  it("steps the hero and Discover aside once the composer leaves the home form", () => {
    render(<HomeWorkspace />);

    act(() => {
      composerProps.current?.onHomeStateChange(false);
    });

    expect(
      screen.queryByRole("heading", { name: "Turn lazy prompts into great ones" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Discover" })).not.toBeInTheDocument();
  });
});
