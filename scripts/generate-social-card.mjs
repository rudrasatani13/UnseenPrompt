import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

const logoPath = path.join(repositoryRoot, "assets/brand/logo-source.png");
const fontPath = path.join(
  repositoryRoot,
  "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
);
const openGraphPath = path.join(repositoryRoot, "src/app/opengraph-image.png");
const twitterPath = path.join(repositoryRoot, "src/app/twitter-image.png");
const temporaryDirectory = path.join(repositoryRoot, "test-results", "social-card");
const temporaryScreenshotPath = path.join(temporaryDirectory, "card.png");

const TITLE = "UnseenPrompt";
const SUBTITLE = "Start with the messy version.";
const BACKGROUND = "#FEFAF8";
const TEXT = "#2B2426";
const MUTED = "#6F6266";

function toDataUrl(bytes, mimeType) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function main() {
  const [logoBytes, fontBytes] = await Promise.all([readFile(logoPath), readFile(fontPath)]);
  const logoDataUrl = toDataUrl(logoBytes, "image/png");
  const fontDataUrl = toDataUrl(fontBytes, "font/woff2");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "ManropeVariable";
        src: url("${fontDataUrl}") format("woff2");
        font-weight: 100 900;
        font-style: normal;
        font-display: block;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 1200px;
        height: 630px;
        background: ${BACKGROUND};
        color: ${TEXT};
        font-family: "ManropeVariable", ui-sans-serif, system-ui, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .card {
        width: 1200px;
        height: 630px;
        padding: 72px 80px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 28px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 24px;
      }
      .brand img {
        width: 96px;
        height: 96px;
        border-radius: 16px;
      }
      h1 {
        font-size: 64px;
        line-height: 1.1;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      p {
        max-width: 900px;
        font-size: 28px;
        line-height: 1.4;
        color: ${MUTED};
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="card" id="card">
      <div class="brand">
        <img src="${logoDataUrl}" width="96" height="96" alt="" />
        <h1>${escapeHtml(TITLE)}</h1>
      </div>
      <p>${escapeHtml(SUBTITLE)}</p>
    </div>
  </body>
</html>`;

  await mkdir(temporaryDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });

    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const image = document.querySelector("img");
      if (image && !image.complete) {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
      }
    });

    await page.locator("#card").screenshot({
      path: temporaryScreenshotPath,
      animations: "disabled",
      type: "png",
    });

    const cardBytes = await readFile(temporaryScreenshotPath);
    await writeFile(openGraphPath, cardBytes);
    await writeFile(twitterPath, cardBytes);

    const hash = createHash("sha256").update(cardBytes).digest("hex");
    console.log(`Wrote identical social cards (${cardBytes.byteLength} bytes, sha256=${hash})`);
  } finally {
    await browser.close();
    await rm(temporaryScreenshotPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
