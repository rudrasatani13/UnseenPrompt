export interface DiscoverTemplate {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: DiscoverCategory;
  /** The rough request placed into the composer when the card is used. */
  readonly requestText: string;
}

export type DiscoverCategory =
  "General" | "Writing" | "Engineering" | "Product" | "Marketing" | "Founder";

export const DISCOVER_CATEGORIES = [
  "Recommended",
  "General",
  "Writing",
  "Engineering",
  "Product",
  "Marketing",
  "Founder",
] as const;

export type DiscoverCategoryFilter = (typeof DISCOVER_CATEGORIES)[number];

/**
 * Curated starting points shown under the composer. These are static fixtures:
 * clicking one prefills the composer; nothing is stored until the person
 * submits their own request.
 */
export const DISCOVER_TEMPLATES: readonly DiscoverTemplate[] = [
  {
    id: "distill-meeting-notes",
    title: "Distill meeting notes",
    description: "Clean up messy notes into a clear summary and next steps.",
    category: "General",
    requestText:
      "Turn my messy meeting notes into a clear summary with decisions, owners, and next steps.",
  },
  {
    id: "summarize-document",
    title: "Summarize a document",
    description: "Get the key points from any long document.",
    category: "General",
    requestText: "Summarize a long document into the key points and what they mean for me.",
  },
  {
    id: "analyze-data",
    title: "Analyze data",
    description: "Make sense of your numbers and spot what changed.",
    category: "General",
    requestText: "Help me analyze this data, call out what changed, and say what to check next.",
  },
  {
    id: "cold-outreach-email",
    title: "Craft a cold outreach email",
    description: "Write a first-touch email people actually respond to.",
    category: "Marketing",
    requestText:
      "Write a short cold outreach email for my service that gives the reader one clear reason to reply.",
  },
  {
    id: "build-prd",
    title: "Build a PRD",
    description: "Turn a rough product idea into a structured requirements doc.",
    category: "Product",
    requestText:
      "Help me turn this rough product idea into a PRD with scope, users, and success criteria.",
  },
  {
    id: "professional-email",
    title: "Draft a professional email",
    description: "Say the hard thing clearly and politely.",
    category: "Writing",
    requestText:
      "Draft a professional email where I need to say something difficult but stay polite.",
  },
  {
    id: "review-pull-request",
    title: "Review a pull request",
    description: "Get a focused review with risks and next steps.",
    category: "Engineering",
    requestText:
      "Review this pull request and list the risks, missing cases, and what to fix first.",
  },
  {
    id: "debug-failing-test",
    title: "Debug a failing test",
    description: "Trace the failure to its cause and fix it.",
    category: "Engineering",
    requestText:
      "Help me debug this failing test: trace the cause and show the smallest correct fix.",
  },
  {
    id: "write-changelog",
    title: "Write a changelog",
    description: "Turn commit history into release notes people read.",
    category: "Writing",
    requestText: "Turn this commit history into a changelog that users can actually read.",
  },
  {
    id: "launch-plan",
    title: "Plan a launch",
    description: "Outline the steps, owners, and risks for a release.",
    category: "Product",
    requestText:
      "Plan the launch for this feature: steps, owners, timing, and what could go wrong.",
  },
  {
    id: "launch-email-campaign",
    title: "Create a launch email campaign",
    description: "Draft a sequence that introduces, proves, and asks.",
    category: "Marketing",
    requestText:
      "Create a three-email launch campaign that introduces the product, shows proof, and asks for the sale.",
  },
  {
    id: "investor-update",
    title: "Draft an investor update",
    description: "Report progress, problems, and asks without padding.",
    category: "Founder",
    requestText:
      "Draft a monthly investor update with progress, problems, and what I need help with.",
  },
];

export function filterDiscoverTemplates(
  category: DiscoverCategoryFilter,
  query: string,
): readonly DiscoverTemplate[] {
  const normalizedQuery = query.trim().toLowerCase();

  return DISCOVER_TEMPLATES.filter((template) => {
    if (category !== "Recommended" && template.category !== category) return false;
    if (normalizedQuery.length === 0) return true;
    return (
      template.title.toLowerCase().includes(normalizedQuery) ||
      template.description.toLowerCase().includes(normalizedQuery)
    );
  });
}
