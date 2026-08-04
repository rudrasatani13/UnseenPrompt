import { describe, expect, it } from "vitest";

import { DiscoveryDomainError } from "./contracts";
import {
  DISCOVERY_FACT_KEYS_BY_MODE,
  DISCOVERY_TURN_LIMIT,
  evaluateDiscoverySufficiencyPolicyV1,
  isQuestionFingerprintConfirmedV1,
  normalizeMissingFactKeysV1,
  normalizeQuestionFingerprintInputV1,
  questionFingerprintV1,
  validateAnswerAgainstQuestionV1,
} from "./policy";

describe("discovery policy", () => {
  it("keeps the required fact taxonomy ordered and exact", () => {
    expect(DISCOVERY_FACT_KEYS_BY_MODE.new_build).toEqual([
      "audience",
      "problem",
      "desired_outcome",
      "core_scope",
      "constraints",
      "success_criteria",
    ]);
    expect(normalizeMissingFactKeysV1("new_build", ["success_criteria", " audience "])).toEqual([
      "audience",
      "success_criteria",
    ]);
    expect(() => normalizeMissingFactKeysV1("new_build", ["audience", "audience"])).toThrowError(
      new DiscoveryDomainError("invalid_missing_fact"),
    );
    expect(() => normalizeMissingFactKeysV1("new_build", ["scope"])).toThrowError(
      new DiscoveryDomainError("invalid_missing_fact"),
    );
    expect(Object.isFrozen(DISCOVERY_FACT_KEYS_BY_MODE)).toBe(true);
    expect(Object.isFrozen(DISCOVERY_FACT_KEYS_BY_MODE.new_build)).toBe(true);
    expect(() =>
      (DISCOVERY_FACT_KEYS_BY_MODE.new_build as unknown as string[]).push("unexpected"),
    ).toThrow();
    expect(() => normalizeMissingFactKeysV1("new_build", ["unexpected"])).toThrowError(
      new DiscoveryDomainError("invalid_missing_fact"),
    );
  });

  it("requires the model signal and every deterministic gate", () => {
    const base = {
      mode: "new_build" as const,
      sessionStatus: "active" as const,
      stage: "discovery",
      currentStateVersion: 2,
      basisStateVersion: 2,
      confirmedInputCount: 1,
      activeQuestionId: null,
      confirmedTurnCount: 1,
    };
    expect(
      evaluateDiscoverySufficiencyPolicyV1({
        ...base,
        assessment: { isSufficient: true, confidence: 0.8, missingFactKeys: [] },
      }),
    ).toMatchObject({ passed: true, status: "sufficient" });
    expect(
      evaluateDiscoverySufficiencyPolicyV1({
        ...base,
        assessment: { isSufficient: true, confidence: 0.79, missingFactKeys: [] },
      }),
    ).toMatchObject({ passed: false, nextFactKey: "clarify_scope" });
    expect(
      evaluateDiscoverySufficiencyPolicyV1({
        ...base,
        confirmedTurnCount: DISCOVERY_TURN_LIMIT,
        assessment: { isSufficient: false, confidence: 1, missingFactKeys: ["audience"] },
      }),
    ).toMatchObject({
      passed: false,
      status: "blocked",
      failureCode: "discovery_turn_limit_reached",
    });
    expect(
      evaluateDiscoverySufficiencyPolicyV1({
        ...base,
        basisStateVersion: 1,
        assessment: { isSufficient: true, confidence: 1, missingFactKeys: [] },
      }),
    ).toMatchObject({ failureCode: "stale_state_version" });
  });

  it("uses a canonical SHA-256 question fingerprint and enforces answer source", () => {
    expect(normalizeQuestionFingerprintInputV1("  HELLO\r\n WORLD? ")).toBe("hello world?");
    expect(questionFingerprintV1("hello?")).toBe(
      "b45cf64669f2f8da6c6cc2db0329ec1a37d067b9ab7640c029cfd44eb4bf928a",
    );
    const question = {
      status: "active" as const,
      suggestedAnswers: [{ label: "Yes", value: "yes" }],
      allowsFreeText: false,
    };
    expect(() => validateAnswerAgainstQuestionV1(question, "suggested", "no")).toThrowError(
      "answer_not_allowed",
    );
    expect(() => validateAnswerAgainstQuestionV1(question, "free_text", "anything")).toThrowError(
      "answer_not_allowed",
    );
    expect(() => validateAnswerAgainstQuestionV1(question, "unknown" as never, "yes")).toThrowError(
      "answer_not_allowed",
    );
    expect(() =>
      validateAnswerAgainstQuestionV1(question, "free_text", "é".repeat(8_193)),
    ).toThrowError("answer_not_allowed");
    expect(() => questionFingerprintV1("bad\ud800?")).toThrowError(
      new DiscoveryDomainError("validation_failed"),
    );
    expect(
      isQuestionFingerprintConfirmedV1("a".repeat(64), [
        { questionFingerprint: "a".repeat(64), status: "superseded" },
      ]),
    ).toBe(false);
  });
});
