import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import type { DiscoveryAnswerSource, DiscoveryQuestionV1 } from "@/domain/discovery/contracts";
import { questionFingerprintV1 } from "@/domain/discovery/policy";

import { DiscoveryQuestion } from "./discovery-question";

const QUESTION_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";

function question(overrides: Partial<DiscoveryQuestionV1> = {}): DiscoveryQuestionV1 {
  const questionText = overrides.questionText ?? "Who should use this project?";

  return {
    id: QUESTION_ID,
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    generationRunId: RUN_ID,
    position: 1,
    targetFactKey: "audience",
    basisStateVersion: 1,
    questionText,
    rationale: "This keeps the first workflow focused.",
    suggestedAnswers: [
      { label: "A small team", value: "a small team" },
      { label: "Just me", value: "just me" },
    ],
    allowsFreeText: true,
    questionFingerprint: questionFingerprintV1(questionText),
    status: "active",
    createdAt: "2026-08-04T00:00:00.000Z",
    answeredAt: null,
    supersededAt: null,
    ...overrides,
  };
}

function ControlledQuestion({ allowsFreeText = true }: { readonly allowsFreeText?: boolean }) {
  const [answerText, setAnswerText] = useState("");
  const [source, setSource] = useState<DiscoveryAnswerSource | null>(null);
  const currentQuestion = question({ allowsFreeText });

  return (
    <DiscoveryQuestion
      question={currentQuestion}
      answerText={answerText}
      answerSource={source}
      pending={false}
      submitLabel="Confirm answer"
      onAnswerChange={(nextText, nextSource) => {
        setAnswerText(nextText);
        setSource(nextSource);
      }}
      onSubmit={() => undefined}
    />
  );
}

describe("DiscoveryQuestion", () => {
  it("keeps radio selection separate from explicit confirmation", async () => {
    const user = userEvent.setup();
    const submitted: Array<{ readonly text: string; readonly source: DiscoveryAnswerSource }> = [];

    function TestQuestion() {
      const [answerText, setAnswerText] = useState("");
      const [source, setSource] = useState<DiscoveryAnswerSource | null>(null);

      return (
        <DiscoveryQuestion
          question={question()}
          answerText={answerText}
          answerSource={source}
          pending={false}
          submitLabel="Confirm answer"
          onAnswerChange={(nextText, nextSource) => {
            setAnswerText(nextText);
            setSource(nextSource);
          }}
          onSubmit={(text, nextSource) => submitted.push({ text, source: nextSource })}
        />
      );
    }

    render(<TestQuestion />);
    await user.click(screen.getByRole("radio", { name: "A small team" }));

    expect(submitted).toEqual([]);
    expect(screen.getByRole("button", { name: "Confirm answer" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Confirm answer" }));

    expect(submitted).toEqual([{ text: "a small team", source: "suggested" }]);
  });

  it("shows free text only when allowed and reports multibyte overflow", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ControlledQuestion />);
    const freeText = screen.getByLabelText("Or write your own answer");

    await user.type(freeText, "A mixed-language answer");
    expect(freeText).toHaveValue("A mixed-language answer");

    await user.clear(freeText);
    fireEvent.change(freeText, { target: { value: "日".repeat(5_500) } });
    expect(screen.getByRole("alert")).toHaveTextContent("Use at most 16384 bytes.");
    expect(screen.getByRole("button", { name: "Confirm answer" })).toBeDisabled();

    rerender(<ControlledQuestion allowsFreeText={false} />);
    expect(screen.queryByLabelText("Or write your own answer")).not.toBeInTheDocument();
  });

  it("has no axe violations and keeps the question rationale associated with the form", async () => {
    const { container } = render(<ControlledQuestion />);

    expect(screen.getByText(/Why this matters:/)).toBeVisible();
    expect(screen.getByRole("form")).toHaveAttribute(
      "aria-labelledby",
      `discovery-question-${QUESTION_ID}`,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
