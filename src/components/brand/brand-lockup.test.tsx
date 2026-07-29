import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { BrandLockup } from "@/components/brand/brand-lockup";

describe("BrandLockup", () => {
  it("uses the approved public brand asset", () => {
    const { container } = render(<BrandLockup variant="compact" />);
    const image = container.querySelector("img");

    expect(image).toHaveAttribute("src", "/brand/icon-192.png");
  });

  it("names the mark when the wordmark is not rendered", () => {
    render(<BrandLockup variant="compact" />);

    expect(screen.getByRole("img", { name: "UnseenPrompt" })).toBeInTheDocument();
    expect(screen.queryByText("UnseenPrompt")).not.toBeInTheDocument();
  });

  it("hides the image name when the visible wordmark is present", () => {
    const { container } = render(<BrandLockup variant="full" />);

    expect(screen.getByText("UnseenPrompt")).toBeVisible();
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders compact and full variants without importing app routes", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/brand/brand-lockup.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/@\/app|src\/app/);

    const { rerender } = render(<BrandLockup variant="compact" />);
    expect(screen.getByRole("img")).toBeInTheDocument();

    rerender(<BrandLockup variant="full" />);
    expect(screen.getByText("UnseenPrompt")).toBeVisible();
  });

  it("has no axe violations for either variant", async () => {
    const compact = render(
      <main>
        <h1>Brand</h1>
        <BrandLockup variant="compact" />
      </main>,
    );
    expect(await axe(compact.container)).toHaveNoViolations();
    compact.unmount();

    const full = render(
      <main>
        <h1>Brand</h1>
        <BrandLockup variant="full" />
      </main>,
    );
    expect(await axe(full.container)).toHaveNoViolations();
  });
});
