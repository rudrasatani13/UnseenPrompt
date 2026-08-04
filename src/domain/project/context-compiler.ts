import {
  CONTEXT_PREFERENCE_FIELDS,
  CONTEXT_TOKEN_ESTIMATOR,
  ContextCompilationError,
  canonicalContextSortKeyV1,
  canonicalSummaryKindKeyV1,
  canonicalUuidKeyV1,
  DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
  DEFAULT_CONTEXT_MAX_UTF8_BYTES,
  MAX_CONTEXT_RECENT_EVIDENCE,
  contextBudgetSchema,
  parseProjectContextInputV1,
  type CompiledProjectContextV1,
  type ContextBudgetInputV1,
  type ContextBudgetV1,
  type ContextDecisionRecordV1,
  type ContextEvidenceRecordV1,
  type ContextMilestoneRecordV1,
  type ContextOmissionV1,
  type ContextPreferenceField,
  type ContextPreferencesV1,
  type ContextRequirementRecordV1,
  type ContextSummaryRecordV1,
  type ProjectContextDocumentV1,
  type ProjectContextInputV1,
} from "./context";
import { PROJECT_CONTEXT_SCHEMA, PROJECT_SCHEMA_VERSION, ProjectDomainError } from "./contracts";
import { serializeCanonicalJsonV1 } from "./commands";
import type {
  ProjectDecisionV1,
  ProjectJsonValue,
  ProjectMilestoneV1,
  ProjectRequirementV1,
  ProjectSummaryV1,
  RecentEvidenceDescriptorV1,
} from "./contracts";

interface MeasuredContextV1 {
  readonly context: string;
  readonly utf8Bytes: number;
  readonly estimatedTokens: number;
}

interface NormalizedContextInputV1 extends ProjectContextInputV1 {
  readonly requirements: readonly ProjectRequirementV1[];
  readonly decisions: readonly ProjectDecisionV1[];
  readonly activeMilestone: ProjectMilestoneV1 | null;
  readonly summaries: readonly ProjectSummaryV1[];
  readonly recentEvidence: readonly RecentEvidenceDescriptorV1[];
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function normalizeJson(value: ProjectJsonValue, ancestors = new Set<object>()): ProjectJsonValue {
  if (typeof value === "string") return normalizeLineEndings(value);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (ancestors.has(value)) throw new Error("cyclic JSON");
  ancestors.add(value);
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeJson(entry, ancestors));
    ancestors.delete(value);
    return normalized;
  }
  const normalized: Record<string, ProjectJsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = normalizeLineEndings(key);
    if (Object.hasOwn(normalized, normalizedKey)) throw new Error("duplicate normalized JSON key");
    normalized[normalizedKey] = normalizeJson(entry, ancestors);
  }
  ancestors.delete(value);
  return normalized;
}

function normalizedNullable(value: string | null): string | null {
  return value === null ? null : normalizeLineEndings(value);
}

function normalizeRequirement(row: ProjectRequirementV1): ProjectRequirementV1 {
  return {
    ...row,
    category: normalizeLineEndings(row.category),
    statement: normalizeLineEndings(row.statement),
    rationale: normalizedNullable(row.rationale),
  };
}

function normalizeDecision(row: ProjectDecisionV1): ProjectDecisionV1 {
  return {
    ...row,
    decisionKey: normalizeLineEndings(row.decisionKey),
    decision: normalizeLineEndings(row.decision),
    rationale: normalizedNullable(row.rationale),
  };
}

function normalizeMilestone(row: ProjectMilestoneV1): ProjectMilestoneV1 {
  return {
    ...row,
    title: normalizeLineEndings(row.title),
    description: normalizedNullable(row.description),
    blockedReason: normalizedNullable(row.blockedReason),
  };
}

function normalizeSummary(row: ProjectSummaryV1): ProjectSummaryV1 {
  return {
    ...row,
    summaryKind: normalizeLineEndings(row.summaryKind),
    summaryText: normalizeLineEndings(row.summaryText),
    structuredFacts: normalizeJson(row.structuredFacts),
  };
}

function normalizeEvidence(row: RecentEvidenceDescriptorV1): RecentEvidenceDescriptorV1 {
  return {
    ...row,
    kind: normalizeLineEndings(row.kind),
    summary: normalizeLineEndings(row.summary),
    evidenceLabel: normalizedNullable(row.evidenceLabel),
  };
}

