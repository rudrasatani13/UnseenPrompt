import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import type {
  DiscoveryAnswerV1,
  DiscoveryQuestionV1,
  DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import { questionFingerprintV1 } from "@/domain/discovery/policy";

import { DiscoveryWorkspace } from "./discovery-workspace";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const ANSWERED_QUESTION_ID = "55555555-5555-4555-8555-555555555555";
const ACTIVE_QUESTION_ID = "44444444-4444-4444-8444-444444444444";
const UPCOMING_QUESTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "66666666-6666-4666-8666-666666666666";
const ANSWER_ID = "77777777-7777-4777-8777-777777777777";
const EVENT_ID = "88888888-8888-4888-8888-888888888888";

function makeQuestion(
  id: string,
  position: number,
  overrides: Partial<DiscoveryQuestionV1> = {},
): DiscoveryQuestionV1 {
  const questionText = overrides.questionText ?? `Question ${position}?`;

  return {
    id,
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    generationRunId: RUN_ID,
    position,
    targetFactKey: position === 1 ? "audience" : "workflow",
    basisStateVersion: position,
    questionText,
    rationale: "This answer changes the project shape.",
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

function makeAnswer(): DiscoveryAnswerV1 {
  return {
    id: ANSWER_ID,
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    questionId: ANSWERED_QUESTION_ID,
    source: "suggested",
    answerText: "a small team",
    status: "confirmed",
    supersedesAnswerId: null,
    confirmationEventId: EVENT_ID,
    createdAt: "2026-08-04T00:00:00.000Z",
    supersededAt: null,
  };
}

function snapshot(overrides: Partial<DiscoverySnapshotV1> = {}): DiscoverySnapshotV1 {
  const answered = makeQuestion(ANSWERED_QUESTION_ID, 1, {
    questionText: "Who is this for?",
    status: "answered",
    answeredAt: "2026-08-04T00:01:00.000Z",
  });
  const active = makeQuestion(ACTIVE_QUESTION_ID, 2, {
    questionText: "What workflow matters most?",
  });
  const upcoming = makeQuestion(UPCOMING_QUESTION_ID, 3, {
    questionText: "What does success look like?",
  });

  return {
    projectId: PROJECT_ID,
    mode: "new_build",
    stage: "discovery",
    stateVersion: 2,
    initialRequestText: "Build a focused field notebook.",
    session: {
      id: SESSION_ID,
      projectId: PROJECT_ID,
      sourceDraftId: "99999999-9999-4999-8999-999999999999",
      status: "active",
      policyVersion: 1,
      activeQuestionId: active.id,
      latestAssessmentId: null,
      confirmedTurnCount: 2,
      blockCode: null,
      startedAt: "2026-08-04T00:00:00.000Z",
      completedAt: null,
      abandonedAt: null,
    },
    confirmedQuestions: [answered, active, upcoming],
    confirmedAnswers: [makeAnswer()],
    assessments: [],
    activeQuestion: active,
    ...overrides,
  };
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof DiscoveryWorkspace>> = {}) {
  return {
    snapshot: snapshot(),
    pending: false,
    status: null,
    editingQuestionId: null,
    onAnswerSubmit: vi.fn(),
    onAdvance: vi.fn(),
    onEditAnswer: vi.fn(),
    onCancelEdit: vi.fn(),
    onOpenBrief: vi.fn(),
    completedPath: null,
    ...overrides,
  };
}

describe("DiscoveryWorkspace", () => {
  it("renders the current question inline with suggestions and one composer", () => {
    render(<DiscoveryWorkspace {...defaultProps()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("What workflow matters most?")).toBeVisible();
    expect(screen.getByRole("button", { name: "A small team" })).toBeVisible();
    expect(screen.getByLabelText("Your answer")).toBeVisible();
    expect(screen.getByText("Build a focused field notebook.")).toBeVisible();
    // Upcoming questions stay out of the transcript until it is their turn.
    expect(screen.queryByText("What does success look like?")).not.toBeInTheDocument();
  });

  it("shows the progress ticks for answered and remaining questions", () => {
    render(<DiscoveryWorkspace {...defaultProps()} />);

    const progress = screen.getByRole("group", {
      name: "1 of 3 questions answered",
    });
    expect(progress).toBeVisible();
    expect(screen.getByText("1/3")).toBeVisible();
  });

  it("submits a suggested answer from the current question", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<DiscoveryWorkspace {...props} />);

    await user.click(screen.getByRole("button", { name: "Just me" }));

    expect(props.onAnswerSubmit).toHaveBeenCalledWith("just me", "suggested");
  });

  it("submits free text through the single composer", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<DiscoveryWorkspace {...props} />);

    await user.type(screen.getByLabelText("Your answer"), "The review workflow");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(props.onAnswerSubmit).toHaveBeenCalledWith("The review workflow", "free_text");
  });

  it("records answered questions with a tick and a correction entry point", () => {
    render(<DiscoveryWorkspace {...defaultProps()} />);

    expect(screen.getByText("Who is this for?")).toBeVisible();
    expect(screen.getByText("a small team")).toBeVisible();
    expect(screen.getByText(/Ask 01 · Answered/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Correct" })).toBeVisible();
  });

  it("corrects an answered question through the composer", async () => {
    const user = userEvent.setup();
    const props = defaultProps({ editingQuestionId: ANSWERED_QUESTION_ID });
    render(<DiscoveryWorkspace {...props} />);

    expect(screen.getByText(/Correcting/i)).toBeVisible();
    const textarea = screen.getByLabelText("Your answer");
    expect(textarea).toHaveValue("a small team");

    await user.clear(textarea);
    await user.type(textarea, "a bigger team");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(props.onAnswerSubmit).toHaveBeenCalledWith("a bigger team", "free_text");
  });

  it("cancels correction mode without submitting", async () => {
    const user = userEvent.setup();
    const props = defaultProps({ editingQuestionId: ANSWERED_QUESTION_ID });
    render(<DiscoveryWorkspace {...props} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancelEdit).toHaveBeenCalledTimes(1);
    expect(props.onAnswerSubmit).not.toHaveBeenCalled();
  });

  it("marks priority on the current question", () => {
    render(<DiscoveryWorkspace {...defaultProps()} />);

    expect(screen.getByText(/Ask 02 · Critical/i)).toBeVisible();

    const late = snapshot({
      activeQuestion: makeQuestion(UPCOMING_QUESTION_ID, 3, {
        questionText: "What does success look like?",
      }),
      session: {
        ...snapshot().session,
        activeQuestionId: UPCOMING_QUESTION_ID,
      },
    });
    const lateProps = defaultProps({ snapshot: late });
    render(<DiscoveryWorkspace {...lateProps} />);
    expect(screen.getByText(/Ask 03 · High priority/i)).toBeVisible();
  });

  it("shows the completion state without an input once discovery completes", () => {
    const completed = snapshot({
      activeQuestion: null,
      session: {
        ...snapshot().session,
        status: "completed",
        activeQuestionId: null,
        completedAt: "2026-08-04T00:10:00.000Z",
      },
    });
    const props = defaultProps({
      snapshot: completed,
      completedPath: `/projects/${PROJECT_ID}/brief`,
    });
    render(<DiscoveryWorkspace {...props} />);

    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByText("Your project brief is ready.")).toBeVisible();
  });

  it("opens the brief from the completion state", async () => {
    const user = userEvent.setup();
    const completed = snapshot({
      activeQuestion: null,
      session: {
        ...snapshot().session,
        status: "completed",
        activeQuestionId: null,
        completedAt: "2026-08-04T00:10:00.000Z",
      },
    });
    const props = defaultProps({
      snapshot: completed,
      completedPath: `/projects/${PROJECT_ID}/brief`,
    });
    render(<DiscoveryWorkspace {...props} />);

    await user.click(screen.getByRole("button", { name: "Open project brief" }));
    expect(props.onOpenBrief).toHaveBeenCalledTimes(1);
  });

  it("renders lifecycle status surfaces and keeps correction explicit", async () => {
    const user = userEvent.setup();
    const props = defaultProps({
      status: {
        variant: "abandoned",
        title: "Your answers are saved",
        description: "Resume when you are ready.",
        action: { label: "Resume workspace", onClick: vi.fn() },
      },
      snapshot: snapshot({
        activeQuestion: null,
        session: {
          ...snapshot().session,
          status: "abandoned",
          activeQuestionId: null,
          abandonedAt: "2026-08-04T00:05:00.000Z",
        },
      }),
    });
    render(<DiscoveryWorkspace {...props} />);

    expect(screen.getByRole("status")).toHaveTextContent("Your answers are saved");
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Correct" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Resume workspace" }));
    expect(props.status?.action?.onClick).toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = render(<DiscoveryWorkspace {...defaultProps()} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
