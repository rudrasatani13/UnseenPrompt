import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

const signInWithOAuth = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
const signInWithOtp = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));

vi.mock("@/lib/supabase/browser-client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signInWithOAuth, signInWithOtp } }),
}));

import { SignInPanel } from "@/features/auth/sign-in-panel";

const NEUTRAL_CONFIRMATION =
  "If that address can sign in, a link is on its way. Check your inbox and spam folder.";

describe("SignInPanel", () => {
  beforeEach(() => {
    signInWithOAuth.mockClear().mockResolvedValue({ data: {}, error: null });
    signInWithOtp.mockClear().mockResolvedValue({ data: {}, error: null });
    window.history.replaceState(null, "", "/sign-in");
  });

  it("renders both sign-in methods with accessible names and no violations", async () => {
    const { container } = render(<SignInPanel nextPath="/" />);

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    expect(screen.getByLabelText("Email address")).toBeVisible();
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("starts the Google flow with a callback carrying the validated next path", async () => {
    const user = userEvent.setup();
    render(<SignInPanel nextPath="/profile" />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fprofile`,
      },
    });
  });

  it("submits the magic link with a normalized email and shows the neutral confirmation", async () => {
    const user = userEvent.setup();
    render(<SignInPanel nextPath="/" />);

    await user.type(screen.getByLabelText("Email address"), "  Person@Example.COM ");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    expect(await screen.findByText(NEUTRAL_CONFIRMATION)).toBeVisible();
  });

  it("shows the same neutral confirmation when Supabase reports an account-state error", async () => {
    signInWithOtp.mockResolvedValue({
      data: {},
      error: { message: "User already registered", status: 422 },
    } as never);
    const user = userEvent.setup();
    render(<SignInPanel nextPath="/" />);

    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByText(NEUTRAL_CONFIRMATION)).toBeVisible();
  });

  it("shows a retry message with no address-existence signal when the transport fails", async () => {
    signInWithOtp.mockRejectedValue(new Error("network unreachable"));
    const user = userEvent.setup();
    render(<SignInPanel nextPath="/" />);

    await user.type(screen.getByLabelText("Email address"), "person@example.com");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(
      await screen.findByText("We couldn’t send the sign-in link. Try again in a minute."),
    ).toBeVisible();
    expect(screen.queryByText(NEUTRAL_CONFIRMATION)).not.toBeInTheDocument();
  });

  it("rejects a malformed address locally without calling Supabase", async () => {
    const user = userEvent.setup();
    render(<SignInPanel nextPath="/" />);

    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() => {
      expect(screen.getByText("Enter a complete email address.")).toBeVisible();
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("maps only the known stable error codes to copy", () => {
    const { unmount } = render(<SignInPanel nextPath="/" errorCode="auth_callback_failed" />);
    expect(screen.getByText("We couldn’t complete that sign-in. Please try again.")).toBeVisible();
    unmount();

    const second = render(<SignInPanel nextPath="/" errorCode="magic_link_invalid" />);
    expect(
      screen.getByText("That sign-in link is no longer valid. Request a new one."),
    ).toBeVisible();
    second.unmount();
  });

  it("never echoes an unknown error param", () => {
    render(<SignInPanel nextPath="/" errorCode="<img src=x onerror=alert(1)>" />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("onerror");
  });
});
