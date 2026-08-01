import { z } from "zod";

import type {
  CodingStyle,
  DeploymentPreference,
  Preferences,
  PreferredStack,
  PreferredStackBehavior,
  ProfilePatch,
  SkillLevel,
} from "@/domain/account/contracts";

/** Matches the `profiles.display_name` and stack-field database constraints, which count bytes. */
export const TEXT_FIELD_MAX_BYTES = 120;

const UTC = "UTC";

/**
 * ICU reports zones under their legacy spellings (`Asia/Calcutta` for `Asia/Kolkata`) and omits
 * `UTC` entirely, so a raw membership test would reject both the modern alias a browser reports
 * and the database default. Resolving through the formatter first normalises the alias; the
 * resolved zone is then required to be one ICU actually supports, which keeps fixed-offset
 * strings such as `+05:30` out.
 */
const SUPPORTED_TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

/** The database counts bytes, not characters, so every caller that shows a budget must too. */
export function textByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function isSupportedLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export function isSupportedTimeZone(value: string): boolean {
  let resolved: string;

  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return false;
  }

  return resolved === UTC || SUPPORTED_TIME_ZONES.has(resolved);
}

const boundedText = z
  .string()
  .trim()
  .min(1)
  .refine((value) => textByteLength(value) <= TEXT_FIELD_MAX_BYTES, {
    message: `must be at most ${TEXT_FIELD_MAX_BYTES} bytes`,
  });

const displayNameSchema = z
  .string()
  .trim()
  .refine((value) => textByteLength(value) <= TEXT_FIELD_MAX_BYTES, {
    message: `must be at most ${TEXT_FIELD_MAX_BYTES} bytes`,
  })
  .nullable()
  .transform((value) => (value === null || value === "" ? null : value));

const skillLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
const preferredStackBehaviorSchema = z.enum(["recommend", "prefer_saved", "ask"]);
const deploymentPreferenceSchema = z.enum(["cloudflare", "vercel", "traditional_server"]);

const preferredStackSchema = z.strictObject({
  frontend: boundedText.optional(),
  backend: boundedText.optional(),
  database: boundedText.optional(),
  hosting: boundedText.optional(),
});

const codingStyleSchema = z.strictObject({
  comments: z.enum(["minimal", "standard", "detailed"]).optional(),
  testing: z.enum(["test_first", "tests_after", "minimal"]).optional(),
  paradigm: z.enum(["functional", "object_oriented", "mixed"]).optional(),
});

const localeSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(isSupportedLocale, { message: "must be a BCP-47 language tag" });

const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(isSupportedTimeZone, { message: "must be an IANA time zone" });

/** Account edits may change any subset of the explicitly user-controlled profile fields. */
export const profilePatchSchema: z.ZodType<ProfilePatch> = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    locale: localeSchema.optional(),
    timeZone: timeZoneSchema.optional(),
  })
  .transform(withoutUndefinedValues);

const preferencesShape = {
  skillLevel: skillLevelSchema,
  preferredStackBehavior: preferredStackBehaviorSchema,
  preferredStack: preferredStackSchema,
  codingStyle: codingStyleSchema,
  deploymentPreference: deploymentPreferenceSchema.nullable(),
};

const preferencesObjectSchema = z.strictObject(preferencesShape);

type PreferencesInput = z.infer<typeof preferencesObjectSchema>;

/**
 * An absent answer must reach jsonb as an absent key rather than an explicit `undefined`, which
 * is also what the exactly-optional domain contracts describe.
 */
