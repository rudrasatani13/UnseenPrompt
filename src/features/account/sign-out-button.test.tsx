import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SignOutButton } from "@/features/account/sign-out-button";

describe("SignOutButton", () => {
  it("submits the server-side sign-out route with POST", () => {
    render(<SignOutButton />);

    const button = screen.getByRole("button", { name: "Sign out" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("action", "/auth/sign-out");
    expect(form).toHaveAttribute("method", "post");
  });
});
