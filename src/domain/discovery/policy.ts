import {
  DISCOVERY_ANSWER_SOURCES,
  DISCOVERY_QUESTION_STATUSES,
  DISCOVERY_POLICY_VERSION,
  DISCOVERY_SESSION_STATUSES,
  DiscoveryDomainError,
  type DiscoveryAssessmentV1,
  type DiscoveryQuestionV1,
  type DiscoverySessionStatus,
  type DiscoverySessionV1,
  type ProjectMode,
} from "./contracts";
import { MAX_DISCOVERY_ANSWER_UTF8_BYTES, MAX_DISCOVERY_TURNS, utf8ByteLength } from "./schemas";
import {
  isWellFormedUnicodeStringV1,
  normalizeQuestionFingerprintInputV1 as canonicalizeQuestionFingerprintInputV1,
} from "./fingerprint";

export const DISCOVERY_SUFFICIENCY_CONFIDENCE_THRESHOLD = 0.8 as const;
export const DISCOVERY_TURN_LIMIT = MAX_DISCOVERY_TURNS;
export const DISCOVERY_FALLBACK_FACT_KEY = "clarify_scope" as const;

export const DISCOVERY_FACT_KEYS_BY_MODE = Object.freeze({
  new_build: Object.freeze([
    "audience",
    "problem",
    "desired_outcome",
    "core_scope",
    "constraints",
    "success_criteria",
  ] as const),
  feature: Object.freeze([
    "current_system",
    "desired_change",
    "user_value",
    "integration_constraints",
    "acceptance_criteria",
  ] as const),
  bug: Object.freeze([
    "observed_behavior",
    "expected_behavior",
    "reproduction",
    "environment",
    "impact",
    "regression_expectation",
  ] as const),
  review: Object.freeze([
    "review_target",
    "review_dimension",
    "current_context",
    "constraints",
    "expected_output",
  ] as const),
  test: Object.freeze([
    "system_under_test",
    "test_scope",
    "current_coverage",
    "environment",
    "success_criteria",
  ] as const),
  deploy: Object.freeze([
    "deployable_artifact",
    "target_environment",
    "current_pipeline",
    "release_constraints",
    "rollback",
    "verification",
  ] as const),
  improve: Object.freeze([
    "improvement_target",
    "baseline_problem",
    "desired_metric",
    "constraints",
    "success_criteria",
  ] as const),
} as const);

export type DiscoveryFactKey = (typeof DISCOVERY_FACT_KEYS_BY_MODE)[ProjectMode][number];

export const DISCOVERY_FACT_POLICY = Object.freeze({
  version: DISCOVERY_POLICY_VERSION,
  keysByMode: DISCOVERY_FACT_KEYS_BY_MODE,
});

export function getRequiredFactKeysV1(mode: ProjectMode): readonly DiscoveryFactKey[] {
  const keys = DISCOVERY_FACT_KEYS_BY_MODE[mode];
  if (keys === undefined) throw new DiscoveryDomainError("invalid_missing_fact");
  return keys;
}

export function isAllowedFactKeyV1(mode: ProjectMode, key: string): boolean {
  return key === DISCOVERY_FALLBACK_FACT_KEY || isKnownFactKeyV1(mode, key);
}

/**
 * Missing facts are intentionally not fuzzy-mapped. The model may only select an exact key from
 * the mode's code-owned taxonomy. The nested arrays are deeply frozen so callers cannot mutate policy
 * order or add arbitrary keys at runtime.
 */
export function normalizeMissingFactKeysV1(
  mode: ProjectMode,
  missingFacts: readonly string[],
): readonly DiscoveryFactKey[] {
  if (!Array.isArray(missingFacts)) throw new DiscoveryDomainError("invalid_missing_fact");
  const allowed = getRequiredFactKeysV1(mode);
  const allowedSet = new Set<string>(allowed);
  const seen = new Set<string>();
  for (const raw of missingFacts) {
    if (typeof raw !== "string") throw new DiscoveryDomainError("invalid_missing_fact");
    const key = raw.trim();
    if (!allowedSet.has(key) || seen.has(key)) {
      throw new DiscoveryDomainError("invalid_missing_fact");
    }
    seen.add(key);
  }
  return allowed.filter((key) => seen.has(key));
}

export function isKnownFactKeyV1(mode: ProjectMode, key: string): key is DiscoveryFactKey {
  return getRequiredFactKeysV1(mode).includes(key as DiscoveryFactKey);
}

export interface DiscoverySufficiencyPolicyInputV1 {
  readonly mode: ProjectMode;
  readonly sessionStatus: DiscoverySessionStatus;
  readonly stage: string;
  readonly currentStateVersion: number;
  readonly basisStateVersion: number;
  readonly assessment: Pick<
    DiscoveryAssessmentV1,
    "isSufficient" | "confidence" | "missingFactKeys"
  >;
  readonly confirmedInputCount: number;
  readonly activeQuestionId: string | null;
  readonly confirmedTurnCount: number;
}

