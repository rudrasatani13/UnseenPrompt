import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { PreferencesForm } from "@/features/account/preferences-form";

const preferences = {
  skillLevel: "advanced" as const,
  preferredStackBehavior: "prefer_saved" as const,
  preferredStack: { frontend: "Next.js" },
  codingStyle: { testing: "test_first" as const },
  deploymentPreference: "cloudflare" as const,
};

describe("PreferencesForm", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ preferences }, { status: 200 })) as typeof fetch,
    );
  });

  it("renders every onboarding preference with its saved value", () => {
    render(<PreferencesForm preferences={preferences} />);

    expect(screen.getByLabelText("Experience level")).toHaveValue("advanced");
    expect(screen.getByLabelText("Stack behavior")).toHaveValue("prefer_saved");
    expect(screen.getByLabelText("Frontend")).toHaveValue("Next.js");
    expect(screen.getByLabelText("Testing")).toHaveValue("test_first");
    expect(screen.getByLabelText("Deployment preference")).toHaveValue("cloudflare");
  });

  it("puts the complete preference value and refreshes after a successful save", async () => {
    const user = userEvent.setup();
    render(<PreferencesForm preferences={preferences} />);

    await user.selectOptions(screen.getByLabelText("Stack behavior"), "ask");
    await user.selectOptions(screen.getByLabelText("Deployment preference"), "undecided");
    await user.click(screen.getByRole("button", { name: "Save preferences" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/preferences",
      expect.objectContaining({ method: "PUT" }),
    );
    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String((request as RequestInit).body))).toEqual({
      skillLevel: "advanced",
      preferredStackBehavior: "ask",
      preferredStack: {},
      codingStyle: { testing: "test_first" },
      deploymentPreference: null,
    });
    expect(screen.getByRole("status")).toHaveTextContent("Preferences saved.");
  });

  it("does not send a saved stack when its behavior changes", async () => {
    const user = userEvent.setup();
    render(<PreferencesForm preferences={preferences} />);

    await user.selectOptions(screen.getByLabelText("Stack behavior"), "recommend");
    expect(screen.queryByLabelText("Frontend")).not.toBeInTheDocument();
  });

  it("shows a retryable error when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 502 })) as typeof fetch);
    const user = userEvent.setup();
    render(<PreferencesForm preferences={preferences} />);

    await user.click(screen.getByRole("button", { name: "Save preferences" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save your preferences. Try again in a moment.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
