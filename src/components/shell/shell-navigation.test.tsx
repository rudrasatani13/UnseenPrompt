import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { productNavigation } from "@/components/shell/navigation";
import { ShellNavigation } from "@/components/shell/shell-navigation";

describe("ShellNavigation", () => {
  it("exposes a labelled navigation landmark", () => {
    render(<ShellNavigation navigation={productNavigation} />);

    expect(screen.getByRole("navigation", { name: "Product" })).toBeInTheDocument();
  });

  it("preserves the locked order of items", () => {
    render(<ShellNavigation navigation={productNavigation} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(items.map((item) => item.textContent)).toEqual([
      "New Prompt",
      "LibrarySoon",
      "MemoriesSoon",
      "SearchSoon",
      "Profile",
    ]);
  });

  it("links to the available destinations and marks New Prompt as the current page", () => {
    render(<ShellNavigation navigation={productNavigation} />);

    const links = screen.getAllByRole("link");

    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/profile"]);
    expect(screen.getByRole("link", { name: "New Prompt" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
  });

  it("renders unavailable entries as non-interactive text with a visible Soon label", () => {
    render(<ShellNavigation navigation={productNavigation} />);

    for (const label of ["Library", "Memories", "Search"] as const) {
      const row = screen.getByText(label).closest("[data-availability='soon']");

      expect(row).not.toBeNull();
      expect(row?.querySelector("a")).toBeNull();
      expect(within(row as HTMLElement).getByText("Soon")).toBeVisible();
    }
  });

  it("keeps unavailable entries out of the tab order", () => {
    render(<ShellNavigation navigation={productNavigation} />);

    const soonRows = screen
      .getAllByText("Soon")
      .map((node) => node.closest("[data-availability='soon']"));

    for (const row of soonRows) {
      expect(row?.querySelector("a,button,[tabindex]:not([tabindex='-1'])")).toBeNull();
    }
  });

  it("treats navigation icons as decorative", () => {
    const { container } = render(<ShellNavigation navigation={productNavigation} />);
    const icons = container.querySelectorAll("svg");

    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("allows long labels to wrap", () => {
    render(
      <ShellNavigation
        navigation={[
          {
            id: "long",
            label: "Extremely long navigation destination that must remain fully visible",
            icon: productNavigation[0].icon,
            availability: "soon",
            href: null,
            active: false,
          },
        ]}
      />,
    );

    const label = screen.getByText(
      "Extremely long navigation destination that must remain fully visible",
    );

    expect(label.className).toMatch(/break-words/);
    expect(label.className).not.toMatch(/truncate|line-clamp/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <h1>Navigation</h1>
        <ShellNavigation navigation={productNavigation} />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
