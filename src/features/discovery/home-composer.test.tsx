import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { HomeComposer } from "./home-composer";

const push = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const DRAFT_ID = "02000000-0000-4000-8000-000000000001";
const PROJECT_ID = "01000000-0000-4000-8000-000000000001";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function awaitingResponse(version = 2): unknown {
  return {
    draftId: DRAFT_ID,
    version,
    status: "awaiting_confirmation",
    intent: {
      mode: "new_build",
      confidence: 0.93,
      rationale: "The request describes a new product build.",
      detectedLanguage: "en",
    },
    replayed: false,
  };
}

describe("HomeComposer", () => {
  beforeEach(() => {
    push.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("submits multilingual text, shows the seven-mode confirmation, and promotes only after confirmation", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(response(awaitingResponse())).mockResolvedValueOnce(
      response({
        draftId: DRAFT_ID,
        version: 3,
        status: "promoted",
        projectId: PROJECT_ID,
        replayed: false,
      }),
    );
    const { container } = render(<HomeComposer />);

    const input = screen.getByRole("textbox", { name: "What do you want to work on?" });
    await user.type(input, "Build a multilingual नोट्स app.");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByRole("heading", { name: "Does this look like the right kind of work?" }),
    ).toBeVisible();
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(screen.getByRole("textbox", { name: "Project title" })).toHaveValue(
      "Build a multilingual नोट्स app",
    );

    await user.click(screen.getByRole("radio", { name: "Bug" }));
    await user.click(screen.getByRole("button", { name: "Confirm and continue" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createRequest = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      readonly initialRequestText: string;
    };
    expect(createRequest.initialRequestText).toContain("नोट्स");
    const commandRequest = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      readonly command: { readonly type: string; readonly confirmedMode: string };
    };
    expect(commandRequest.command).toMatchObject({
      type: "confirm_and_promote",
      confirmedMode: "bug",
    });
    expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/discovery`);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders a durable retry state without exposing the original text and retries by draft id/version", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        response({
          draftId: DRAFT_ID,
          version: 2,
          status: "retry_required",
          lastErrorCode: "provider_error",
          replayed: true,
        }),
      )
      .mockResolvedValueOnce(response(awaitingResponse(3)));
    render(<HomeComposer />);

    const originalText = "Keep this private while the model retries.";
    await user.type(
      screen.getByRole("textbox", { name: "What do you want to work on?" }),
      originalText,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("heading", { name: /route check needs another attempt/i }),
    ).toBeVisible();
    expect(screen.queryByText(originalText)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try the route check again" }));
    expect(
      await screen.findByRole("heading", { name: "Does this look like the right kind of work?" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/composer/drafts/${DRAFT_ID}/commands`);
    const commandRequest = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      readonly draftId: string;
      readonly expectedVersion: number;
      readonly command: { readonly type: string };
    };
    expect(commandRequest).toMatchObject({
      draftId: DRAFT_ID,
      expectedVersion: 2,
      command: { type: "retry_intent" },
    });
    expect(screen.queryByText(originalText)).not.toBeInTheDocument();
  });

  it("maps failed API responses to safe copy", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response(
        { error: { code: "provider_error", message: "provider secret should not be shown" } },
        502,
      ),
    );
    render(<HomeComposer />);

    await user.type(
      screen.getByRole("textbox", { name: "What do you want to work on?" }),
      "A request",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not check that request.");
    expect(screen.queryByText("provider secret should not be shown")).not.toBeInTheDocument();
  });
});