function withoutUndefinedValues<T extends object>(
  source: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

/** A saved stack is only meaningful for the behavior that asks for one; the rest must send `{}`. */
function refineSavedStack(
  value: Pick<PreferencesInput, "preferredStackBehavior" | "preferredStack">,
  context: z.RefinementCtx,
): void {
  if (value.preferredStackBehavior === "prefer_saved") {
    return;
  }

  if (Object.keys(value.preferredStack).length > 0) {
    context.addIssue({
      code: "custom",
      path: ["preferredStack"],
      message: "must be empty unless the saved stack is preferred",
    });
  }
}

function toPreferences(value: PreferencesInput): Preferences {
  return {
    skillLevel: value.skillLevel,
    preferredStackBehavior: value.preferredStackBehavior,
    preferredStack: withoutUndefinedValues(value.preferredStack),
    codingStyle: withoutUndefinedValues(value.codingStyle),
    deploymentPreference: value.deploymentPreference,
  };
}

export const preferencesSchema: z.ZodType<Preferences> = preferencesObjectSchema
  .superRefine(refineSavedStack)
  .transform(toPreferences);

export interface OnboardingAnswers {
  readonly displayName: string | null;
  readonly skillLevel: SkillLevel;
  readonly preferredStackBehavior: PreferredStackBehavior;
  readonly preferredStack: PreferredStack;
  readonly codingStyle: CodingStyle;
  readonly deploymentPreference: DeploymentPreference | null;
  readonly locale: string;
  readonly timeZone: string;
}

export const onboardingAnswersSchema: z.ZodType<OnboardingAnswers> = z
  .strictObject({
    displayName: displayNameSchema,
    ...preferencesShape,
    locale: localeSchema,
    timeZone: timeZoneSchema,
  })
  .superRefine(refineSavedStack)
  .transform((value) => ({
    ...toPreferences(value),
    displayName: value.displayName,
    locale: value.locale,
    timeZone: value.timeZone,
  }));

export type OnboardingStepId =
  | "displayName"
  | "skillLevel"
  | "preferredStackBehavior"
  | "preferredStack"
  | "codingStyle"
  | "deploymentPreference"
  | "locale"
  | "timeZone";

export interface OnboardingOption {
  readonly value: string;
  readonly label: string;
  readonly explanation: string;
}

export interface OnboardingTextField {
  readonly key: keyof PreferredStack;
  readonly label: string;
  readonly placeholder: string;
}

export interface OnboardingChoiceField {
  readonly key: keyof CodingStyle;
  readonly label: string;
  readonly options: readonly OnboardingOption[];
}

interface OnboardingStepBase {
  readonly id: OnboardingStepId;
  readonly question: string;
  readonly explanation: string;
}

export type OnboardingStep =
  | (OnboardingStepBase & { readonly kind: "text"; readonly label: string })
  | (OnboardingStepBase & {
      readonly kind: "choice";
      readonly options: readonly OnboardingOption[];
    })
  | (OnboardingStepBase & {
      readonly kind: "stackFields";
      readonly fields: readonly OnboardingTextField[];
    })
  | (OnboardingStepBase & {
      readonly kind: "styleFields";
      readonly fields: readonly OnboardingChoiceField[];
    })
  | (OnboardingStepBase & { readonly kind: "locale"; readonly label: string })
  | (OnboardingStepBase & { readonly kind: "timeZone"; readonly label: string });

export const onboardingSteps: readonly OnboardingStep[] = [
  {
    id: "displayName",
    kind: "text",
    question: "What should we call you?",
    explanation: "Optional. Leave it blank and we’ll skip names entirely.",
    label: "Display name",
  },
  {
    id: "skillLevel",
    kind: "choice",
    question: "How much building have you done before?",
    explanation: "This sets how much a generated prompt explains itself.",
    options: [
      {
        value: "beginner",
        label: "Beginner",
        explanation: "Prompts spell out each step and avoid unexplained jargon.",
      },
      {
        value: "intermediate",
        label: "Intermediate",
        explanation: "Prompts assume you know the basics and stay brief.",
      },
      {
        value: "advanced",
        label: "Advanced",
        explanation: "Prompts skip the tutorial and go straight to the decisions.",
      },
    ],
  },
  {
    id: "preferredStackBehavior",
    kind: "choice",
    question: "How should we pick the tools for a new project?",
    explanation: "You can change this per project later.",
    options: [
      {
        value: "recommend",
        label: "Recommend something for me",
        explanation: "We choose the tools that fit what you described.",
      },
      {
        value: "prefer_saved",
        label: "Use my saved stack",
        explanation: "We start from the tools you list on the next screen.",
      },
      {
        value: "ask",
        label: "Ask me each time",
        explanation: "We pause and let you choose at the start of every project.",
      },
    ],
  },
  {
    id: "preferredStack",
    kind: "stackFields",
    question: "Which tools do you usually reach for?",
    explanation: "All four are optional. Leave anything blank and we’ll pick it for you.",
    fields: [
      { key: "frontend", label: "Frontend", placeholder: "Next.js" },
      { key: "backend", label: "Backend", placeholder: "Node.js" },
      { key: "database", label: "Database", placeholder: "PostgreSQL" },
      { key: "hosting", label: "Hosting", placeholder: "Cloudflare" },
    ],
  },
  {
    id: "codingStyle",
    kind: "styleFields",
    question: "How do you like code written?",
    explanation: "All three are optional. Skip anything you have no opinion about.",
    fields: [
      {
        key: "comments",
        label: "Comments",
        options: [
          { value: "minimal", label: "Minimal", explanation: "Only where the code is surprising." },
          { value: "standard", label: "Standard", explanation: "A short note per tricky block." },
          {
            value: "detailed",
            label: "Detailed",
            explanation: "Explain the intent behind most sections.",
          },
        ],
      },
      {
        key: "testing",
        label: "Testing",
        options: [
          {
            value: "test_first",
            label: "Tests first",
            explanation: "Write the failing test before the code.",
          },
          {
            value: "tests_after",
            label: "Tests after",
            explanation: "Build it, then cover it with tests.",
          },
          {
            value: "minimal",
            label: "Only where it counts",
            explanation: "Test the risky parts and leave the rest.",
          },
        ],
      },
      {
        key: "paradigm",
        label: "Style",
        options: [
          {
            value: "functional",
            label: "Functional",
            explanation: "Plain functions and immutable data.",
          },
          {
            value: "object_oriented",
            label: "Object-oriented",
            explanation: "Classes that own their own state.",
          },
          { value: "mixed", label: "Whatever fits", explanation: "Pick per problem, no rule." },
        ],
      },
    ],
  },
  {
    id: "deploymentPreference",
    kind: "choice",
    question: "Where do you usually put things online?",
    explanation: "Optional. Pick “Not sure yet” and we’ll decide per project.",
    options: [
      {
        value: "cloudflare",
        label: "Cloudflare",
        explanation: "Workers and Pages on Cloudflare’s edge network.",
      },
      { value: "vercel", label: "Vercel", explanation: "Vercel’s hosted platform." },
      {
        value: "traditional_server",
        label: "A server I run",
        explanation: "A virtual machine or container you manage yourself.",
      },
      { value: "undecided", label: "Not sure yet", explanation: "We won’t save a preference." },
    ],
  },
  {
    id: "locale",
    kind: "locale",
    question: "Which language should we write in?",
    explanation: "Used for dates, numbers, and the wording of generated prompts.",
    label: "Language tag",
  },
  {
    id: "timeZone",
    kind: "timeZone",
    question: "Is this your time zone?",
    explanation: "We read it from your browser. Confirm it or pick another.",
    label: "Time zone",
  },
];
