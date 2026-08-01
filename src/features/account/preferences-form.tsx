"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { CodingStyle, Preferences, PreferredStack } from "@/domain/account/contracts";
import { TEXT_FIELD_MAX_BYTES, textByteLength } from "@/domain/account/onboarding";

const SAVE_FAILED = "We couldn’t save your preferences. Try again in a moment.";
const stackFields: readonly { readonly key: keyof PreferredStack; readonly label: string }[] = [
  { key: "frontend", label: "Frontend" },
  { key: "backend", label: "Backend" },
  { key: "database", label: "Database" },
  { key: "hosting", label: "Hosting" },
];
const styleFields: readonly { readonly key: keyof CodingStyle; readonly label: string }[] = [
  { key: "comments", label: "Comments" },
  { key: "testing", label: "Testing" },
  { key: "paradigm", label: "Style" },
];

export interface PreferencesFormProps {
  readonly preferences: Preferences;
}

function compact(source: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== ""),
  );
}

/** Keeps the complete preference write in one request, matching onboarding's domain contract. */
export function PreferencesForm({ preferences }: PreferencesFormProps) {
  const router = useRouter();
  const [skillLevel, setSkillLevel] = useState(preferences.skillLevel);
  const [preferredStackBehavior, setPreferredStackBehavior] = useState(
    preferences.preferredStackBehavior,
  );
  const [preferredStack, setPreferredStack] = useState<Record<keyof PreferredStack, string>>({
    frontend: preferences.preferredStack.frontend ?? "",
    backend: preferences.preferredStack.backend ?? "",
    database: preferences.preferredStack.database ?? "",
    hosting: preferences.preferredStack.hosting ?? "",
  });
  const [codingStyle, setCodingStyle] = useState<Record<keyof CodingStyle, string>>({
    comments: preferences.codingStyle.comments ?? "",
    testing: preferences.codingStyle.testing ?? "",
    paradigm: preferences.codingStyle.paradigm ?? "",
  });
  const [deploymentPreference, setDeploymentPreference] = useState(
    preferences.deploymentPreference ?? "undecided",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasStackError = Object.values(preferredStack).some(
    (value) => textByteLength(value.trim()) > TEXT_FIELD_MAX_BYTES,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (hasStackError) {
      return;
    }

    setPending(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/account/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          skillLevel,
          preferredStackBehavior,
          preferredStack: preferredStackBehavior === "prefer_saved" ? compact(preferredStack) : {},
          codingStyle: compact(codingStyle),
          deploymentPreference: deploymentPreference === "undecided" ? null : deploymentPreference,
        }),
      });

      if (!response.ok) {
        setError(SAVE_FAILED);
        return;
      }

      setSaved(true);
      router.refresh();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit} aria-busy={pending}>
      <label className="grid gap-2 text-sm font-medium text-ink">
        Experience level
        <select
          className="min-h-11 rounded-md border border-control bg-surface px-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-10"
          value={skillLevel}
          onChange={(event) => setSkillLevel(event.target.value as Preferences["skillLevel"])}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-ink">
        Stack behavior
        <select
          className="min-h-11 rounded-md border border-control bg-surface px-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-10"
          value={preferredStackBehavior}
          onChange={(event) =>
            setPreferredStackBehavior(event.target.value as Preferences["preferredStackBehavior"])
          }
        >
          <option value="recommend">Recommend something for me</option>
          <option value="prefer_saved">Use my saved stack</option>
          <option value="ask">Ask me each time</option>
        </select>
      </label>
      {preferredStackBehavior !== "prefer_saved"
        ? null
        : stackFields.map((field) => {
            const value = preferredStack[field.key];
            const error =
              textByteLength(value.trim()) > TEXT_FIELD_MAX_BYTES
                ? `Use at most ${TEXT_FIELD_MAX_BYTES} bytes.`
                : undefined;

            return (
              <FormField
                key={field.key}
                label={field.label}
                {...(error === undefined ? {} : { error })}
              >
                {(controlProps) => (
                  <Input
                    {...controlProps}
                    value={value}
                    onChange={(event) =>
                      setPreferredStack((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </FormField>
            );
          })}
      {styleFields.map((field) => (
        <label key={field.key} className="grid gap-2 text-sm font-medium text-ink">
          {field.label}
          <select
            className="min-h-11 rounded-md border border-control bg-surface px-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-10"
            value={codingStyle[field.key]}
            onChange={(event) =>
              setCodingStyle((current) => ({ ...current, [field.key]: event.target.value }))
            }
          >
            <option value="">No preference</option>
            {field.key === "comments" ? (
              <>
                <option value="minimal">Minimal</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
              </>
            ) : null}
            {field.key === "testing" ? (
              <>
                <option value="test_first">Tests first</option>
                <option value="tests_after">Tests after</option>
                <option value="minimal">Only where it counts</option>
              </>
            ) : null}
            {field.key === "paradigm" ? (
              <>
                <option value="functional">Functional</option>
                <option value="object_oriented">Object-oriented</option>
                <option value="mixed">Whatever fits</option>
              </>
            ) : null}
          </select>
        </label>
      ))}
      <label className="grid gap-2 text-sm font-medium text-ink">
        Deployment preference
        <select
          className="min-h-11 rounded-md border border-control bg-surface px-3 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:min-h-10"
          value={deploymentPreference}
          onChange={(event) => setDeploymentPreference(event.target.value)}
        >
          <option value="cloudflare">Cloudflare</option>
          <option value="vercel">Vercel</option>
          <option value="traditional_server">A server I run</option>
          <option value="undecided">Not sure yet</option>
        </select>
      </label>
      {error === null ? null : (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved ? (
        <p role="status" className="text-sm text-ink-muted">
          Preferences saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending || hasStackError}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </form>
  );
}
