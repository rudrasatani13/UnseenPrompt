import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerEnvironment = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("@/config/env/server", () => ({ getServerEnvironment }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/sign-in-panel", () => ({
  SignInPanel: ({ nextPath, errorCode }: { nextPath: string; errorCode?: string }) => (
    <div data-testid="sign-in-panel-stub" data-next={nextPath} data-error={errorCode ?? ""} />
  ),
}));

function environmentFor(appEnv: string) {
  return {
    APP_ENV: appEnv,
    NEXT_PUBLIC_APP_URL: "https://app.unseenprompt.test",
    RELEASE_SHA: "test-release",
    MAINTENANCE_MODE: "off",
  };
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.resetModules();
    getServerEnvironment.mockReset().mockReturnValue(environmentFor("local"));
    notFound.mockClear();
  });

  it("renders notFound in production", async () => {
    getServerEnvironment.mockReturnValue(environmentFor("production"));
    const { default: SignInPage } = await import("./page");

    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("passes the validated next path and known error code to the panel", async () => {
    const { default: SignInPage } = await import("./page");

    render(
      await SignInPage({
        searchParams: Promise.resolve({ next: "/profile", error: "magic_link_invalid" }),
      }),
    );

    const panel = screen.getByTestId("sign-in-panel-stub");
    expect(panel).toHaveAttribute("data-next", "/profile");
    expect(panel).toHaveAttribute("data-error", "magic_link_invalid");
  });

  it("neutralizes a hostile next value", async () => {
    const { default: SignInPage } = await import("./page");

    render(await SignInPage({ searchParams: Promise.resolve({ next: "//evil.example/profile" }) }));

    expect(screen.getByTestId("sign-in-panel-stub")).toHaveAttribute("data-next", "/");
  });

  it("neutralizes repeated params rather than picking one", async () => {
    const { default: SignInPage } = await import("./page");

    render(
      await SignInPage({
        searchParams: Promise.resolve({ next: ["//evil.example", "/profile"] }),
      }),
    );

    expect(screen.getByTestId("sign-in-panel-stub")).toHaveAttribute("data-next", "/");
  });

  it("renders nothing for an unknown error code", async () => {
    const { default: SignInPage } = await import("./page");

    render(await SignInPage({ searchParams: Promise.resolve({ error: ["magic_link_invalid"] }) }));

    expect(screen.getByTestId("sign-in-panel-stub")).toHaveAttribute("data-error", "");
  });
});
