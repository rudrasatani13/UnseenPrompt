import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Check } from "@/components/ui/icons/check";
import { ChevronDown } from "@/components/ui/icons/chevron-down";
import { CircleCheckBig } from "@/components/ui/icons/circle-check-big";
import { Copy } from "@/components/ui/icons/copy";
import { Menu } from "@/components/ui/icons/menu";
import { PanelLeftClose } from "@/components/ui/icons/panel-left-close";
import { PanelLeftOpen } from "@/components/ui/icons/panel-left-open";
import { RefreshCw } from "@/components/ui/icons/refresh-cw";
import { Upload } from "@/components/ui/icons/upload";

const iconDirectory = path.join(process.cwd(), "src/components/ui/icons");

/* eslint-disable @typescript-eslint/no-explicit-any */
const curatedIcons = [
  ["Copy", Copy],
  ["Check", Check],
  ["Menu", Menu],
  ["PanelLeftOpen", PanelLeftOpen],
  ["PanelLeftClose", PanelLeftClose],
  ["Upload", Upload],
  ["RefreshCw", RefreshCw],
  ["CircleCheckBig", CircleCheckBig],
  ["ChevronDown", ChevronDown],
] as const satisfies readonly (readonly [string, ComponentType<any>])[];
/* eslint-enable @typescript-eslint/no-explicit-any */

function readSourceFiles(directory: string): readonly { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];

  for (const entry of readdirSync(directory)) {
    const entryPath = path.join(directory, entry);

    if (statSync(entryPath).isDirectory()) {
      files.push(...readSourceFiles(entryPath));
      continue;
    }

    if (entry.endsWith(".md") || entry.endsWith(".test.tsx") || entry.endsWith(".test.ts")) {
      continue;
    }

    files.push({ path: entryPath, source: readFileSync(entryPath, "utf8") });
  }

  return files;
}

describe("curated animated icons", () => {
  it.each(curatedIcons)("renders %s as an identifiable SVG", (name, Icon) => {
    const { container } = render(<Icon data-slot="animated-icon" data-icon={name} size={16} />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("data-slot", "animated-icon");
    expect(svg).toHaveAttribute("data-icon", name);
  });

  it.each(curatedIcons)("hides a decorative %s from the accessibility tree", (_name, Icon) => {
    const { container } = render(<Icon aria-hidden="true" focusable="false" size={16} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("names a state icon only when it carries meaning independently", () => {
    render(<CircleCheckBig role="img" aria-label="Verified" size={16} />);

    expect(screen.getByRole("img", { name: "Verified" })).toBeInTheDocument();
  });

  it.each(curatedIcons)("server-renders %s as a static initial frame", (_name, Icon) => {
    const markup = renderToString(<Icon aria-hidden="true" size={16} />);

    expect(markup).toContain("<svg");
    expect(markup).toContain("</svg>");
  });

  it("renders without any network API available", () => {
    const originalFetch = globalThis.fetch;

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: () => {
        throw new Error("Icons must not perform network requests");
      },
    });

    try {
      for (const [, Icon] of curatedIcons) {
        const { container, unmount } = render(<Icon aria-hidden="true" size={16} />);

        expect(container.querySelector("svg")).not.toBeNull();
        unmount();
      }
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch,
      });
    }
  });
});

describe("animated icon supply-chain boundary", () => {
  const sourceFiles = readSourceFiles(iconDirectory);

  it("keeps every curated icon file inside the owned icon directory", () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(12);

    for (const file of sourceFiles) {
      expect(file.path.startsWith(iconDirectory)).toBe(true);
    }
  });

  it.each([
    "http://",
    "https://",
    "dangerouslySetInnerHTML",
    "eval(",
    "new Function",
    "fetch(",
    "XMLHttpRequest",
    "setInterval(",
  ])("contains no %o in local icon source", (forbidden) => {
    for (const file of sourceFiles) {
      /*
       * The SVG namespace literal is a document declaration, not a runtime
       * request, so it is the single classified exception.
       */
      const auditable = file.source.replaceAll('"http://www.w3.org/2000/svg"', '"svg-namespace"');

      expect(auditable, `${file.path} must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("depends only on React, Motion, and locally owned modules", () => {
    const allowedImports = new Set([
      "react",
      "react-dom",
      "motion/react",
      "@/components/ui/utils",
      "@/components/ui/icons/icon",
      "@/components/ui/icons/animate-slot",
      "@/components/ui/icons/use-is-in-view",
    ]);

    for (const file of sourceFiles) {
      for (const match of file.source.matchAll(/from\s+["']([^"']+)["']/g)) {
        const specifier = match[1] ?? "";
        const resolved = specifier.startsWith(".")
          ? path.join(path.dirname(file.path), specifier)
          : specifier;
        const normalized = specifier.startsWith(".")
          ? `@/components/ui/icons/${path.basename(resolved)}`
          : specifier;

        expect(allowedImports.has(normalized), `${file.path} imports ${specifier}`).toBe(true);
      }
    }
  });
});
