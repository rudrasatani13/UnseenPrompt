import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import HomePage from "@/app/(product)/page";

const EXAMPLE_PROMPT =
  "Create an accessible project setup flow for a personal web application, including explicit confirmation before any high-risk change.";

describe("product preview homepage", () => {
  it("renders the exact preview contract copy", () => {
    render(<HomePage />);

    expect(screen.getByText("Project planning preview")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Keep project decisions together",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeVisible();
    expect(
      screen.getByText("Prompt generation becomes interactive in a later phase."),
    ).toBeVisible();
    expect(screen.getByText("Example project request")).toBeVisible();
    expect(screen.getByText(EXAMPLE_PROMPT)).toBeVisible();
  });

  it("exposes exactly one level-one heading", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("contains no editable controls or form submission surfaces", () => {
    const { container } = render(<HomePage />);

    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(container.querySelector("[contenteditable='true']")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(screen.queryByRole("button", { name: /submit|generate|send/i })).not.toBeInTheDocument();
  });

  it("does not call network, storage, or clipboard APIs from source", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/(product)/page.tsx"), "utf8");

    expect(source).not.toMatch(
      /fetch\(|localStorage|sessionStorage|navigator\.clipboard|server action|analytics/i,
    );
  });

  it("states plainly that content is example preview material", () => {
    render(<HomePage />);

    expect(screen.getByText("Preview")).toBeVisible();
    expect(screen.getByText(/example project request/i)).toBeVisible();
    expect(
      screen.getByText("Prompt generation becomes interactive in a later phase."),
    ).toBeVisible();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <HomePage />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
