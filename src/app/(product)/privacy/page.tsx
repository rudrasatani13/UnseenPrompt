import type { Metadata } from "next";

import { noIndexMetadata } from "@/app/metadata";

export const metadata: Metadata = {
  title: "Privacy",
  ...noIndexMetadata,
};

export default function PrivacyPage() {
  return (
    <article data-slot="privacy-page" className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-base text-ink-muted">
        UnseenPrompt collects an email address only to confirm waitlist interest and later announce
        availability. Supabase stores the entry. Resend delivers the confirmation email and any
        later approved messages. Cloudflare Turnstile processes anti-abuse signals when you submit
        the form.
      </p>
      <p className="text-base text-ink-muted">
        We do not use marketing analytics or tracking pixels on this site. Pending waitlist entries
        are removed after 30 days if they are not confirmed. Confirmed entries remain until you
        remove them or the waitlist is closed.
      </p>
      <p className="text-base text-ink-muted">
        To request deletion, use a removal link from a confirmation email when available, or write
        to{" "}
        <a className="underline" href="mailto:privacy@unseenprompt.com">
          privacy@unseenprompt.com
        </a>
        .
      </p>
    </article>
  );
}
