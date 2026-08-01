import { describe, expect, it } from "vitest";

import { onboardingAnswersSchema, onboardingSteps } from "@/domain/account/onboarding";

function answers(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    displayName: "Ada",
    skillLevel: "beginner",
    preferredStackBehavior: "recommend",
    preferredStack: {},
    codingStyle: {},
    deploymentPreference: null,
    locale: "en",
    timeZone: "UTC",
    ...overrides,
  };
}

function accepts(overrides: Record<string, unknown>): boolean {
  return onboardingAnswersSchema.safeParse(answers(overrides)).success;
}

describe("onboardingAnswersSchema enums", () => {
  it("accepts every declared skill level and rejects anything else", () => {
    for (const skillLevel of ["beginner", "intermediate", "advanced"]) {
      expect(accepts({ skillLevel })).toBe(true);
    }

    for (const skillLevel of ["expert", "BEGINNER", "", null, 1]) {
      expect(accepts({ skillLevel })).toBe(false);
    }
  });

  it("accepts every declared stack behavior and rejects anything else", () => {
    for (const preferredStackBehavior of ["recommend", "prefer_saved", "ask"]) {
      expect(accepts({ preferredStackBehavior })).toBe(true);
    }

    for (const preferredStackBehavior of ["preferSaved", "decide", null]) {
      expect(accepts({ preferredStackBehavior })).toBe(false);
    }
  });

  it("accepts every declared coding-style value and omits unanswered keys", () => {
    expect(accepts({ codingStyle: {} })).toBe(true);
    expect(accepts({ codingStyle: { comments: "minimal" } })).toBe(true);
    expect(
      accepts({
        codingStyle: { comments: "detailed", testing: "test_first", paradigm: "object_oriented" },
      }),
    ).toBe(true);

    expect(accepts({ codingStyle: { comments: "verbose" } })).toBe(false);
    expect(accepts({ codingStyle: { testing: "tdd" } })).toBe(false);
    expect(accepts({ codingStyle: { paradigm: "procedural" } })).toBe(false);
    expect(accepts({ codingStyle: { tone: "friendly" } })).toBe(false);
  });

  it("accepts the three storable deployment preferences plus null, and rejects undecided", () => {
    for (const deploymentPreference of ["cloudflare", "vercel", "traditional_server", null]) {
      expect(accepts({ deploymentPreference })).toBe(true);
    }

    expect(accepts({ deploymentPreference: "undecided" })).toBe(false);
    expect(accepts({ deploymentPreference: "aws" })).toBe(false);
  });
});

describe("onboardingAnswersSchema display name", () => {
  it("trims and converts an empty answer to null", () => {
    const parsed = onboardingAnswersSchema.parse(answers({ displayName: "  Ada Lovelace  " }));
    expect(parsed.displayName).toBe("Ada Lovelace");

    expect(onboardingAnswersSchema.parse(answers({ displayName: "   " })).displayName).toBeNull();
    expect(onboardingAnswersSchema.parse(answers({ displayName: null })).displayName).toBeNull();
  });

  it("bounds the display name at 120 bytes, not 120 characters", () => {
    expect(accepts({ displayName: "a".repeat(120) })).toBe(true);
    expect(accepts({ displayName: "a".repeat(121) })).toBe(false);

    // "日" is three UTF-8 bytes: 40 fit, 41 do not.
    expect(accepts({ displayName: "日".repeat(40) })).toBe(true);
    expect(accepts({ displayName: "日".repeat(41) })).toBe(false);
  });

  it("counts bytes after trimming", () => {
    expect(accepts({ displayName: `  ${"a".repeat(120)}  ` })).toBe(true);
  });
});

describe("onboardingAnswersSchema locale and time zone", () => {
  it("accepts canonical BCP-47 tags and rejects garbage", () => {
    expect(accepts({ locale: "en" })).toBe(true);
    expect(accepts({ locale: "pt-BR" })).toBe(true);

    expect(accepts({ locale: "not a locale" })).toBe(false);
    expect(accepts({ locale: "en_US!" })).toBe(false);
    expect(accepts({ locale: "" })).toBe(false);
  });

  it("accepts IANA zones and rejects garbage", () => {
    expect(accepts({ timeZone: "Asia/Kolkata" })).toBe(true);
    expect(accepts({ timeZone: "America/New_York" })).toBe(true);
    expect(accepts({ timeZone: "UTC" })).toBe(true);

    expect(accepts({ timeZone: "Mars/Olympus" })).toBe(false);
    expect(accepts({ timeZone: "+05:30" })).toBe(false);
    expect(accepts({ timeZone: "" })).toBe(false);
  });
});

