import { describe, expect, it } from "vitest";

import type { Preferences } from "@/domain/account/contracts";

import {
  resolveEffectivePreferences,
  type ProjectPreferenceOverride,
} from "./effective-preferences";

const global: Preferences = {
  skillLevel: "beginner",
  preferredStackBehavior: "prefer_saved",
  preferredStack: { frontend: "Next.js" },
  codingStyle: { testing: "test_first" },
  deploymentPreference: "cloudflare",
};

const project: ProjectPreferenceOverride = {
  skillLevel: "advanced",
  preferredStackBehavior: "ask",
  preferredStack: { backend: "Go" },
  codingStyle: { comments: "minimal" },
  deploymentPreference: "vercel",
};

describe("resolveEffectivePreferences", () => {
  it("uses every global field when no project override exists", () => {
    const effective = resolveEffectivePreferences(global, null);

    expect(effective).toEqual({
      skillLevel: { value: "beginner", source: "global" },
      preferredStackBehavior: { value: "prefer_saved", source: "global" },
      preferredStack: { value: { frontend: "Next.js" }, source: "global" },
      codingStyle: { value: { testing: "test_first" }, source: "global" },
      deploymentPreference: { value: "cloudflare", source: "global" },
    });
  });

  it("uses every non-null project field and marks its provenance", () => {
    const effective = resolveEffectivePreferences(global, project);

    expect(effective).toEqual({
      skillLevel: { value: "advanced", source: "project" },
      preferredStackBehavior: { value: "ask", source: "project" },
      preferredStack: { value: { backend: "Go" }, source: "project" },
      codingStyle: { value: { comments: "minimal" }, source: "project" },
      deploymentPreference: { value: "vercel", source: "project" },
    });
  });

  it("falls through independently for null project fields", () => {
    const effective = resolveEffectivePreferences(global, {
      skillLevel: null,
      preferredStackBehavior: "recommend",
      preferredStack: null,
      codingStyle: { paradigm: "functional" },
      deploymentPreference: null,
    });

    expect(effective.skillLevel).toEqual({ value: "beginner", source: "global" });
    expect(effective.preferredStackBehavior).toEqual({ value: "recommend", source: "project" });
    expect(effective.preferredStack).toEqual({ value: { frontend: "Next.js" }, source: "global" });
    expect(effective.codingStyle).toEqual({ value: { paradigm: "functional" }, source: "project" });
    expect(effective.deploymentPreference).toEqual({ value: "cloudflare", source: "global" });
  });

  it("keeps an explicitly null global deployment preference distinct from a project override", () => {
    const effective = resolveEffectivePreferences(
      { ...global, deploymentPreference: null },
      { ...project, deploymentPreference: null },
    );

    expect(effective.deploymentPreference).toEqual({ value: null, source: "global" });
  });
});
