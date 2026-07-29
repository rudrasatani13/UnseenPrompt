import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductPreview } from "@/components/product/product-preview";

describe("ProductPreview", () => {
  it("renders the non-interactive preview copy", () => {
    render(<ProductPreview />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Start with the messy version.",
    );
    expect(screen.getByText("Product preview")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });
});