describe("onboardingAnswersSchema preferred stack", () => {
  it("allows a saved stack only when the behavior asks for one", () => {
    expect(
      accepts({ preferredStackBehavior: "prefer_saved", preferredStack: { frontend: "Next.js" } }),
    ).toBe(true);
    expect(accepts({ preferredStackBehavior: "prefer_saved", preferredStack: {} })).toBe(true);

    expect(
      accepts({ preferredStackBehavior: "recommend", preferredStack: { frontend: "Next.js" } }),
    ).toBe(false);
    expect(accepts({ preferredStackBehavior: "ask", preferredStack: { hosting: "Fly" } })).toBe(
      false,
    );
  });

  it("bounds every stack field at 120 bytes and rejects unknown fields", () => {
    const withStack = (preferredStack: Record<string, unknown>) =>
      accepts({ preferredStackBehavior: "prefer_saved", preferredStack });

    expect(withStack({ frontend: "a".repeat(120) })).toBe(true);
    expect(withStack({ frontend: "a".repeat(121) })).toBe(false);
    expect(withStack({ backend: "日".repeat(41) })).toBe(false);
    expect(withStack({ database: "  Postgres  " })).toBe(true);
    expect(withStack({ hosting: "   " })).toBe(false);
    expect(withStack({ mobile: "Expo" })).toBe(false);
  });

  it("trims stack values", () => {
    const parsed = onboardingAnswersSchema.parse(
      answers({
        preferredStackBehavior: "prefer_saved",
        preferredStack: { database: "  Postgres  " },
      }),
    );

    expect(parsed.preferredStack).toEqual({ database: "Postgres" });
  });
});

describe("onboardingAnswersSchema shape", () => {
  it("rejects unknown top-level keys", () => {
    expect(accepts({ ownerId: "11111111-1111-4111-8111-111111111111" })).toBe(false);
    expect(accepts({ onboardingCompletedAt: "2026-08-01T00:00:00.000Z" })).toBe(false);
  });

  it("rejects a payload missing a required answer", () => {
    const withoutSkillLevel = answers();
    delete withoutSkillLevel.skillLevel;

    expect(onboardingAnswersSchema.safeParse(withoutSkillLevel).success).toBe(false);
  });
});

describe("onboardingSteps", () => {
  it("asks the eight questions in the locked order", () => {
    expect(onboardingSteps.map((step) => step.id)).toEqual([
      "displayName",
      "skillLevel",
      "preferredStackBehavior",
      "preferredStack",
      "codingStyle",
      "deploymentPreference",
      "locale",
      "timeZone",
    ]);
  });

  it("gives every choice option a plain-language explanation", () => {
    for (const step of onboardingSteps) {
      if (step.kind === "choice") {
        expect(step.options.length).toBeGreaterThan(0);
        for (const option of step.options) {
          expect(option.label.length).toBeGreaterThan(0);
          expect(option.explanation.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("offers undecided alongside the three storable deployment targets", () => {
    const step = onboardingSteps.find((candidate) => candidate.id === "deploymentPreference");

    expect(step?.kind).toBe("choice");
    expect(step?.kind === "choice" ? step.options.map((option) => option.value) : []).toEqual([
      "cloudflare",
      "vercel",
      "traditional_server",
      "undecided",
    ]);
  });

  it("names the four optional saved-stack fields and the three coding-style questions", () => {
    const stack = onboardingSteps.find((candidate) => candidate.id === "preferredStack");
    expect(stack?.kind === "stackFields" ? stack.fields.map((field) => field.key) : []).toEqual([
      "frontend",
      "backend",
      "database",
      "hosting",
    ]);

    const style = onboardingSteps.find((candidate) => candidate.id === "codingStyle");
    expect(style?.kind === "styleFields" ? style.fields.map((field) => field.key) : []).toEqual([
      "comments",
      "testing",
      "paradigm",
    ]);
  });
});
