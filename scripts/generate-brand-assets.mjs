/**
 * Deterministic monochrome brand asset generator.
 *
 * Renders `assets/brand/logo-monochrome.svg` through Playwright Chromium with
 * reduced motion and no network access, then writes the fixed-size raster set
 * and a self-contained favicon.ico (ICO directory + 32×32 PNG payload).
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

const svgPath = path.join(repositoryRoot, "assets/brand/logo-monochrome.svg");

const outputs = {
  "public/brand/icon-192.png": { size: 192, maskable: false },
  "public/brand/icon-512.png": { size: 512, maskable: false },
  "public/brand/icon-maskable-512.png": { size: 512, maskable: true },
  "src/app/icon.png": { size: 256, maskable: false },
  "src/app/apple-icon.png": { size: 180, maskable: false },
};

const faviconPath = path.join(repositoryRoot, "src/app/favicon.ico");

function toDataUrl(bytes, mimeType) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

/**
 * Builds a single-image ICO containing one PNG payload (Vista-style).
 * Layout: ICONDIR (6) + ICONDIRENTRY (16) + PNG bytes.
 */
function buildIcoFromPng(pngBytes, width, height) {
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0); // reserved
  iconDir.writeUInt16LE(1, 2); // type: icon
  iconDir.writeUInt16LE(1, 4); // count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // color palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBytes.byteLength, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([iconDir, entry, pngBytes]);
}

async function renderPng(page, svgDataUrl, size, { maskable }) {
  // Maskable icons keep a 20% safe-zone inset around the mark.
  const contentScale = maskable ? 0.6 : 1;
  const contentSize = Math.round(size * contentScale);
  const offset = Math.round((size - contentSize) / 2);

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${size}px; height: ${size}px; background: #FFFFFF; }
      #frame {
        width: ${size}px;
        height: ${size}px;
        background: #FFFFFF;
        position: relative;
        overflow: hidden;
      }
      #frame img {
        position: absolute;
        left: ${offset}px;
        top: ${offset}px;
        width: ${contentSize}px;
        height: ${contentSize}px;
        display: block;
      }
    </style>
  </head>
  <body>
    <div id="frame"><img src="${svgDataUrl}" width="${contentSize}" height="${contentSize}" alt="" /></div>
  </body>
</html>`;

  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    const image = document.querySelector("img");
    if (image && !image.complete) {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    }
  });

  return page.locator("#frame").screenshot({
    type: "png",
    animations: "disabled",
  });
}

async function main() {
  const svgBytes = await readFile(svgPath);
  const svgText = svgBytes.toString("utf8");

  for (const forbidden of ["#FEFAF8", "#A64763", "#8D3852", "#762C43", "gradient", "url("]) {
    if (svgText.includes(forbidden)) {
      throw new Error(`logo-monochrome.svg contains forbidden token: ${forbidden}`);
    }
  }

  const svgDataUrl = toDataUrl(svgBytes, "image/svg+xml");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 512, height: 512 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    // No network: all assets are data URLs.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || url === "about:blank") {
        return route.continue();
      }
      return route.abort();
    });

    const hashes = {};

    for (const [relativePath, config] of Object.entries(outputs)) {
      await page.setViewportSize({ width: config.size, height: config.size });
      const pngBytes = await renderPng(page, svgDataUrl, config.size, config);
      const absolutePath = path.join(repositoryRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, pngBytes);
      hashes[relativePath] = createHash("sha256").update(pngBytes).digest("hex");
      console.log(`Wrote ${relativePath} (${pngBytes.byteLength} bytes)`);
    }

    // 32×32 PNG for favicon payload
    await page.setViewportSize({ width: 32, height: 32 });
    const faviconPng = await renderPng(page, svgDataUrl, 32, { maskable: false });
    const icoBytes = buildIcoFromPng(faviconPng, 32, 32);
    await writeFile(faviconPath, icoBytes);
    hashes["src/app/favicon.ico"] = createHash("sha256").update(icoBytes).digest("hex");
    console.log(`Wrote src/app/favicon.ico (${icoBytes.byteLength} bytes)`);

    console.log("Hashes:");
    for (const [relativePath, hash] of Object.entries(hashes)) {
      console.log(`  ${relativePath}: ${hash}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
