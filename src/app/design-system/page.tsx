import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignSystemGallery } from "@/app/design-system/gallery-client";
import { isDesignSystemAvailable } from "@/app/design-system/gallery-data";
import { getServerEnvironment } from "@/config/env/server";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

/**
 * Non-production design-system gallery. Production resolves to not-found.
 * This is an exposure guard, not authorization.
 */
export default function DesignSystemPage() {
  const environment = getServerEnvironment();

  if (!isDesignSystemAvailable(environment.APP_ENV)) {
    notFound();
  }

  return <DesignSystemGallery />;
}
