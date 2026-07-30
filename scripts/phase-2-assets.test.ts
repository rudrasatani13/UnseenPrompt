import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngDimensions {
  readonly width: number;
  readonly height: number;
}

interface PngAlphaStats {
  readonly transparentPixels: number;
  readonly visiblePixels: number;
}

function readRepositoryFile(relativePath: string): Buffer {
  return readFileSync(path.join(repositoryRoot, relativePath));
}

function readRepositoryText(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function sha256(relativePath: string): string {
  return createHash("sha256").update(readRepositoryFile(relativePath)).digest("hex");
}

/**
 * Reads width and height from the PNG IHDR chunk. The signature occupies bytes
 * 0-7, the IHDR length and type occupy bytes 8-15, and the dimensions occupy
 * bytes 16-23 as two big-endian unsigned 32-bit integers.
 */
function readPngDimensions(relativePath: string): PngDimensions {
  const bytes = readRepositoryFile(relativePath);

  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${relativePath} is not a PNG file`);
  }

  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${relativePath} does not start with an IHDR chunk`);
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

/**
 * Decodes PNG pixels and rejects non-neutral colors where max(r,g,b)-min(r,g,b) > 2.
 * Supports 8-bit grayscale and RGB/RGBA, with or without tRNS, filter method 0.
 */
function assertNeutralPixels(relativePath: string): PngAlphaStats {
  const bytes = readRepositoryFile(relativePath);

  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${relativePath} is not a PNG file`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  let offset = 8;

  while (offset + 8 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8) {
    throw new Error(`${relativePath}: unsupported bit depth ${bitDepth}`);
  }

  const channels =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : -1;
  if (channels < 0) {
    throw new Error(`${relativePath}: unsupported color type ${colorType}`);
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const stride = 1 + width * channels;
  expect(inflated.byteLength).toBeGreaterThanOrEqual(stride * height);

  // Unfilter scanlines (filter method 0).
  const raw = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(width * channels);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[y * stride]!;
    const row = inflated.subarray(y * stride + 1, y * stride + stride);
    const out = Buffer.alloc(width * channels);

    for (let i = 0; i < row.byteLength; i += 1) {
      const x = row[i]!;
      const a = i >= channels ? out[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      let value = x;

      if (filter === 1) {
        value = (x + a) & 0xff;
      } else if (filter === 2) {
        value = (x + b) & 0xff;
      } else if (filter === 3) {
        value = (x + Math.floor((a + b) / 2)) & 0xff;
      } else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        value = (x + pr) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`${relativePath}: unsupported filter type ${filter}`);
      }

      out[i] = value;
    }

    out.copy(raw, y * width * channels);
    prev = out;
  }

  let transparentPixels = 0;
  let visiblePixels = 0;

  for (let i = 0; i < width * height; i += 1) {
    const base = i * channels;
    let r = 0;
    let g = 0;
    let b = 0;
    let alpha = 255;

    if (colorType === 0) {
      r = g = b = raw[base]!;
    } else if (colorType === 2) {
      r = raw[base]!;
      g = raw[base + 1]!;
      b = raw[base + 2]!;
    } else if (colorType === 4) {
      r = g = b = raw[base]!;
      alpha = raw[base + 1]!;
    } else {
      r = raw[base]!;
      g = raw[base + 1]!;
      b = raw[base + 2]!;
      alpha = raw[base + 3]!;
    }

    if (alpha === 0) transparentPixels += 1;
    else visiblePixels += 1;

    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma > 2) {
      throw new Error(
        `${relativePath}: non-neutral pixel at index ${i} rgb(${r},${g},${b}) chroma=${chroma}`,
      );
    }
  }

  return { transparentPixels, visiblePixels };
}

const brandAssetPaths = [
  "assets/brand/logo-transparent.png",
  "public/brand/icon-192.png",
  "public/brand/icon-512.png",
  "public/brand/icon-maskable-512.png",
  "src/app/favicon.ico",
  "src/app/icon.png",
  "src/app/apple-icon.png",
  "src/app/opengraph-image.png",
  "src/app/twitter-image.png",
  "src/app/manifest.ts",
] as const;

const expectedDimensions = {
  "assets/brand/logo-transparent.png": { width: 1024, height: 1024 },
  "public/brand/icon-192.png": { width: 192, height: 192 },
  "public/brand/icon-512.png": { width: 512, height: 512 },
  "public/brand/icon-maskable-512.png": { width: 512, height: 512 },
  "src/app/icon.png": { width: 256, height: 256 },
  "src/app/apple-icon.png": { width: 180, height: 180 },
} as const satisfies Record<string, PngDimensions>;

const rasterNeutralPaths = [
  "assets/brand/logo-transparent.png",
  "public/brand/icon-192.png",
  "public/brand/icon-512.png",
  "public/brand/icon-maskable-512.png",
  "src/app/icon.png",
  "src/app/apple-icon.png",
  "src/app/opengraph-image.png",
  "src/app/twitter-image.png",
] as const;

const transparentRasterPaths = [
  "assets/brand/logo-transparent.png",
  "public/brand/icon-192.png",
  "public/brand/icon-512.png",
  "src/app/icon.png",
  "src/app/apple-icon.png",
] as const;

const socialCardPaths = ["src/app/opengraph-image.png", "src/app/twitter-image.png"] as const;

describe("monochrome brand asset contract", () => {
  it("keeps every declared brand asset present and non-empty", () => {
    for (const relativePath of brandAssetPaths) {
      const bytes = readRepositoryFile(relativePath);

      expect(bytes.byteLength, `${relativePath} must not be empty`).toBeGreaterThan(0);
    }
  });

  it("removes the retired brand sources", () => {
    expect(existsSync(path.join(repositoryRoot, "assets/brand/logo-source.png"))).toBe(false);
    expect(existsSync(path.join(repositoryRoot, "assets/brand/logo-monochrome.svg"))).toBe(false);
  });

  it("keeps the canonical logo as a transparent RGBA PNG", () => {
    const bytes = readRepositoryFile("assets/brand/logo-transparent.png");
    const stats = assertNeutralPixels("assets/brand/logo-transparent.png");

    expect(bytes[24]).toBe(8);
    expect(bytes[25]).toBe(6);
    expect(stats.transparentPixels).toBeGreaterThan(0);
    expect(stats.visiblePixels).toBeGreaterThan(0);
  });

  it("preserves the required raster dimensions", () => {
    for (const [relativePath, expected] of Object.entries(expectedDimensions)) {
      expect(readPngDimensions(relativePath), relativePath).toEqual(expected);
    }
  });

  it("rejects non-neutral pixels in brand rasters and social cards", () => {
    for (const relativePath of rasterNeutralPaths) {
      expect(() => assertNeutralPixels(relativePath)).not.toThrow();
    }
  });

  it("keeps browser and app marks transparent while the maskable icon stays opaque", () => {
    for (const relativePath of transparentRasterPaths) {
      const stats = assertNeutralPixels(relativePath);
      expect(stats.transparentPixels, relativePath).toBeGreaterThan(0);
      expect(stats.visiblePixels, relativePath).toBeGreaterThan(0);
    }

    expect(assertNeutralPixels("public/brand/icon-maskable-512.png").transparentPixels).toBe(0);
  });

  it("keeps both social cards at the required card size", () => {
    for (const relativePath of socialCardPaths) {
      expect(readPngDimensions(relativePath), relativePath).toEqual({
        width: 1200,
        height: 630,
      });
    }
  });

  it("keeps the purposeful Open Graph and Twitter metadata files byte-identical", () => {
    const [openGraphPath, twitterPath] = socialCardPaths;

    expect(sha256(openGraphPath)).toBe(sha256(twitterPath));
  });

  it("keeps social cards free of unexpected PNG text chunks", () => {
    for (const relativePath of socialCardPaths) {
      const bytes = readRepositoryFile(relativePath);
      const chunkTypes: string[] = [];
      let offset = 8;

      while (offset + 8 <= bytes.byteLength) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
        chunkTypes.push(type);

        if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
          const payload = bytes.subarray(offset + 8, offset + 8 + length).toString("utf8");
          expect(payload).not.toMatch(/Users\/|fonts\.googleapis|fonts\.gstatic|https?:\/\//i);
        }

        offset += 12 + length;
        if (type === "IEND") {
          break;
        }
      }

      expect(chunkTypes).toContain("IHDR");
      expect(chunkTypes).toContain("IEND");
    }
  });

  it("documents a local-only monochrome brand and social-card generator contract", () => {
    const brandSource = readRepositoryText("scripts/generate-brand-assets.mjs");
    const socialSource = readRepositoryText("scripts/generate-social-card.mjs");

    expect(brandSource).toContain("assets/brand/logo-transparent.png");
    expect(brandSource).toContain("icon-maskable-512.png");
    expect(brandSource).toContain("favicon.ico");
    expect(brandSource).toContain("reducedMotion");
    expect(brandSource).not.toMatch(/logo-monochrome\.svg|logo-source\.png/);

    expect(socialSource).toContain("assets/brand/logo-transparent.png");
    expect(socialSource).toContain(
      "node_modules/@fontsource-variable/mona-sans/files/mona-sans-latin-wdth-normal.woff2",
    );
    expect(socialSource).toContain("width: 1200");
    expect(socialSource).toContain("height: 630");
    expect(socialSource).toContain("deviceScaleFactor: 1");
    expect(socialSource).toContain("UnseenPrompt");
    expect(socialSource).toContain("Decisions and evidence, ready for the next coding session.");
    expect(socialSource).toContain("#FFFFFF");
    expect(socialSource).toContain("#000000");
    expect(socialSource).toContain('animations: "disabled"');
    expect(socialSource).toContain("src/app/opengraph-image.png");
    expect(socialSource).toContain("src/app/twitter-image.png");
    expect(socialSource).not.toMatch(/logo-monochrome\.svg|logo-source\.png/);
    expect(socialSource).not.toMatch(/https?:\/\/fonts\.|fetch\(/);
    expect(socialSource).not.toMatch(/#(?:FEFAF8|A64763|2B2426|6F6266)/);
  });
});

describe("monochrome repository metadata", () => {
  it("caches brand assets through the committed Cloudflare headers file", () => {
    const headers = readRepositoryText("public/_headers");

    expect(headers).toMatch(/^\/brand\/\*\n {2}Cache-Control: public,max-age=86400$/m);
  });

  it("ignores operating-system metadata and local visual-companion state", () => {
    const ignoreRules = readRepositoryText(".gitignore")
      .split("\n")
      .map((line) => line.trim());

    expect(ignoreRules).toContain(".DS_Store");
    expect(ignoreRules).toContain(".superpowers/");
  });
});