function normalizePreferences(
  preferences: NonNullable<ProjectContextInputV1["effectivePreferences"]>,
): NonNullable<ProjectContextInputV1["effectivePreferences"]> {
  const preferredStack = Object.fromEntries(
    Object.entries(preferences.preferredStack.value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [key, normalizeLineEndings(value)]),
  );
  const codingStyle = { ...preferences.codingStyle.value };
  return {
    skillLevel: { ...preferences.skillLevel },
    preferredStackBehavior: { ...preferences.preferredStackBehavior },
    preferredStack: { ...preferences.preferredStack, value: preferredStack },
    codingStyle: { ...preferences.codingStyle, value: codingStyle },
    deploymentPreference: { ...preferences.deploymentPreference },
  };
}

function normalizeInput(input: ProjectContextInputV1): NormalizedContextInputV1 {
  const parsed = parseProjectContextInputV1(input);
  try {
    return {
      ...parsed,
      blockerSummary: normalizedNullable(parsed.blockerSummary),
      requirements: parsed.requirements.map(normalizeRequirement),
      decisions: parsed.decisions.map(normalizeDecision),
      activeMilestone:
        parsed.activeMilestone === null ? null : normalizeMilestone(parsed.activeMilestone),
      effectivePreferences:
        parsed.effectivePreferences === null
          ? null
          : normalizePreferences(parsed.effectivePreferences),
      summaries: parsed.summaries.map(normalizeSummary),
      recentEvidence: parsed.recentEvidence.map(normalizeEvidence),
    };
  } catch {
    throw new ProjectDomainError("validation_failed");
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortKey(value: string): string {
  return canonicalContextSortKeyV1(value);
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareRequirements(left: ProjectRequirementV1, right: ProjectRequirementV1): number {
  return (
    compareStrings(sortKey(left.category), sortKey(right.category)) ||
    timestamp(left.confirmedAt ?? "") - timestamp(right.confirmedAt ?? "") ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function compareDecisions(left: ProjectDecisionV1, right: ProjectDecisionV1): number {
  return (
    compareStrings(sortKey(left.decisionKey), sortKey(right.decisionKey)) ||
    timestamp(left.confirmedAt ?? "") - timestamp(right.confirmedAt ?? "") ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function compareSummaries(left: ProjectSummaryV1, right: ProjectSummaryV1): number {
  return (
    compareStrings(
      canonicalSummaryKindKeyV1(left.summaryKind),
      canonicalSummaryKindKeyV1(right.summaryKind),
    ) ||
    right.version - left.version ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function compareEvidence(
  left: RecentEvidenceDescriptorV1,
  right: RecentEvidenceDescriptorV1,
): number {
  return (
    timestamp(right.occurredAt) - timestamp(left.occurredAt) ||
    compareStrings(canonicalUuidKeyV1(left.id), canonicalUuidKeyV1(right.id))
  );
}

function requirementRecord(row: ProjectRequirementV1): ContextRequirementRecordV1 {
  return {
    id: row.id,
    category: row.category,
    statement: row.statement,
    rationale: row.rationale,
    confirmedAt: row.confirmedAt as string,
  };
}

function decisionRecord(row: ProjectDecisionV1): ContextDecisionRecordV1 {
  return {
    id: row.id,
    decisionKey: row.decisionKey,
    decision: row.decision,
    rationale: row.rationale,
    confirmedAt: row.confirmedAt as string,
  };
}

function milestoneRecord(row: ProjectMilestoneV1): ContextMilestoneRecordV1 {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    description: row.description,
    suggestedStatus: row.suggestedStatus,
    confirmedStatus: row.confirmedStatus,
    confirmationEventId: row.confirmationEventId,
    blockedReason: row.blockedReason,
  };
}

function summaryRecord(row: ProjectSummaryV1): ContextSummaryRecordV1 {
  return {
    id: row.id,
    summaryKind: row.summaryKind,
    version: row.version,
    basedOnEventSequence: row.basedOnEventSequence,
    summaryText: row.summaryText,
    structuredFacts: row.structuredFacts,
  };
}

function evidenceRecord(row: RecentEvidenceDescriptorV1): ContextEvidenceRecordV1 {
  return {
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    occurredAt: row.occurredAt,
    evidenceLabel: row.evidenceLabel,
  };
}

function emptyPreferences(input: NormalizedContextInputV1): ContextPreferencesV1 | null {
  return input.effectivePreferences === null ? null : {};
}

function mandatoryDocument(
  input: NormalizedContextInputV1,
  requirements: readonly ContextRequirementRecordV1[],
  decisions: readonly ContextDecisionRecordV1[],
): ProjectContextDocumentV1 {
  return {
    mode: input.mode,
    stage: input.stage,
    stateVersion: input.stateVersion,
    selectedTool: input.selectedTool,
    requirements,
    decisions,
    activeMilestone: input.activeMilestone === null ? null : milestoneRecord(input.activeMilestone),
    preferences: emptyPreferences(input),
    summaries: [],
    recentEvidence: [],
    blockerSummary: input.blockerSummary,
  };
}

function measureDocument(document: ProjectContextDocumentV1): MeasuredContextV1 {
  const context = serializeCanonicalJsonV1(document);
  const utf8Bytes = new TextEncoder().encode(context).byteLength;
  return {
    context,
    utf8Bytes,
    estimatedTokens: Math.ceil(utf8Bytes / 4),
  };
}

function resolveBudget(input: ContextBudgetInputV1 | undefined): ContextBudgetV1 {
  if (input === undefined) {
    return {
      maxUtf8Bytes: DEFAULT_CONTEXT_MAX_UTF8_BYTES,
      maxEstimatedTokens: DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS,
    };
  }
  const parsed = contextBudgetSchema.safeParse(input);
  if (!parsed.success) throw new ContextCompilationError("context_budget_invalid", null);
  const maxUtf8Bytes = parsed.data.maxUtf8Bytes ?? DEFAULT_CONTEXT_MAX_UTF8_BYTES;
  const maxEstimatedTokens = parsed.data.maxEstimatedTokens ?? DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS;
  if (
    maxUtf8Bytes < 1 ||
    maxEstimatedTokens < 1 ||
    maxUtf8Bytes > DEFAULT_CONTEXT_MAX_UTF8_BYTES ||
    maxEstimatedTokens > DEFAULT_CONTEXT_MAX_ESTIMATED_TOKENS
  ) {
    throw new ContextCompilationError("context_budget_invalid", null);
  }
  return { maxUtf8Bytes, maxEstimatedTokens };
}

function fits(measured: MeasuredContextV1, budget: ContextBudgetV1): boolean {
  return (
    measured.utf8Bytes <= budget.maxUtf8Bytes &&
    measured.estimatedTokens <= budget.maxEstimatedTokens
  );
}

function omission(
  section: ContextOmissionV1["section"],
  selector: string,
  reason: ContextOmissionV1["reason"],
  extras: Omit<ContextOmissionV1, "section" | "selector" | "reason"> = {},
): ContextOmissionV1 {
  return { section, selector, reason, ...extras };
}

/**
 * Compile a previously validated canonical project snapshot into deterministic provider-neutral
 * context. This function has no database, provider, model, tokenizer, or summarization dependency.
 */
export function compileProjectContextV1(
  rawInput: ProjectContextInputV1,
  rawBudget?: ContextBudgetInputV1,
): CompiledProjectContextV1 {
  const input = normalizeInput(rawInput);
  const budget = resolveBudget(rawBudget);
  const requirements = input.requirements
    .filter((row) => row.status === "confirmed")
    .sort(compareRequirements)
    .map(requirementRecord);
  const decisions = input.decisions
    .filter((row) => row.status === "confirmed")
    .sort(compareDecisions)
    .map(decisionRecord);
  let document = mandatoryDocument(input, requirements, decisions);
  let measured = measureDocument(document);

  if (!fits(measured, budget)) {
    throw new ContextCompilationError("confirmed_invariants_exceed_budget", {
      requiredUtf8Bytes: measured.utf8Bytes,
      requiredEstimatedTokens: measured.estimatedTokens,
      ...budget,
    });
  }

  const omittedOptional: ContextOmissionV1[] = [];
  const includedPreferenceFields: ContextPreferenceField[] = [];
  const includedSummaryIds: string[] = [];
  const includedEvidenceIds: string[] = [];

  if (input.effectivePreferences !== null) {
    for (const field of CONTEXT_PREFERENCE_FIELDS) {
      const candidatePreferences = {
        ...(document.preferences ?? {}),
        [field]: input.effectivePreferences[field],
      } as ContextPreferencesV1;
      const candidateDocument = { ...document, preferences: candidatePreferences };
      const candidateMeasured = measureDocument(candidateDocument);
      if (fits(candidateMeasured, budget)) {
        document = candidateDocument;
        measured = candidateMeasured;
        includedPreferenceFields.push(field);
      } else {
        omittedOptional.push(
          omission("preference", `preference:${field}`, "budget_exceeded", { field }),
        );
      }
    }
  }

  const sortedSummaries = [...input.summaries].sort(compareSummaries);
  const currentSummaries = sortedSummaries.filter((summary) => summary.status === "current");
  const eligibleSummaries = currentSummaries.filter(
    (summary) => summary.basedOnEventSequence <= input.stateVersion,
  );
  for (const summary of sortedSummaries) {
    if (summary.status !== "current") {
      omittedOptional.push(
        omission("summary", `summary:${summary.id}:${summary.summaryKind}`, "not_current", {
          id: summary.id,
          kind: summary.summaryKind,
        }),
      );
    } else if (summary.basedOnEventSequence > input.stateVersion) {
      omittedOptional.push(
        omission(
          "summary",
          `summary:${summary.id}:${summary.summaryKind}`,
          "future_state_version",
          {
            id: summary.id,
            kind: summary.summaryKind,
          },
        ),
      );
    }
  }
  for (const summary of eligibleSummaries) {
    const candidateDocument = {
      ...document,
      summaries: [...document.summaries, summaryRecord(summary)],
    };
    const candidateMeasured = measureDocument(candidateDocument);
    if (fits(candidateMeasured, budget)) {
      document = candidateDocument;
      measured = candidateMeasured;
      includedSummaryIds.push(summary.id);
    } else {
      omittedOptional.push(
        omission("summary", `summary:${summary.id}:${summary.summaryKind}`, "budget_exceeded", {
          id: summary.id,
          kind: summary.summaryKind,
        }),
      );
    }
  }

  const sortedEvidence = [...input.recentEvidence].sort(compareEvidence);
  const evidence = sortedEvidence.slice(0, MAX_CONTEXT_RECENT_EVIDENCE);
  for (const excluded of sortedEvidence.slice(MAX_CONTEXT_RECENT_EVIDENCE)) {
    omittedOptional.push(
      omission("evidence", `evidence:${excluded.id}:${excluded.kind}`, "evidence_cap", {
        id: excluded.id,
        kind: excluded.kind,
      }),
    );
  }
  for (const entry of evidence) {
    const candidateDocument = {
      ...document,
      recentEvidence: [...document.recentEvidence, evidenceRecord(entry)],
    };
    const candidateMeasured = measureDocument(candidateDocument);
    if (fits(candidateMeasured, budget)) {
      document = candidateDocument;
      measured = candidateMeasured;
      includedEvidenceIds.push(entry.id);
    } else {
      omittedOptional.push(
        omission("evidence", `evidence:${entry.id}:${entry.kind}`, "budget_exceeded", {
          id: entry.id,
          kind: entry.kind,
        }),
      );
    }
  }

  return {
    schema: PROJECT_CONTEXT_SCHEMA,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    context: measured.context,
    utf8Bytes: measured.utf8Bytes,
    estimatedTokens: measured.estimatedTokens,
    estimator: CONTEXT_TOKEN_ESTIMATOR,
    projectStateVersion: input.stateVersion,
    included: {
      requirementIds: requirements.map((row) => row.id),
      decisionIds: decisions.map((row) => row.id),
      activeMilestoneId: input.activeMilestone?.id ?? null,
      preferenceFields: includedPreferenceFields,
      summaryIds: includedSummaryIds,
      evidenceIds: includedEvidenceIds,
    },
    omittedOptional,
    summaryBoundary: {
      inputCount: input.summaries.length,
      currentCount: currentSummaries.length,
      eligibleCount: eligibleSummaries.length,
      maxBasedOnEventSequence: input.stateVersion,
    },
    evidenceBoundary: {
      inputCount: input.recentEvidence.length,
      cappedCount: evidence.length,
      cap: MAX_CONTEXT_RECENT_EVIDENCE,
    },
    limits: budget,
  };
}
