import { useId } from "react";

import { PromptCopyControl } from "@/components/product/prompt-copy-control";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export interface PromptPanelProps {
  readonly prompt: string;
  readonly metadata: string | null;
  readonly expectedResult: string;
  readonly acceptanceCriteria: readonly string[];
  readonly copyText?: (text: string) => Promise<void>;
}

/**
 * Presents a generated prompt, what it is meant to produce, and how to tell
 * whether it worked. Only the copy control is interactive; everything else is
 * static, selectable text.
 *
 * IDs are instance-scoped so multiple panels on one page (e.g. the gallery) do
 * not emit duplicate DOM identifiers.
 */
export function PromptPanel({
  prompt,
  metadata,
  expectedResult,
  acceptanceCriteria,
  copyText,
}: PromptPanelProps) {
  const instanceId = useId();
  const acceptanceHeadingId = `${instanceId}-acceptance`;

  return (
    <Card data-slot="prompt-panel" className="w-full max-w-[800px]">
      <CardHeader>
        <CardTitle>Prompt</CardTitle>
        {metadata === null ? null : <p className="text-sm text-ink-muted">{metadata}</p>}
      </CardHeader>
      <CardContent className="grid gap-4">
        <pre className="overflow-x-auto rounded-md border border-subtle bg-surface-muted p-4 font-mono text-sm break-words whitespace-pre-wrap text-ink">
          {prompt}
        </pre>
        <PromptCopyControl prompt={prompt} {...(copyText === undefined ? {} : { copyText })} />
        <Separator />
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold text-ink">Expected result</h2>
          <p className="text-sm text-ink-muted">{expectedResult}</p>
        </section>
        <section className="grid gap-2">
          <h2 id={acceptanceHeadingId} className="text-sm font-semibold text-ink">
            Acceptance criteria
          </h2>
          <ul aria-labelledby={acceptanceHeadingId} className="grid gap-2 text-sm text-ink">
            {acceptanceCriteria.map((criterion) => (
              <li key={criterion} className="grid grid-cols-[auto_1fr] items-start gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 rounded-pill bg-brand" />
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
