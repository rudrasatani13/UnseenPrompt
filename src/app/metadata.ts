import type { Metadata } from "next";

import type { AppEnvironment } from "@/config/env/schema";

const PRODUCTION_DESCRIPTION =
  "UnseenPrompt is being built to keep decisions and evidence between coding sessions, then prepare one focused prompt for Claude Code, Codex, or Cursor.";

const PREVIEW_DESCRIPTION =
  "UnseenPrompt product preview. Start with the messy version — this environment is not production.";

export function buildRootMetadata(environment: AppEnvironment): Metadata {
  const isProduction = environment.APP_ENV === "production";
  const description = isProduction ? PRODUCTION_DESCRIPTION : PREVIEW_DESCRIPTION;

  return {
    metadataBase: new URL(environment.NEXT_PUBLIC_APP_URL),
    title: {
      default: "UnseenPrompt",
      template: "%s · UnseenPrompt",
    },
    description,
    applicationName: "UnseenPrompt",
    alternates: isProduction
      ? {
          canonical: "https://unseenprompt.com",
        }
      : undefined,
    robots: isProduction
      ? undefined
      : {
          index: false,
          follow: false,
        },
    openGraph: {
      type: "website",
      siteName: "UnseenPrompt",
      title: "UnseenPrompt",
      description,
      url: isProduction ? "https://unseenprompt.com" : environment.NEXT_PUBLIC_APP_URL,
    },
    twitter: {
      card: "summary_large_image",
      title: "UnseenPrompt",
      description,
    },
  };
}

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};
