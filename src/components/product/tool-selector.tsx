"use client";

import { QuestionChoice, type ChoiceOption } from "@/components/product/question-choice";

export type CodingTool = "claude-code" | "codex" | "cursor";

export interface ToolSelectorProps {
  readonly value: CodingTool;
  readonly onValueChange: (value: CodingTool) => void;
}

/*
 * Descriptions state what the prompt is formatted for. They deliberately claim
 * no integration, installation, authorization, or availability, because Phase 2
 * has none.
 */
export const codingTools = [
  {
    value: "claude-code",
    label: "Claude Code",
    description: "Format the prompt for Anthropic's terminal coding agent.",
    disabled: false,
  },
  {
    value: "codex",
    label: "OpenAI Codex",
    description: "Format the prompt for OpenAI's coding agent.",
    disabled: false,
  },
  {
    value: "cursor",
    label: "Cursor",
    description: "Format the prompt for the Cursor editor.",
    disabled: false,
  },
] as const satisfies readonly ChoiceOption<CodingTool>[];

/**
 * Chooses which coding tool a generated prompt should be written for. It adds no
 * vendor logo, no outbound link, and no availability check.
 */
export function ToolSelector({ value, onValueChange }: ToolSelectorProps) {
  return (
    <QuestionChoice<CodingTool>
      name="coding-tool"
      legend="Which coding tool will use this prompt?"
      value={value}
      options={codingTools}
      onValueChange={onValueChange}
    />
  );
}
