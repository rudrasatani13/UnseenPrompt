import type { Metadata } from "next";

import type { AppEnvironment } from "@/config/env/schema";

const PRODUCTION_DESCRIPTION =
  "Start with the messy version. Keep the decisions together and know what to ask for next.";

const PREVIEW_DESCRIPTION =
  "UnseenPrompt product preview. Start with the messy version — this environment is not production.";

export function buildRootMetadata(environment: AppEnvironment): Metadata {
  const isProduction = environment.APP_ENV === "production";

  return {
    metadataBase: new URL(environment.NEXT_PUBLIC_APP_URL),
    title: {
      default: "UnseenPrompt",
      template: "%s · UnseenPrompt",
    },
    description: isProduction ? PRODUCTION_DESCRIPTION : PREVIEW_DESCRIPTION,
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
  };
}

export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};
