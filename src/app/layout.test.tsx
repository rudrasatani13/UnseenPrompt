import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Manrope: () => ({
    variable: "test-font-manrope-variable",
    className: "test-font-manrope",
  }),
}));

const requiredEnvironment = {
  APP_ENV: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  RELEASE_SHA: "test",
} as const;

async function importLayout() {
  vi.resetModules();

  return import("@/app/layout");
}

describe("RootLayout", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(requiredEnvironment)) {
      vi.stubEnv(key, value);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("declares the document language", async () => {
    const { default: RootLayout } = await importLayout();

    const markup = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);

    expect(markup).toContain('lang="en"');
  });

  it("applies the locally hosted Manrope font to the document body", async () => {
    const { default: RootLayout } = await importLayout();

    const markup = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);
    const bodyTag = /<body[^>]*>/.exec(markup)?.[0] ?? "";

    expect(bodyTag).toContain("test-font-manrope-variable");
    expect(bodyTag).toContain("font-sans");
  });

  it("renders supplied children exactly once", async () => {
    const { default: RootLayout } = await importLayout();

    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>workspace content</p>
      </RootLayout>,
    );

    expect(markup.match(/workspace content/g)).toHaveLength(1);
  });

  it("keeps environment-aware metadata and the environment-derived base URL", async () => {
    const { metadata } = await importLayout();

    expect(metadata.applicationName).toBe("UnseenPrompt");
    expect(metadata.description).toBe(
      "UnseenPrompt product preview. Start with the messy version — this environment is not production.",
    );
    expect(metadata.title).toEqual({
      default: "UnseenPrompt",
      template: "%s · UnseenPrompt",
    });
    expect(metadata.metadataBase?.toString()).toBe("http://localhost:3000/");
  });
});
