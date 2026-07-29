import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const themeSource = readFileSync(path.join(process.cwd(), "src/components/ui/theme.css"), "utf8");

interface Declaration {
  readonly property: string;
  readonly value: string;
}

/**
 * Collects every custom-property declaration in source order. The parser is
 * intentionally simple: the theme contract is a flat list of custom properties,
 * so a declaration is `--name: value;` and nothing else.
 */
function readDeclarations(source: string): readonly Declaration[] {
  const declarations: Declaration[] = [];
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

  for (const match of source.matchAll(pattern)) {
    const [, property, value] = match;

    if (property && value) {
      declarations.push({ property, value: value.trim() });
    }
  }

  return declarations;
}

const declarations = readDeclarations(themeSource);

function declarationsFor(property: string): readonly Declaration[] {
  return declarations.filter((declaration) => declaration.property === property);
}

function valueOf(property: string): string {
  const matches = declarationsFor(property);

  if (matches.length !== 1) {
    throw new Error(`${property} must be declared exactly once, found ${matches.length}`);
  }

  return matches[0]!.value;
}

function scaleValues(prefix: string, names: readonly string[]): readonly string[] {
  return names.map((name) => valueOf(`${prefix}${name}`));
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;

  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error(`${hex} is not a six-digit sRGB hex color`);
  }

  const [red, green, blue] = [0, 2, 4].map((offset) =>
    channelToLinear(Number.parseInt(normalized.slice(offset, offset + 2), 16)),
  ) as [number, number, number];

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

const lockedTokens = {
  "--canvas": "#FFFFFF",
  "--surface": "#FFFFFF",
  "--surface-muted": "#F5F5F5",
  "--text-primary": "#000000",
  "--text-secondary": "#525252",
  "--brand-primary": "#000000",
  "--brand-primary-hover": "#262626",
  "--brand-primary-active": "#404040",
  "--border-control": "#737373",
  "--border-subtle": "#D4D4D4",
  "--focus-ring-color": "#000000",
  "--success-foreground": "#000000",
  "--success-background": "#F7F7F7",
  "--success-border": "#737373",
  "--warning-foreground": "#000000",
  "--warning-background": "#EFEFEF",
  "--warning-border": "#525252",
  "--danger-foreground": "#000000",
  "--danger-background": "#E8E8E8",
  "--danger-border": "#000000",
  "--info-foreground": "#000000",
  "--info-background": "#F5F5F5",
  "--info-border": "#737373",
} as const satisfies Record<string, string>;

const WHITE = "#FFFFFF";

const contrastContract = [
  { foreground: "--text-primary", background: "--canvas", minimum: 4.5, measured: 21 },
  { foreground: "--text-secondary", background: "--canvas", minimum: 4.5, measured: 7.81 },
  { foreground: WHITE, background: "--brand-primary", minimum: 4.5, measured: 21 },
  { foreground: "--brand-primary", background: "--canvas", minimum: 4.5, measured: 21 },
  { foreground: "--border-control", background: "--canvas", minimum: 3, measured: 4.74 },
  {
    foreground: "--success-foreground",
    background: "--success-background",
    minimum: 4.5,
    measured: 19.6,
  },
  {
    foreground: "--warning-foreground",
    background: "--warning-background",
    minimum: 4.5,
    measured: 18.26,
  },
  {
    foreground: "--danger-foreground",
    background: "--danger-background",
    minimum: 4.5,
    measured: 17.14,
  },
  {
    foreground: "--info-foreground",
    background: "--info-background",
    minimum: 4.5,
    measured: 19.26,
  },
] as const;

function resolveColor(reference: string): string {
  return reference.startsWith("--") ? valueOf(reference) : reference;
}

const lockedSpacing = [
  "4px",
  "8px",
  "12px",
  "16px",
  "24px",
  "32px",
  "40px",
  "48px",
  "64px",
  "96px",
];
const lockedRadii = ["0px", "2px", "4px", "8px"];
const lockedTypeSizes = ["12px", "14px", "16px", "18px", "24px", "32px", "44px"];
const lockedDurations = ["120ms", "160ms", "180ms", "220ms"];

