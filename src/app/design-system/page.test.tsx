import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CORE_COMPONENTS,
  GALLERY_FIXTURES,
  PRODUCT_COMPONENTS,
  isDesignSystemAvailable,
} from "@/app/design-system/gallery-data";
import { metadata } from "@/app/design-system/page";
import { AppProviders } from "@/components/providers/app-providers";

const getServerEnvironment = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/config/env/server", () => ({
  getServerEnvironment: () => getServerEnvironment(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFound(),
}));

describe("isDesignSystemAvailable", () => {
  it.each(["local", "preview", "staging", "test"] as const)("is available in %s", (appEnv) => {
    expect(isDesignSystemAvailable(appEnv)).toBe(true);
  });

  it("is unavailable in production", () => {
    expect(isDesignSystemAvailable("production")).toBe(false);
  });
});

describe("design-system metadata and inventory", () => {
  it("sets noindex, nofollow metadata", () => {
    expect(metadata.title).toBe("Design System");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("includes every core component in the inventory", () => {
    expect([...CORE_COMPONENTS]).toEqual([
      "Button",
      "Input",
      "Textarea",
      "Card",
      "Badge",
      "Separator",
      "Tooltip",
      "ScrollArea",
      "Tabs",
      "Dialog",
      "AlertDialog",
      "Sheet",
      "DropdownMenu",
      "Progress",
      "FileItem",
      "Skeleton",
      "EmptyState",
      "Alert",
      "Toast",
    ]);
  });

  it("includes every product component in the inventory", () => {
    expect([...PRODUCT_COMPONENTS]).toEqual([
      "LifecycleSteps",
      "ConfirmationCard",
      "EvidenceLabel",
      "PromptPanel",
      "QuestionChoice",
      "ToolSelector",
      "UsageMeter",
      "RiskWarning",
    ]);
  });

  it("keeps gallery fixtures free of sensitive-looking content", () => {
    const blob = JSON.stringify(GALLERY_FIXTURES);

    expect(blob).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(blob).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/i);
    expect(blob).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    expect(blob).not.toMatch(/https:\/\/unseenprompt\.com\//i);
    expect(blob).not.toMatch(/customer|acme|real project/i);
  });
});

describe("DesignSystemPage", () => {
  beforeEach(() => {
    getServerEnvironment.mockReset();
    notFound.mockClear();
  });

  it("invokes notFound in production before rendering gallery content", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    const { default: DesignSystemPage } = await import("./page");

    expect(() => render(<DesignSystemPage />)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Design System" })).not.toBeInTheDocument();
  });

  it("renders gallery content outside production", async () => {
    getServerEnvironment.mockReturnValue({
      APP_ENV: "preview",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    const { default: DesignSystemPage } = await import("./page");
    render(
      <AppProviders>
        <DesignSystemPage />
      </AppProviders>,
    );

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Design System" })).toBeInTheDocument();
    expect(screen.getByText(/hidden in production/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Button" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PromptPanel" })).toBeInTheDocument();
  });

  it("does not import features or persist gallery state", () => {
    const clientSource = readFileSync(
      path.join(process.cwd(), "src/app/design-system/gallery-client.tsx"),
      "utf8",
    );

    expect(clientSource).not.toMatch(
      /@\/features|localStorage|sessionStorage|document\.cookie|fetch\(/,
    );
  });
});
