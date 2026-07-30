import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";

describe("web application manifest", () => {
  it("describes UnseenPrompt with the committed local brand icons", () => {
    expect(manifest()).toEqual({
      name: "UnseenPrompt",
      short_name: "UnseenPrompt",
      description:
        "UnseenPrompt is being built to keep decisions and evidence between coding sessions, then prepare one focused prompt for Claude Code, Codex, or Cursor.",
      start_url: "/",
      display: "standalone",
      background_color: "#FFFFFF",
      theme_color: "#FFFFFF",
      icons: [
        {
          src: "/brand/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/brand/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/brand/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    });
  });

  it("references only local same-origin icon paths", () => {
    for (const icon of manifest().icons ?? []) {
      expect(icon.src.startsWith("/brand/")).toBe(true);
    }
  });
});
