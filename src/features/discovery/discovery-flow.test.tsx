import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DiscoveryAnswerV1,
  DiscoveryQuestionV1,
  DiscoverySnapshotV1,
} from "@/domain/discovery/contracts";
import { questionFingerprintV1 } from "@/domain/discovery/policy";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { DiscoveryFlow } from "./discovery-flow";

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const QUESTION_ID = "44444444-4444-4444-8444-444444444444";
const PREVIOUS_QUESTION_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "66666666-6666-4666-8666-666666666666";
const ANSWER_ID = "77777777-7777-4777-8777-777777777777";
const EVENT_ID = "88888888-8888-4888-8888-888888888888";

function makeQuestion(
  id: string,
  position: number,
  overrides: Partial<DiscoveryQuestionV1> = {},
): DiscoveryQuestionV1 {
  const questionText = overrides.questionText ?? `Who should use question ${position}?`;

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

function makeAnswer(questionId: string = PREVIOUS_QUESTION_ID): DiscoveryAnswerV1 {
  return {
    id: ANSWER_ID,
    projectId: PROJECT_ID,
    sessionId: SESSION_ID,
    questionId,
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
  const previousQuestion = makeQuestion(PREVIOUS_QUESTION_ID, 1, {
    questionText: "Who is this for?",
    status: "answered",
    answeredAt: "2026-08-04T00:01:00.000Z",
  });
  const activeQuestion = makeQuestion(QUESTION_ID, 2, {
    questionText: "What workflow matters most?",
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
      activeQuestionId: activeQuestion.id,
      latestAssessmentId: null,
      confirmedTurnCount: 2,
      blockCode: null,
      startedAt: "2026-08-04T00:00:00.000Z",
      completedAt: null,
      abandonedAt: null,
    },
    confirmedQuestions: [previousQuestion],
    confirmedAnswers: [makeAnswer()],
    assessments: [],
    activeQuestion,
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("DiscoveryFlow", () => {
  beforeEach(() => {
    push.mockReset();
    vi.restoreAllMocks();
  });

  it("resumes a persisted active question without issuing an advance request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DiscoveryFlow initialSnapshot={snapshot()} />);

    expect(screen.getByText("What workflow matters most?")).toBeVisible();
    expect(screen.getByText("Why this matters:")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an explicit suggested answer and reloads the authoritative snapshot", async () => {
    const user = userEvent.setup();
    const next = snapshot({ activeQuestion: null, stateVersion: 3 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          projectId: PROJECT_ID,
          stateVersion: 3,
          eventId: EVENT_ID,
          answerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          replayed: false,
        }),
      )
      .mockResolvedValueOnce(response(next));
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFlow initialSnapshot={snapshot()} />);
    await user.click(screen.getByRole("radio", { name: "A small team" }));
    await user.click(screen.getByRole("button", { name: "Confirm answer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, request] = fetchMock.mock.calls[0] ?? [];
    const envelope = JSON.parse(String((request as RequestInit).body)) as {
      readonly command: {
        readonly type: string;
        readonly source?: string;
        readonly answerText?: string;
      };
    };
    expect(envelope.command).toMatchObject({
      type: "confirm_answer",
      source: "suggested",
      answerText: "a small team",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/projects/${PROJECT_ID}/discovery`);
    expect(screen.getByRole("button", { name: "Improve this prompt" })).toBeVisible();
  });

  it("preserves unsent text after a stale conflict reload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ error: { code: "conflict" } }, 409))
      .mockResolvedValueOnce(response(snapshot()));
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFlow initialSnapshot={snapshot()} />);
    const freeText = screen.getByLabelText("Or write your own answer");
    await user.type(freeText, "A multilingual internal workflow");
    await user.click(screen.getByRole("button", { name: "Confirm answer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("project changed");
    expect(screen.getByLabelText("Or write your own answer")).toHaveValue(
      "A multilingual internal workflow",
    );
  });

  it("resumes an abandoned session by reloading its saved snapshot", async () => {
    const user = userEvent.setup();
    const abandoned = snapshot({
      activeQuestion: null,
      session: {
        ...snapshot().session,
        status: "abandoned",
        activeQuestionId: null,
        abandonedAt: "2026-08-04T00:03:00.000Z",
      },
    });
    const resumed = snapshot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ projectId: PROJECT_ID, stateVersion: 3, eventId: EVENT_ID, replayed: false }),
      )
      .mockResolvedValueOnce(response(resumed));
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFlow initialSnapshot={abandoned} />);
    expect(screen.queryByText("What workflow matters most?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resume workspace" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("What workflow matters most?")).toBeVisible();
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      command: { type: "resume_discovery" },
    });
  });

  it("reconciles an aborted answer request and keeps unsent text without claiming unchanged state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The request was aborted", "AbortError"));
            });
          }),
      )
      .mockResolvedValueOnce(response(snapshot()));
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFlow initialSnapshot={snapshot()} />);
    const freeText = screen.getByLabelText("Or write your own answer");
    await user.type(freeText, "A multilingual internal workflow");
    await user.click(screen.getByRole("button", { name: "Confirm answer" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/projects/${PROJECT_ID}/discovery`);
    expect(screen.getByLabelText("Or write your own answer")).toHaveValue(
      "A multilingual internal workflow",
    );
    expect(screen.getByRole("status")).toHaveTextContent(/request cancelled/i);
    expect(screen.queryByText(/state is unchanged/i)).not.toBeInTheDocument();
  });

  it("surfaces an honest accessible status when cancellation reconciliation fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The request was aborted", "AbortError"));
            });
          }),
      )
      .mockRejectedValueOnce(new Error("reload failed"));
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFlow initialSnapshot={snapshot()} />);
    const freeText = screen.getByLabelText("Or write your own answer");
    await user.type(freeText, "Keep this local answer");
    await user.click(screen.getByRole("button", { name: "Confirm answer" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Request status is unknown");
    expect(alert).toHaveTextContent(/may have been saved/i);
    expect(screen.getByLabelText("Or write your own answer")).toHaveValue("Keep this local answer");
    expect(screen.queryByText(/state is unchanged/i)).not.toBeInTheDocument();
  });

  it("renders correction mode and sends a successor answer with the predecessor id", async () => {
    const user = userEvent.setup();
    const corrected = snapshot({
      activeQuestion: null,
      confirmedQuestions: [
        makeQuestion(PREVIOUS_QUESTION_ID, 1, {
          questionText: "Who is this for?",
          status: "answered",
          answeredAt: "2026-08-04T00:01:00.000Z",
        }),
      ],
      confirmedAnswers: [{ ...makeAnswer(), answerText: "a solo maker" }],
      stateVersion: 3,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          projectId: PROJECT_ID,
          stateVersion: 3,
          eventId: EVENT_ID,
          answerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          replayed: false,
        }),
      )
      .mockResolvedValueOnce(response(corrected));
    vi.stubGlobal("fetch", fetchMock);

    render(<DiscoveryFlow initialSnapshot={snapshot()} />);
    await user.click(screen.getByRole("button", { name: "Correct this answer" }));
    expect(screen.getByRole("button", { name: "Confirm correction" })).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Just me" }));
    await user.click(screen.getByRole("button", { name: "Confirm correction" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const envelope = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      readonly command: Record<string, unknown>;
    };
    expect(envelope.command).toMatchObject({
      type: "revise_answer",
      questionId: PREVIOUS_QUESTION_ID,
      predecessorAnswerId: ANSWER_ID,
      source: "suggested",
      answerText: "just me",
    });
  });

  it("navigates after a completed advance and exposes the completion state", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response({
        status: "completed",
        projectId: PROJECT_ID,
        stateVersion: 8,
        eventId: EVENT_ID,
        replayed: false,
        nextPath: `/projects/${PROJECT_ID}/brief`,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<DiscoveryFlow initialSnapshot={snapshot({ activeQuestion: null })} />);

    await user.click(screen.getByRole("button", { name: "Improve this prompt" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/brief`));
    expect(screen.getByText("Discovery complete")).toBeVisible();
  });
});
