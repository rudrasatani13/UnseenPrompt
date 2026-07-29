import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { noIndexMetadata } from "@/app/metadata";
import { getServerEnvironment } from "@/config/env/server";
import { RemovalPanel } from "@/features/waitlist/removal-panel";

export const metadata: Metadata = {
  title: "Remove email",
  ...noIndexMetadata,
};

export default function WaitlistRemovePage() {
  if (getServerEnvironment().APP_ENV !== "production") {
    notFound();
  }

  return <RemovalPanel />;
}
