import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import AuthLayout from "./layout";

describe("AuthLayout", () => {
  it("renders children inside the main landmark under the brand lockup", async () => {
    const { container } = render(
      <AuthLayout>
        <p>Auth child content</p>
      </AuthLayout>,
    );

    expect(screen.getByRole("main")).toContainElement(screen.getByText("Auth child content"));
    expect(screen.getByText("UnseenPrompt")).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("omits the application shell so a signed-out visitor sees no navigation", () => {
    render(
      <AuthLayout>
        <p>Auth child content</p>
      </AuthLayout>,
    );

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
