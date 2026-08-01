import type {
  CodingStyle,
  DeploymentPreference,
  Preferences,
  PreferredStack,
  PreferredStackBehavior,
  SkillLevel,
} from "@/domain/account/contracts";

export interface ProjectPreferenceOverride {
  readonly skillLevel: SkillLevel | null;
  readonly preferredStackBehavior: PreferredStackBehavior | null;
  readonly preferredStack: PreferredStack | null;
  readonly codingStyle: CodingStyle | null;
  readonly deploymentPreference: DeploymentPreference | null;
}

export interface EffectiveField<T> {
  readonly value: T;
  readonly source: "global" | "project";
}

export interface EffectivePreferences {
  readonly skillLevel: EffectiveField<SkillLevel>;
  readonly preferredStackBehavior: EffectiveField<PreferredStackBehavior>;
  readonly preferredStack: EffectiveField<PreferredStack>;
  readonly codingStyle: EffectiveField<CodingStyle>;
  readonly deploymentPreference: EffectiveField<DeploymentPreference | null>;
}

function resolveField<T>(global: T, override: T | null | undefined): EffectiveField<T> {
  return override === null || override === undefined
    ? { value: global, source: "global" }
    : { value: override, source: "project" };
}

export function resolveEffectivePreferences(
  global: Preferences,
  override: ProjectPreferenceOverride | null,
): EffectivePreferences {
  return {
    skillLevel: resolveField(global.skillLevel, override?.skillLevel),
    preferredStackBehavior: resolveField(
      global.preferredStackBehavior,
      override?.preferredStackBehavior,
    ),
    preferredStack: resolveField(global.preferredStack, override?.preferredStack),
    codingStyle: resolveField(global.codingStyle, override?.codingStyle),
    deploymentPreference: resolveField(global.deploymentPreference, override?.deploymentPreference),
  };
}
