/**
 * Deterministic monochrome brand asset generator.
 *
 * Renders `assets/brand/logo-transparent.png` through Playwright Chromium with
 * reduced motion and no network access, then writes the fixed-size raster set
 * and a self-contained favicon.ico (ICO directory + 32×32 PNG payload).
 */

import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

const logoPath = path.join(repositoryRoot, "assets/brand/logo-transparent.png");

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
 * Next.js requires the embedded PNG to be RGBA.
 */
function buildIcoFromPng(pngBytes, width, height) {
  const rgbaPng = ensureRgbaPng(pngBytes, width, height);

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
  entry.writeUInt32LE(rgbaPng.byteLength, 8);
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([iconDir, entry, rgbaPng]);
}

function crc32(buffer) {
  let crc = ~0;
  for (let index = 0; index < buffer.byteLength; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const typeBytes = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function ensureRgbaPng(pngBytes, width, height) {
  const signature = pngBytes.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("expected PNG bytes for favicon payload");
  }

  let colorType = 0;
  const idatChunks = [];
  let offset = 8;

  while (offset + 8 <= pngBytes.byteLength) {
    const length = pngBytes.readUInt32BE(offset);
    const type = pngBytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = pngBytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (colorType === 6) {
    return pngBytes;
  }

  const channels = colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : -1;
  if (channels < 0) {
    throw new Error(`unsupported PNG color type ${colorType}`);
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = 1 + width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(width * channels);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * stride];
    const row = inflated.subarray(y * stride + 1, y * stride + stride);
    const current = Buffer.alloc(width * channels);

    for (let i = 0; i < row.byteLength; i += 1) {
      const x = row[i];
      const a = i >= channels ? current[i - channels] : 0;
      const b = previous[i];
      const c = i >= channels ? previous[i - channels] : 0;
      let value = x;
      if (filter === 1) value = (x + a) & 0xff;
      else if (filter === 2) value = (x + b) & 0xff;
      else if (filter === 3) value = (x + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (x + pr) & 0xff;
      }
      current[i] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const dest = (y * width + x) * 4;
      if (channels === 3) {
        rgba[dest] = current[x * 3];
        rgba[dest + 1] = current[x * 3 + 1];
        rgba[dest + 2] = current[x * 3 + 2];
        rgba[dest + 3] = 255;
      } else if (channels === 1) {
        const gray = current[x];
        rgba[dest] = gray;
        rgba[dest + 1] = gray;
        rgba[dest + 2] = gray;
        rgba[dest + 3] = 255;
      } else {
        const gray = current[x * 2];
        rgba[dest] = gray;
        rgba[dest + 1] = gray;
        rgba[dest + 2] = gray;
        rgba[dest + 3] = current[x * 2 + 1];
      }
    }
    previous = current;
  }

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function renderPng(page, logoDataUrl, size, { maskable }) {
  // Maskable icons keep a 20% safe-zone inset around the mark.
  const contentScale = maskable ? 0.6 : 1;
  const contentSize = Math.round(size * contentScale);
  const offset = Math.round((size - contentSize) / 2);
  const background = maskable ? "#FFFFFF" : "transparent";

  const html = `<doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${size}px; height: ${size}px; background: ${background}; }
      #frame {
        width: ${size}px;
        height: ${size}px;
        background: ${background};
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
    <div id="frame"><img src="${logoDataUrl}" width="${contentSize}" height="${contentSize}" alt="" /></div>
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
    omitBackground: !maskable,
  });
}

async function main() {
  const logoBytes = await readFile(logoPath);
  const logoDataUrl = toDataUrl(logoBytes, "image/png");

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
      const pngBytes = await renderPng(page, logoDataUrl, config.size, config);
      const absolutePath = path.join(repositoryRoot, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, pngBytes);
      hashes[relativePath] = createHash("sha256").update(pngBytes).digest("hex");
      console.log(`Wrote ${relativePath} (${pngBytes.byteLength} bytes)`);
    }

    // 32×32 PNG for favicon payload
    await page.setViewportSize({ width: 32, height: 32 });
    const faviconPng = await renderPng(page, logoDataUrl, 32, { maskable: false });
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