describe("pure monochrome semantic tokens", () => {
  it("declares every locked token exactly once with its approved value", () => {
    for (const [property, expectedValue] of Object.entries(lockedTokens)) {
      expect(declarationsFor(property), `${property} declaration count`).toHaveLength(1);
      expect(valueOf(property).toUpperCase(), property).toBe(expectedValue);
    }
  });

  it("defines a single light token set with no dark variant", () => {
    expect(themeSource).not.toMatch(/\.dark\b/);
    expect(themeSource).not.toMatch(/prefers-color-scheme/);
  });

  it("does not declare a panel shadow", () => {
    expect(themeSource).not.toMatch(/--panel-shadow\s*:/);
    expect(themeSource).not.toMatch(/--shadow-panel\s*:/);
  });

  it.each(contrastContract)(
    "keeps $foreground on $background at or above $minimum:1",
    ({ foreground, background, minimum, measured }) => {
      const ratio = contrastRatio(resolveColor(foreground), resolveColor(background));

      expect(ratio).toBeGreaterThanOrEqual(minimum);
      expect(ratio).toBeCloseTo(measured, 1);
    },
  );
});

describe("pure monochrome scales", () => {
  it("exposes the locked spacing scale with no duplicate step", () => {
    const values = scaleValues("--spacing-", [
      "1",
      "2",
      "3",
      "4",
      "6",
      "8",
      "10",
      "12",
      "16",
      "24",
    ]);

    expect(values).toEqual(lockedSpacing);
    expect(new Set(values).size).toBe(lockedSpacing.length);
  });

  it("exposes the locked radius scale plus a pill radius", () => {
    const values = scaleValues("--radius-", ["xs", "sm", "md", "lg"]);

    expect(values).toEqual(lockedRadii);
    expect(new Set(values).size).toBe(lockedRadii.length);
    expect(valueOf("--radius-pill")).toBe("9999px");
    expect(valueOf("--radius")).toBe("4px");
  });

  it("exposes the locked type scale with no duplicate size", () => {
    const values = scaleValues("--text-", ["xs", "sm", "base", "lg", "2xl", "3xl", "5xl"]);

    expect(values).toEqual(lockedTypeSizes);
    expect(new Set(values).size).toBe(lockedTypeSizes.length);
  });

  it("bounds micro-interactions and overlays to the approved durations", () => {
    const values = scaleValues("--duration-", [
      "micro-min",
      "micro-max",
      "overlay-min",
      "overlay-max",
    ]);

    expect(values).toEqual(lockedDurations);
    expect(new Set(values).size).toBe(lockedDurations.length);
  });

  it("declares the approved two-pixel focus indicator", () => {
    expect(valueOf("--focus-ring-width")).toBe("2px");
    expect(valueOf("--focus-ring-offset")).toBe("2px");
    expect(valueOf("--focus-ring-color").toUpperCase()).toBe("#000000");
  });

  it("declares overlay elevation without a panel shadow", () => {
    expect(valueOf("--overlay-shadow")).toBe("0 16px 48px rgb(0 0 0 / 18%)");
  });
});

describe("pure monochrome accessibility media contracts", () => {
  it("reduces motion without removing state feedback", () => {
    expect(themeSource).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeSource).toMatch(/--tw-enter-translate-y:\s*0/);
    expect(themeSource).toMatch(/--tw-exit-translate-y:\s*0/);
  });

  it("keeps focus, selection, and control borders visible in forced colors", () => {
    expect(themeSource).toContain("@media (forced-colors: active)");
    expect(themeSource).toMatch(/forced-color-adjust|Highlight|CanvasText|ButtonBorder/);
  });

  it("maps semantic tokens into Tailwind utilities through an inline theme", () => {
    expect(themeSource).toContain("@theme inline");
    expect(valueOf("--color-canvas")).toBe("var(--canvas)");
    expect(valueOf("--color-ink")).toBe("var(--text-primary)");
    expect(valueOf("--color-brand")).toBe("var(--brand-primary)");
  });
});
