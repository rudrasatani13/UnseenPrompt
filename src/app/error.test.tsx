import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import ErrorBoundary from "@/app/error";

describe("ErrorBoundary", () => {
  it("shows a visible heading and persistent explanation", () => {
    render(<ErrorBoundary error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText(/could not be displayed/i)).toBeVisible();
  });

  it("invokes reset exactly once from Try again", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not render raw stack traces", () => {
    const error = new Error("secret stack");
    error.stack = "Error: secret stack\n    at secret/file.ts:1:1";

    render(<ErrorBoundary error={error} reset={() => {}} />);

    expect(screen.queryByText(/secret\/file/)).not.toBeInTheDocument();
    expect(screen.queryByText(error.stack)).not.toBeInTheDocument();
  });

  it("does not rely on a toast-only error", () => {
    const { container } = render(<ErrorBoundary error={new Error("boom")} reset={() => {}} />);

    expect(container.querySelector("[data-sonner-toast]")).toBeNull();
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <ErrorBoundary error={new Error("boom")} reset={() => {}} />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("route boundary source contracts", () => {
  it("gives loading an accessible Loading workspace label", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/(product)/(workspace)/loading.tsx"),
      "utf8",
    );

    expect(source).toContain("Loading workspace");
    expect(source).toContain("232px");
  });

  it("explains not-found and links home", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/not-found.tsx"), "utf8");

    expect(source).toMatch(/not found|unavailable|does not exist/i);
    expect(source).toContain('href="/"');
  });

  it("keeps global-error free of the component system", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/global-error.tsx"), "utf8");

    expect(source).toContain("<html");
    expect(source).toContain("<body");
    expect(source).not.toMatch(/@\/components|@\/config|motion|sonner/);
  });
});
