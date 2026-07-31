import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import { OnboardingFlow } from "@/features/account/onboarding-flow";

const SKILL_QUESTION = "How much building have you done before?";
const STACK_BEHAVIOR_QUESTION = "How should we pick the tools for a new project?";
const SAVED_STACK_QUESTION = "Which tools do you usually reach for?";
const STYLE_QUESTION = "How do you like code written?";
const DEPLOYMENT_QUESTION = "Where do you usually put things online?";
const LOCALE_QUESTION = "Which language should we write in?";
const TIME_ZONE_QUESTION = "Is this your time zone?";

function next(): HTMLElement {
  return screen.getByRole("button", { name: "Next" });
}

async function answerThroughBehavior(user: UserEvent, behavior: string): Promise<void> {
  await user.click(next());
  await user.click(screen.getByRole("radio", { name: /Beginner/ }));
  await user.click(next());
  await user.click(screen.getByRole("radio", { name: new RegExp(behavior) }));
  await user.click(next());
}

describe("OnboardingFlow", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "completed" }, { status: 200 })) as typeof fetch,
    );
  });

  it("asks one question at a time", async () => {
    const { container } = render(<OnboardingFlow />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Set up your account");
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.queryByText(SKILL_QUESTION)).not.toBeInTheDocument();
    expect(screen.queryByText(TIME_ZONE_QUESTION)).not.toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("walks the locked step order and skips the saved stack unless it is preferred", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await user.click(next());
    expect(screen.getByText(SKILL_QUESTION)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Beginner/ }));
    await user.click(next());
    expect(screen.getByText(STACK_BEHAVIOR_QUESTION)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Recommend something for me/ }));
    await user.click(next());
    expect(screen.queryByText(SAVED_STACK_QUESTION)).not.toBeInTheDocument();
    expect(screen.getByText(STYLE_QUESTION)).toBeInTheDocument();

    await user.click(next());
    expect(screen.getByText(DEPLOYMENT_QUESTION)).toBeInTheDocument();

    await user.click(next());
    expect(screen.getByText(LOCALE_QUESTION)).toBeInTheDocument();

    await user.click(next());
    expect(screen.getByText(TIME_ZONE_QUESTION)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("shows the saved-stack step only for the behavior that asks for one", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await answerThroughBehavior(user, "Use my saved stack");

    expect(screen.getByText(SAVED_STACK_QUESTION)).toBeInTheDocument();
    for (const label of ["Frontend", "Backend", "Database", "Hosting"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("blocks the required questions until they are answered", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await user.click(next());
    expect(next()).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Advanced/ }));
    expect(next()).toBeEnabled();
  });

  it("lets a keyboard move between the options of a question", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await user.click(next());
    screen.getByRole("radio", { name: /Beginner/ }).focus();

    await user.keyboard("{ArrowDown>}");
    expect(screen.getByRole("radio", { name: /Intermediate/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Beginner/ })).not.toBeChecked();
    await user.keyboard("{/ArrowDown}");

    expect(next()).toBeEnabled();
  });

  it("can step back without losing an answer", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await user.type(screen.getByLabelText("Display name"), "Ada");
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText("Display name")).toHaveValue("Ada");
  });

  it("posts the accumulated answers exactly once and lands on the profile", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await user.type(screen.getByLabelText("Display name"), "  Ada  ");
    await answerThroughBehavior(user, "Use my saved stack");

    await user.type(screen.getByLabelText("Frontend"), "Next.js");
    await user.click(next());

    await user.click(screen.getByRole("radio", { name: /Tests first/ }));
    await user.click(next());

    await user.click(screen.getByRole("radio", { name: /Cloudflare/ }));
    await user.click(next());

    await user.clear(screen.getByLabelText("Language tag"));
    await user.type(screen.getByLabelText("Language tag"), "pt-BR");
    await user.click(next());

    await user.click(screen.getByRole("button", { name: "Confirm and finish" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/profile");
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe("/api/account/onboarding");
    expect((init as RequestInit).method).toBe("POST");

    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      displayName: "Ada",
      skillLevel: "beginner",
      preferredStackBehavior: "prefer_saved",
      preferredStack: { frontend: "Next.js" },
      codingStyle: { testing: "test_first" },
      deploymentPreference: "cloudflare",
      locale: "pt-BR",
    });
    expect(typeof body.timeZone).toBe("string");
  });

  it("sends an empty saved stack when another behavior was chosen", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await answerThroughBehavior(user, "Ask me each time");
    await user.click(next());
    await user.click(next());
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Confirm and finish" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(body.preferredStack).toEqual({});
    expect(body.displayName).toBeNull();
    expect(body.deploymentPreference).toBeNull();
    expect(body.codingStyle).toEqual({});
  });

  it("keeps the user on the last step and allows a retry when the write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "provider_error" } }, { status: 502 }),
      ) as typeof fetch,
    );

    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await answerThroughBehavior(user, "Ask me each time");
    await user.click(next());
    await user.click(next());
    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Confirm and finish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save your answers. Try again in a moment.",
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm and finish" })).toBeEnabled();
  });

  it("refuses to advance past an invalid language tag", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    await answerThroughBehavior(user, "Ask me each time");
    await user.click(next());
    await user.click(next());

    await user.clear(screen.getByLabelText("Language tag"));
    await user.type(screen.getByLabelText("Language tag"), "not a locale");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a language tag such as en or pt-BR.",
    );
    expect(next()).toBeDisabled();
  });

  it("refuses to advance past a display name over the byte budget", async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow />);

    // "日" is three UTF-8 bytes, so 41 of them exceed the 120-byte column bound.
    await user.type(screen.getByLabelText("Display name"), "日".repeat(41));

    expect(screen.getByRole("alert")).toHaveTextContent("Use at most 120 bytes.");
    expect(next()).toBeDisabled();
  });
});
