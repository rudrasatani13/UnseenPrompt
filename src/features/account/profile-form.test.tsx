import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ProfileForm } from "@/features/account/profile-form";

const profile = { displayName: "Ada", locale: "en", timeZone: "UTC" };

describe("ProfileForm", () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ profile }, { status: 200 })) as typeof fetch,
    );
  });

  it("renders only explicitly saved account fields", () => {
    render(<ProfileForm profile={profile} />);

    expect(screen.getByLabelText("Display name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Language tag")).toHaveValue("en");
    expect(screen.getByLabelText("Time zone")).toHaveValue("UTC");
    expect(screen.queryByText(/provider|email address/i)).not.toBeInTheDocument();
  });

  it("patches a normalised account edit and refreshes server data", async () => {
    const user = userEvent.setup();
    render(<ProfileForm profile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "  Grace  ");
    await user.clear(screen.getByLabelText("Language tag"));
    await user.type(screen.getByLabelText("Language tag"), "pt-BR");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith(
      "/api/account/profile",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String((request as RequestInit).body))).toEqual({
      displayName: "Grace",
      locale: "pt-BR",
      timeZone: "UTC",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Profile saved.");
  });

  it("allows a blank display name to clear it", async () => {
    const user = userEvent.setup();
    render(<ProfileForm profile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String((request as RequestInit).body))).toMatchObject({ displayName: null });
  });

  it("keeps an invalid byte-length value client-side", async () => {
    const user = userEvent.setup();
    render(<ProfileForm profile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "日".repeat(41));

    expect(screen.getByRole("alert")).toHaveTextContent("Use at most 120 bytes.");
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the edit available after an unsuccessful save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 502 })) as typeof fetch);
    const user = userEvent.setup();
    render(<ProfileForm profile={profile} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save your profile. Try again in a moment.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
