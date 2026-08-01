import type { OnboardingAnswers } from "@/domain/account/onboarding";
import type { ProjectPreferenceOverride } from "@/domain/account/effective-preferences";
import type { AccountExportV1 } from "@/domain/account/export";

export type SkillLevel = "beginner" | "intermediate" | "advanced";
export type PreferredStackBehavior = "recommend" | "prefer_saved" | "ask";

export interface PreferredStack {
  readonly frontend?: string;
  readonly backend?: string;
  readonly database?: string;
  readonly hosting?: string;
}

export interface CodingStyle {
  readonly comments?: "minimal" | "standard" | "detailed";
  readonly testing?: "test_first" | "tests_after" | "minimal";
  readonly paradigm?: "functional" | "object_oriented" | "mixed";
}

export type DeploymentPreference = "cloudflare" | "vercel" | "traditional_server";

export interface Profile {
  readonly id: string;
  readonly displayName: string | null;
  readonly locale: string;
  readonly timeZone: string;
  readonly onboardingCompletedAt: string | null;
  readonly deletionRequestedAt: string | null;
}

export interface ProfilePatch {
  readonly displayName?: string | null;
  readonly locale?: string;
  readonly timeZone?: string;
}

export interface Preferences {
  readonly skillLevel: SkillLevel;
  readonly preferredStackBehavior: PreferredStackBehavior;
  readonly preferredStack: PreferredStack;
  readonly codingStyle: CodingStyle;
  readonly deploymentPreference: DeploymentPreference | null;
}

export interface AccountRepository {
  ensureProfile(userId: string): Promise<void>;
  getProfile(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<Profile>;
  getPreferences(userId: string): Promise<Preferences | null>;
  completeOnboarding(userId: string, answers: OnboardingAnswers): Promise<void>;
  updatePreferences(userId: string, next: Preferences): Promise<Preferences>;
  getProjectPreferenceOverride(projectId: string): Promise<ProjectPreferenceOverride | null>;
  /** Returns the effective request timestamp: an existing one is reported back, never replaced. */
  requestDeletion(userId: string, now: Date): Promise<string>;
  cancelDeletion(userId: string): Promise<void>;
  buildAccountExport(userId: string): Promise<AccountExportV1>;
}
