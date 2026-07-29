import type { AppEnvironment } from "@/config/env/schema";

export const CORE_COMPONENTS = [
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
] as const;

export const PRODUCT_COMPONENTS = [
  "LifecycleSteps",
  "ConfirmationCard",
  "EvidenceLabel",
  "PromptPanel",
  "QuestionChoice",
  "ToolSelector",
  "UsageMeter",
  "RiskWarning",
] as const;

export type CoreComponentName = (typeof CORE_COMPONENTS)[number];
export type ProductComponentName = (typeof PRODUCT_COMPONENTS)[number];

export interface GallerySection {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly components: readonly string[];
  readonly keyboardNote: string | null;
}

export const GALLERY_SECTIONS = [
  {
    id: "tokens",
    title: "Tokens",
    description: "Pure monochrome semantic colors, type, spacing, and motion.",
    components: ["TokenSwatches", "Typography", "Spacing", "Radius", "Elevation", "Focus"],
    keyboardNote: null,
  },
  {
    id: "core",
    title: "Core components",
    description: "Accessible primitives owned under src/components/ui.",
    components: CORE_COMPONENTS,
    keyboardNote:
      "Tabs: Arrow keys move selection. Dialog/Sheet/AlertDialog: Escape closes and restores focus. Dropdown: Enter/Space opens, arrows move items.",
  },
  {
    id: "product",
    title: "Product components",
    description: "Stateless product presentation owned under src/components/product.",
    components: PRODUCT_COMPONENTS,
    keyboardNote:
      "QuestionChoice/ToolSelector: arrow keys change the selected radio. RiskWarning confirmation requires an explicit confirm action.",
  },
] as const satisfies readonly GallerySection[];

export function isDesignSystemAvailable(appEnvironment: AppEnvironment["APP_ENV"]): boolean {
  return appEnvironment !== "production";
}

/** Synthetic fixture copy only — no customer, email, token, or production URL content. */
export const GALLERY_FIXTURES = {
  longText:
    "This is intentionally long gallery copy that must remain fully visible without truncation so operators can verify wrapping across narrow and wide viewports without guessing.",
  prompt: "Draft a review checklist for an accessibility pass on a personal project homepage.",
  expectedResult: "A short checklist an operator can follow without external tools.",
  acceptance: ["Keyboard reaches every control", "Focus is never obscured"] as const,
  errorMessage: "Synthetic gallery error. No real file was uploaded.",
} as const;