export interface DiscoverySufficiencyPolicyResultV1 {
  readonly passed: boolean;
  readonly status: "sufficient" | "insufficient" | "blocked";
  readonly policyPassed: boolean;
  readonly normalizedMissingFacts: readonly string[];
  readonly nextFactKey: string | null;
  readonly failureCode:
    | "invalid_discovery_state"
    | "stale_state_version"
    | "active_question_exists"
    | "invalid_missing_fact"
    | "sufficiency_policy_failed"
    | "discovery_turn_limit_reached"
    | null;
}

function failed(
  code: DiscoverySufficiencyPolicyResultV1["failureCode"],
  status: DiscoverySufficiencyPolicyResultV1["status"] = "insufficient",
  nextFactKey: string | null = null,
): DiscoverySufficiencyPolicyResultV1 {
  return {
    passed: false,
    status,
    policyPassed: false,
    normalizedMissingFacts: [],
    nextFactKey,
    failureCode: code,
  };
}

/**
 * Apply the deterministic gate around the advisory model assessment. The model never controls a
 * lifecycle transition directly; every success path has to pass all of these checks.
 */
export function evaluateDiscoverySufficiencyPolicyV1(
  input: DiscoverySufficiencyPolicyInputV1,
): DiscoverySufficiencyPolicyResultV1 {
  if (
    input.sessionStatus !== "active" ||
    input.stage !== "discovery" ||
    !Number.isSafeInteger(input.currentStateVersion) ||
    input.currentStateVersion < 1 ||
    !Number.isSafeInteger(input.basisStateVersion) ||
    input.basisStateVersion < 1
  ) {
    return failed("invalid_discovery_state");
  }
  if (input.currentStateVersion !== input.basisStateVersion) {
    return failed("stale_state_version");
  }
  if (!Number.isSafeInteger(input.confirmedInputCount) || input.confirmedInputCount < 1) {
    return failed("sufficiency_policy_failed");
  }
  if (
    !Number.isSafeInteger(input.confirmedTurnCount) ||
    input.confirmedTurnCount < 1 ||
    input.confirmedTurnCount > DISCOVERY_TURN_LIMIT
  ) {
    return failed("invalid_discovery_state");
  }
  if (input.activeQuestionId !== null) return failed("active_question_exists");

  let normalizedMissingFacts: readonly DiscoveryFactKey[];
  try {
    normalizedMissingFacts = normalizeMissingFactKeysV1(
      input.mode,
      input.assessment.missingFactKeys,
    );
  } catch {
    return failed("invalid_missing_fact");
  }

  const hasSufficientSignal =
    input.assessment.isSufficient &&
    input.assessment.confidence >= DISCOVERY_SUFFICIENCY_CONFIDENCE_THRESHOLD &&
    normalizedMissingFacts.length === 0;

  if (hasSufficientSignal) {
    return {
      passed: true,
      status: "sufficient",
      policyPassed: true,
      normalizedMissingFacts: [],
      nextFactKey: null,
      failureCode: null,
    };
  }

  if (input.confirmedTurnCount >= DISCOVERY_TURN_LIMIT) {
    return {
      ...failed("discovery_turn_limit_reached", "blocked"),
      normalizedMissingFacts,
    };
  }

  const nextFactKey = normalizedMissingFacts[0] ?? DISCOVERY_FALLBACK_FACT_KEY;
  return {
    passed: false,
    status: "insufficient",
    policyPassed: false,
    normalizedMissingFacts,
    nextFactKey,
    failureCode: "sufficiency_policy_failed",
  };
}

export function selectHighestPriorityMissingFactKeyV1(
  mode: ProjectMode,
  missingFacts: readonly string[],
): string {
  const normalized = normalizeMissingFactKeysV1(mode, missingFacts);
  return normalized[0] ?? DISCOVERY_FALLBACK_FACT_KEY;
}

/** Normalization used for duplicate-question detection; it is deliberately conservative. */
export function normalizeQuestionFingerprintInputV1(value: string): string {
  return canonicalizeQuestionFingerprintInputV1(value);
}

/* A small dependency-free SHA-256 implementation keeps the domain portable in Workers and tests. */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const SHA256_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rightRotate(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function sha256Hex(value: string): string {
  const input = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const bitLength = input.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x1_0000_0000));

  const hash = new Uint32Array(SHA256_H);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) schedule[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index++) {
      const s0 =
        rightRotate(schedule[index - 15]!, 7) ^
        rightRotate(schedule[index - 15]!, 18) ^
        (schedule[index - 15]! >>> 3);
      const s1 =
        rightRotate(schedule[index - 2]!, 17) ^
        rightRotate(schedule[index - 2]!, 19) ^
        (schedule[index - 2]! >>> 10);
      schedule[index] = (schedule[index - 16]! + s0 + schedule[index - 7]! + s1) >>> 0;
    }
    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;
    for (let index = 0; index < 64; index++) {
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sigma1 + choose + SHA256_K[index]! + schedule[index]!) >>> 0;
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

export function questionFingerprintV1(value: string): string {
  return sha256Hex(normalizeQuestionFingerprintInputV1(value));
}

export const fingerprintQuestionV1 = questionFingerprintV1;

