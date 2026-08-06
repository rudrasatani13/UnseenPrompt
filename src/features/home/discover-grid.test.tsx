import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { DISCOVER_TEMPLATES } from "./discover-fixtures";
import { DiscoverGrid } from "./discover-grid";

describe("DiscoverGrid", () => {
  it("lists every starting point under Recommended and reports card usage", async () => {
    const user = userEvent.setup();
    const onUseTemplate = vi.fn();
    render(<DiscoverGrid onUseTemplate={onUseTemplate} />);

    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(DISCOVER_TEMPLATES.length);

    await user.click(screen.getByRole("button", { name: /Distill meeting notes/ }));
    expect(onUseTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "distill-meeting-notes" }),
    );
  });

  it("narrows the grid to the selected category tab", async () => {
    const user = userEvent.setup();
    render(<DiscoverGrid onUseTemplate={vi.fn()} />);

    const tablist = screen.getByRole("tablist", { name: "Starting point categories" });
    await user.click(within(tablist).getByRole("tab", { name: "Engineering" }));

    expect(within(tablist).getByRole("tab", { name: "Engineering" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: /Review a pull request/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Debug a failing test/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Distill meeting notes/ })).not.toBeInTheDocument();
  });

  it("filters by search text and shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<DiscoverGrid onUseTemplate={vi.fn()} />);

    await user.type(screen.getByLabelText("Search starting points"), "investor");
    expect(screen.getByRole("button", { name: /Draft an investor update/ })).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);

    await user.type(screen.getByLabelText("Search starting points"), "-zzz");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing matches that search yet");
  });

  it("has no axe violations", async () => {
    const { container } = render(<DiscoverGrid onUseTemplate={vi.fn()} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
