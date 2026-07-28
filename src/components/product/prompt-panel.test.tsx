import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { PromptPanel } from "@/components/product/prompt-panel";

const prompt =
  "Create an accessible project setup flow for a personal web application, including explicit confirmation before any high-risk change.";

const acceptanceCriteria = [
  "Every control is reachable by keyboard",
  "No destructive action runs without explicit confirmation",
] as const;

const COPY_FAILURE_TEXT = "Copy failed. Select the prompt text and copy it manually.";

describe("PromptPanel", () => {
  it("shows exactly one selectable prompt", () => {
    render(
      <PromptPanel
        prompt={prompt}
        metadata="Formatted for Claude Code"
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
      />,
    );

    const matches = screen.getAllByText(prompt);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.className).not.toMatch(/truncate|line-clamp/);
  });

  it("renders optional metadata when supplied", () => {
    render(
      <PromptPanel
        prompt={prompt}
        metadata="Formatted for Claude Code"
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
      />,
    );

    expect(screen.getByText("Formatted for Claude Code")).toBeVisible();
  });

  it("omits metadata when it is null", () => {
    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
      />,
    );

    expect(screen.queryByText("Formatted for Claude Code")).not.toBeInTheDocument();
  });

  it("shows the expected result under its own heading", () => {
    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
      />,
    );

    expect(screen.getByRole("heading", { name: "Expected result" })).toBeInTheDocument();
    expect(screen.getByText("A reviewed project setup plan.")).toBeVisible();
  });

  it("renders acceptance criteria as a semantic list", () => {
    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
      />,
    );

    const list = screen.getByRole("list", { name: "Acceptance criteria" });

    expect(within(list).getAllByRole("listitem")).toHaveLength(acceptanceCriteria.length);
  });

  it("copies the exact prompt and confirms inline", async () => {
    const user = userEvent.setup();
    const copied: string[] = [];

    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
        copyText={async (text) => {
          copied.push(text);
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(copied).toEqual([prompt]);
    expect(await screen.findByText("Copied")).toBeVisible();
  });

  it("confirms a copy without depending on a toast", async () => {
    const user = userEvent.setup();

    const { baseElement } = render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
        copyText={async () => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    const confirmation = await screen.findByText("Copied");

    expect(baseElement.contains(confirmation)).toBe(true);
    expect(confirmation.closest("[data-sonner-toast]")).toBeNull();
  });

  it("keeps the prompt selectable and explains recovery when copying fails", async () => {
    const user = userEvent.setup();

    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
        copyText={async () => {
          throw new Error("Clipboard API is unavailable");
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(await screen.findByText(COPY_FAILURE_TEXT)).toBeVisible();
    expect(screen.getByText(prompt)).toBeVisible();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("clears a prior failure only after a later success", async () => {
    const user = userEvent.setup();
    let shouldFail = true;

    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
        copyText={async () => {
          if (shouldFail) {
            throw new Error("Clipboard API is unavailable");
          }
        }}
      />,
    );

    const copyButton = screen.getByRole("button", { name: "Copy prompt" });

    await user.click(copyButton);
    expect(await screen.findByText(COPY_FAILURE_TEXT)).toBeVisible();

    await user.click(copyButton);
    expect(screen.getByText(COPY_FAILURE_TEXT)).toBeVisible();

    shouldFail = false;
    await user.click(copyButton);

    expect(await screen.findByText("Copied")).toBeVisible();
    expect(screen.queryByText(COPY_FAILURE_TEXT)).not.toBeInTheDocument();
  });

  it("gives the copy control an explicit accessible name", () => {
    render(
      <PromptPanel
        prompt={prompt}
        metadata={null}
        expectedResult="A reviewed project setup plan."
        acceptanceCriteria={acceptanceCriteria}
      />,
    );

    expect(screen.getByRole("button", { name: "Copy prompt" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Prompt</h1>
        <PromptPanel
          prompt={prompt}
          metadata="Formatted for Claude Code"
          expectedResult="A reviewed project setup plan."
          acceptanceCriteria={acceptanceCriteria}
          copyText={async () => {}}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
