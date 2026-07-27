import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("identifies the product without claiming unavailable functionality", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "UnseenPrompt" })).toBeInTheDocument();
    expect(screen.getByText("Stateful Project Copilot")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
