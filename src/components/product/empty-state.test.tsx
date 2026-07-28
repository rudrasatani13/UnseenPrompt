import { render, screen } from "@testing-library/react";
import { FolderOpenIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";

import { EmptyState } from "@/components/product/empty-state";
import { Button } from "@/components/ui/button";

describe("EmptyState", () => {
  it("renders a semantic heading and description", () => {
    render(
      <EmptyState
        icon={<FolderOpenIcon aria-hidden="true" />}
        title="No projects yet"
        description="Start a new project when you are ready to capture context."
        action={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
    expect(
      screen.getByText("Start a new project when you are ready to capture context."),
    ).toBeVisible();
  });

  it("treats the supplied icon as decorative content inside the empty state", () => {
    const { container } = render(
      <EmptyState
        icon={<FolderOpenIcon data-testid="empty-icon" aria-hidden="true" />}
        title="No projects yet"
        description="Start a new project when you are ready."
        action={null}
      />,
    );

    const icon = screen.getByTestId("empty-icon");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('[data-slot="empty-state"]')).toContainElement(icon);
  });

  it("renders an optional action when supplied", () => {
    render(
      <EmptyState
        icon={<FolderOpenIcon aria-hidden="true" />}
        title="No projects yet"
        description="Start a new project when you are ready."
        action={<Button type="button">New project</Button>}
      />,
    );

    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
  });

  it("omits action chrome when action is null", () => {
    const { container } = render(
      <EmptyState
        icon={<FolderOpenIcon aria-hidden="true" />}
        title="No projects yet"
        description="Start a new project when you are ready."
        action={null}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty-state-action"]')).toBeNull();
  });

  it("keeps long copy fully visible without truncation", () => {
    const longTitle =
      "There are no saved projects matching this very long explanatory empty-state title";
    const longDescription =
      "This empty state intentionally keeps the entire explanation visible so operators can understand what is missing without guessing or opening another surface.";

    render(
      <EmptyState
        icon={<FolderOpenIcon aria-hidden="true" />}
        title={longTitle}
        description={longDescription}
        action={null}
      />,
    );

    expect(screen.getByText(longTitle).className).not.toMatch(/truncate|line-clamp/);
    expect(screen.getByText(longDescription).className).not.toMatch(/truncate|line-clamp/);
  });

  it("does not invent a link destination or action of its own", () => {
    const { container } = render(
      <EmptyState
        icon={<FolderOpenIcon aria-hidden="true" />}
        title="No projects yet"
        description="Start a new project when you are ready."
        action={null}
      />,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <EmptyState
          icon={<FolderOpenIcon aria-hidden="true" />}
          title="No projects yet"
          description="Start a new project when you are ready to capture context."
          action={<Button type="button">New project</Button>}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
