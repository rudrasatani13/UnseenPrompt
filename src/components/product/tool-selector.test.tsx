import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { codingTools, ToolSelector, type CodingTool } from "@/components/product/tool-selector";

function ControlledToolSelector({ initial = "claude-code" as CodingTool }) {
  const [value, setValue] = useState<CodingTool>(initial);

  return <ToolSelector value={value} onValueChange={setValue} />;
}

describe("ToolSelector", () => {
  it("offers exactly the three approved tools with their exact labels", () => {
    render(<ControlledToolSelector />);

    const radios = screen.getAllByRole("radio");

    expect(radios).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /Claude Code/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /OpenAI Codex/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Cursor/ })).toBeInTheDocument();
  });

  it("exposes the canonical option tuple", () => {
    expect(codingTools.map((tool) => tool.value)).toEqual(["claude-code", "codex", "cursor"]);
    expect(codingTools.map((tool) => tool.label)).toEqual([
      "Claude Code",
      "OpenAI Codex",
      "Cursor",
    ]);
  });

  it("reflects the controlled value", () => {
    render(<ToolSelector value="codex" onValueChange={() => {}} />);

    expect(screen.getByRole("radio", { name: /OpenAI Codex/ })).toBeChecked();
  });

  it("reports a selection without changing it on its own", async () => {
    const user = userEvent.setup();
    const seen: CodingTool[] = [];

    render(<ToolSelector value="claude-code" onValueChange={(next) => seen.push(next)} />);

    await user.click(screen.getByRole("radio", { name: /Cursor/ }));

    expect(seen).toEqual(["cursor"]);
    expect(screen.getByRole("radio", { name: /Claude Code/ })).toBeChecked();
  });

  it("supports arrow-key navigation", async () => {
    const user = userEvent.setup();

    render(<ControlledToolSelector />);
    screen.getByRole("radio", { name: /Claude Code/ }).focus();

    await user.keyboard("{ArrowDown>}");

    expect(screen.getByRole("radio", { name: /OpenAI Codex/ })).toBeChecked();

    await user.keyboard("{/ArrowDown}");
  });

  it("describes each tool without claiming an unverified capability", () => {
    render(<ControlledToolSelector />);

    for (const tool of codingTools) {
      expect(screen.getByText(tool.description)).toBeVisible();
    }

    const forbiddenClaims = /\b(connected|installed|authorized|linked|running|available now)\b/i;

    for (const tool of codingTools) {
      expect(tool.description).not.toMatch(forbiddenClaims);
    }
  });

  it("adds no vendor logo, outbound link, or availability check", () => {
    const { container } = render(<ControlledToolSelector />);

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Tools</h1>
        <ControlledToolSelector />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
