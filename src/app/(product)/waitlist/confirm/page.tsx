import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { noIndexMetadata } from "@/app/metadata";
import { getServerEnvironment } from "@/config/env/server";
import { ConfirmationPanel } from "@/features/waitlist/confirmation-panel";

export const metadata: Metadata = {
  title: "Confirm email",
  ...noIndexMetadata,
};

export default function WaitlistConfirmPage() {
  if (getServerEnvironment().APP_ENV !== "production") {
    notFound();
  }

  return <ConfirmationPanel />;
}
