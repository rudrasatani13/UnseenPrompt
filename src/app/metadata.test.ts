import { describe, expect, it } from "vitest";

import { buildRootMetadata } from "@/app/metadata";

describe("root metadata", () => {
  it("publishes complete production sharing metadata", () => {
    const metadata = buildRootMetadata({
      APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://unseenprompt.com",
      RELEASE_SHA: "test",
      MAINTENANCE_MODE: "off",
    });

    expect(metadata.alternates).toEqual({
      canonical: "https://unseenprompt.com",
    });
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({
        type: "website",
        siteName: "UnseenPrompt",
        url: "https://unseenprompt.com",
        title: "UnseenPrompt",
        description:
          "UnseenPrompt is being built to keep decisions and evidence between coding sessions, then prepare one focused prompt for Claude Code, Codex, or Cursor.",
      }),
    );
    expect(metadata.twitter).toEqual(
      expect.objectContaining({
        card: "summary_large_image",
        title: "UnseenPrompt",
      }),
    );
  });
});