export function isQuestionFingerprintConfirmedV1(
  fingerprint: string,
  questions: readonly Pick<DiscoveryQuestionV1, "questionFingerprint" | "status">[],
): boolean {
  return questions.some(
    (question) =>
      (question.status === "active" || question.status === "answered") &&
      question.questionFingerprint.toLowerCase() === fingerprint.toLowerCase(),
  );
}

export function assertQuestionFingerprintAvailableV1(
  fingerprint: string,
  questions: readonly Pick<DiscoveryQuestionV1, "questionFingerprint" | "status">[],
): void {
  if (isQuestionFingerprintConfirmedV1(fingerprint, questions)) {
    throw new DiscoveryDomainError("duplicate_question");
  }
}

export function validateAnswerAgainstQuestionV1(
  question: Pick<DiscoveryQuestionV1, "status" | "suggestedAnswers" | "allowsFreeText">,
  source: (typeof DISCOVERY_ANSWER_SOURCES)[number],
  answerText: string,
): void {
  if (question.status !== "active") throw new DiscoveryDomainError("question_not_active");
  if (!(DISCOVERY_ANSWER_SOURCES as readonly string[]).includes(source)) {
    throw new DiscoveryDomainError("answer_not_allowed");
  }
  if (
    typeof answerText !== "string" ||
    !isWellFormedUnicodeStringV1(answerText) ||
    answerText.trim().length === 0 ||
    utf8ByteLength(answerText) > MAX_DISCOVERY_ANSWER_UTF8_BYTES
  ) {
    throw new DiscoveryDomainError("answer_not_allowed");
  }
  if (source === "free_text" && !question.allowsFreeText) {
    throw new DiscoveryDomainError("answer_not_allowed");
  }
  if (
    source === "suggested" &&
    !question.suggestedAnswers.some((answer) => answer.value === answerText)
  ) {
    throw new DiscoveryDomainError("answer_not_allowed");
  }
}

const draftTransitions: Readonly<Record<string, readonly string[]>> = Object.freeze({
  routing: ["awaiting_confirmation", "retry_required", "abandoned"],
  awaiting_confirmation: ["promoted", "abandoned"],
  retry_required: ["routing", "abandoned"],
  promoted: [],
  abandoned: [],
});

const sessionTransitions: Readonly<Record<string, readonly string[]>> = Object.freeze({
  active: ["sufficient", "completed", "abandoned", "blocked"],
  sufficient: ["completed", "active", "abandoned"],
  completed: [],
  abandoned: ["active"],
  blocked: ["active", "abandoned"],
});

export function isAllowedComposerDraftTransitionV1(
  from: (typeof import("./contracts").COMPOSER_DRAFT_STATUSES)[number],
  to: (typeof import("./contracts").COMPOSER_DRAFT_STATUSES)[number],
): boolean {
  return draftTransitions[from]?.includes(to) ?? false;
}

export function validateComposerDraftTransitionV1(
  from: (typeof import("./contracts").COMPOSER_DRAFT_STATUSES)[number],
  to: (typeof import("./contracts").COMPOSER_DRAFT_STATUSES)[number],
): { readonly ok: true } | { readonly ok: false; readonly code: "invalid_draft_state" } {
  return isAllowedComposerDraftTransitionV1(from, to)
    ? { ok: true }
    : { ok: false, code: "invalid_draft_state" };
}

export function isAllowedDiscoverySessionTransitionV1(
  from: DiscoverySessionStatus,
  to: DiscoverySessionStatus,
): boolean {
  return sessionTransitions[from]?.includes(to) ?? false;
}

export function validateDiscoverySessionTransitionV1(
  session: Pick<DiscoverySessionV1, "status">,
  to: DiscoverySessionStatus,
): { readonly ok: true } | { readonly ok: false; readonly code: "invalid_discovery_state" } {
  if (
    !DISCOVERY_SESSION_STATUSES.includes(session.status) ||
    !isAllowedDiscoverySessionTransitionV1(session.status, to)
  ) {
    return { ok: false, code: "invalid_discovery_state" };
  }
  return { ok: true };
}

export function validateDiscoveryAnswerSuccessorV1(
  predecessor: Pick<
    import("./contracts").DiscoveryAnswerV1,
    "id" | "projectId" | "sessionId" | "questionId" | "status"
  >,
  successor: Pick<
    import("./contracts").DiscoveryAnswerV1,
    "id" | "projectId" | "sessionId" | "questionId" | "status" | "supersedesAnswerId"
  >,
): { readonly ok: true } | { readonly ok: false; readonly code: "invalid_discovery_state" } {
  if (
    predecessor.status !== "confirmed" ||
    successor.status !== "confirmed" ||
    predecessor.id === successor.id ||
    successor.supersedesAnswerId !== predecessor.id ||
    predecessor.projectId !== successor.projectId ||
    predecessor.sessionId !== successor.sessionId ||
    predecessor.questionId !== successor.questionId
  ) {
    return { ok: false, code: "invalid_discovery_state" };
  }
  return { ok: true };
}

export const QUESTION_STATUS_VALUES = DISCOVERY_QUESTION_STATUSES;
