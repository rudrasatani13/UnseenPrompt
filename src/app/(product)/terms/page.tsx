import type { Metadata } from "next";

import { noIndexMetadata } from "@/app/metadata";

export const metadata: Metadata = {
  title: "Terms",
  ...noIndexMetadata,
};

export default function TermsPage() {
  return (
    <article data-slot="terms-page" className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="text-base text-ink-muted">
        UnseenPrompt is unfinished software. Joining the waitlist does not create an account and
        does not promise availability, features, or a launch date.
      </p>
      <p className="text-base text-ink-muted">
        Do not misuse the waitlist, confirmation links, or related services. We may remove entries
        that appear abusive and may pause or close the waitlist at any time.
      </p>
    </article>
  );
}
