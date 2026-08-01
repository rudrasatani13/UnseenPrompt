"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/domain/account/contracts";
import { TEXT_FIELD_MAX_BYTES, textByteLength } from "@/domain/account/onboarding";

const SAVE_FAILED = "We couldn’t save your profile. Try again in a moment.";

export interface ProfileFormProps {
  readonly profile: Pick<Profile, "displayName" | "locale" | "timeZone">;
}

/** Edits only stated account fields; identity-provider metadata is never rendered or submitted. */
export function ProfileForm({ profile }: ProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [locale, setLocale] = useState(profile.locale);
  const [timeZone, setTimeZone] = useState(profile.timeZone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const byteLength = textByteLength(displayName.trim());
  const displayNameError =
    byteLength > TEXT_FIELD_MAX_BYTES ? `Use at most ${TEXT_FIELD_MAX_BYTES} bytes.` : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (displayNameError) {
      return;
    }

    setPending(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() === "" ? null : displayName.trim(),
          locale: locale.trim(),
          timeZone: timeZone.trim(),
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
    <form className="grid gap-5" onSubmit={onSubmit} noValidate aria-busy={pending}>
      <FormField
        label="Display name"
        description="Optional. Leave this blank if you do not want us to use a name."
        {...(displayNameError === undefined
          ? { currentLength: byteLength, maxLength: TEXT_FIELD_MAX_BYTES }
          : { error: displayNameError })}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        )}
      </FormField>
      <FormField label="Language tag" description="A BCP-47 tag, such as en or pt-BR.">
        {(controlProps) => (
          <Input
            {...controlProps}
            name="locale"
            autoComplete="language"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            required
          />
        )}
      </FormField>
      <FormField label="Time zone" description="Use an IANA zone, such as Asia/Kolkata.">
        {(controlProps) => (
          <Input
            {...controlProps}
            name="timeZone"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            required
          />
        )}
      </FormField>
      {error === null ? null : (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved ? (
        <p role="status" className="text-sm text-ink-muted">
          Profile saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending || displayNameError !== undefined}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
