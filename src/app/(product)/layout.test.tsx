import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerEnvironment = vi.fn();

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => getServerEnvironment(),
}));

function listRelativeFiles(directory: string, base = directory): string[] {
  const entries: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      entries.push(...listRelativeFiles(full, base));
      continue;
    }
    entries.push(path.relative(base, full));
  }

  return entries;
}

describe("ProductLayout", () => {
  beforeEach(() => {
    getServerEnvironment.mockReset();
  });

  it("renders children inside the main workspace when maintenance is off", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    const { default: ProductLayout } = await import("./layout");

    render(
      <ProductLayout>
        <p>Product child content</p>
      </ProductLayout>,
    );

    expect(screen.getByText("Product child content")).toBeVisible();
    expect(screen.getByRole("main")).toContainElement(screen.getByText("Product child content"));
    expect(
      screen.queryByRole("heading", { name: "UnseenPrompt is temporarily unavailable" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New Project" }).length).toBeGreaterThan(0);
  });

  it("replaces product children with maintenance notice when maintenance is on", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "on",
    });

    vi.resetModules();
    const { default: ProductLayout } = await import("./layout");

    render(
      <ProductLayout>
        <p>Product child content</p>
      </ProductLayout>,
    );

    expect(screen.queryByText("Product child content")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "UnseenPrompt is temporarily unavailable" }),
    ).toBeVisible();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New Project" }).length).toBeGreaterThan(0);
  });

  it("does not serialize the environment object into client-visible markup", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_URL: "https://staging.example.test",
      RELEASE_SHA: "secret-release",
      MAINTENANCE_MODE: "off",
    });

    vi.resetModules();
    const { default: ProductLayout } = await import("./layout");
    const { container } = render(
      <ProductLayout>
        <p>Product child content</p>
      </ProductLayout>,
    );

    expect(container.innerHTML).not.toContain("secret-release");
    expect(container.innerHTML).not.toContain("staging.example.test");
    expect(container.innerHTML).not.toContain("MAINTENANCE_MODE");
  });

  it("keeps health and design-system routes outside the product group", () => {
    const productRoot = path.join(process.cwd(), "src/app/(product)");
    const files = listRelativeFiles(productRoot);

    expect(files.some((file) => file.includes("health"))).toBe(false);
    expect(files.some((file) => file.includes("design-system"))).toBe(false);

    expect(statSync(path.join(process.cwd(), "src/app/api/health/route.ts")).isFile()).toBe(true);
    expect(
      statSync(path.join(process.cwd(), "src/app/api/internal/health/workflow/route.ts")).isFile(),
    ).toBe(true);
  });

  it("returns production children without the application shell", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    vi.resetModules();
    const { default: ProductLayout } = await import("./layout");
    render(
      <ProductLayout>
        <p>Production child</p>
      </ProductLayout>,
    );

    expect(screen.getByText("Production child")).toBeVisible();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New Project" })).not.toBeInTheDocument();
  });
});
