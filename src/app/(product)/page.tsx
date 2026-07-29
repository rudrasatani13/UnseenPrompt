import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LifecycleSteps } from "@/components/product/lifecycle-steps";

const EXAMPLE_PROMPT =
  "Create an accessible project setup flow for a personal web application, including explicit confirmation before any high-risk change.";

const PREVIEW_STEPS = [
  {
    id: "context",
    label: "Capture project context",
    description: "Example step shown for layout only.",
    state: "complete" as const,
  },
  {
    id: "constraints",
    label: "Confirm constraints",
    description: "Not interactive in this preview.",
    state: "current" as const,
  },
  {
    id: "prompt",
    label: "Prepare the next prompt",
    description: "Arrives in a later phase.",
    state: "pending" as const,
  },
] as const;

const TOOL_LABELS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "OpenAI Codex" },
  { id: "cursor", label: "Cursor" },
] as const;

/**
 * Honest public product preview. No inputs, no generation, no account claims.
 * Static presentation only until a later phase adds real workflows.
 */
export default function HomePage() {
  return (
    <div data-slot="product-preview" className="mx-auto grid w-full max-w-[800px] gap-8">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium tracking-wide text-brand uppercase">
            Project planning preview
          </p>
          <Badge variant="secondary">Preview</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink md:text-5xl">
          Keep project decisions together
        </h1>
        <p className="max-w-prose text-base text-ink-muted">
          Prompt generation becomes interactive in a later phase.
        </p>
      </header>

      <section aria-labelledby="preview-request-label" className="grid gap-3">
        <h2 id="preview-request-label" className="text-sm font-semibold text-ink">
          Example project request
        </h2>
        <Card className="border-subtle">
          <CardContent className="pt-6">
            <p className="font-mono text-sm break-words whitespace-pre-wrap text-ink">
              {EXAMPLE_PROMPT}
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="preview-flow-label" className="grid gap-3">
        <h2 id="preview-flow-label" className="text-sm font-semibold text-ink">
          Example workflow shape
        </h2>
        <LifecycleSteps label="Example project lifecycle" steps={PREVIEW_STEPS} />
      </section>

      <section aria-labelledby="preview-tools-label" className="grid gap-3">
        <h2 id="preview-tools-label" className="text-sm font-semibold text-ink">
          Coding tools this product will target
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tool labels (preview only)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {TOOL_LABELS.map((tool) => (
                <li key={tool.id}>
                  <Badge variant="outline">{tool.label}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-muted">
              These labels illustrate future formatting targets. No tool account is connected, and
              no prompt is generated on this page.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
