import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngDimensions {
  readonly width: number;
  readonly height: number;
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

const brandAssetPaths = [
  "assets/brand/logo-source.png",
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
  "assets/brand/logo-source.png": { width: 1254, height: 1254 },
  "public/brand/icon-192.png": { width: 192, height: 192 },
  "public/brand/icon-512.png": { width: 512, height: 512 },
  "public/brand/icon-maskable-512.png": { width: 512, height: 512 },
  "src/app/icon.png": { width: 256, height: 256 },
  "src/app/apple-icon.png": { width: 180, height: 180 },
} as const satisfies Record<string, PngDimensions>;

/**
 * Supplied brand baseline. The social-card hash is owned by
 * `scripts/generate-social-card.mjs` and is asserted separately so a
 * regenerated card is an explicit, reviewable change.
 */
const expectedSuppliedHashes = {
  "assets/brand/logo-source.png":
    "f95d467e690bc2f923d4714c534b785127f09018defa1df79359941f71fafd11",
  "public/brand/icon-192.png": "312ee7205022594f230144146e030dbd9a85b12445edbe8823ac1374ecdf8d71",
  "public/brand/icon-512.png": "608b6a8defea72e3d8766f99f7015b5fc9be24366d74047b4d13443f9b2e1c9e",
  "public/brand/icon-maskable-512.png":
    "5f1af2c91c507d5fa98bda82573ec4d043fb4f762fb87fc2dc33b9df4559b5c6",
  "src/app/favicon.ico": "691cc54459a6998514f0c5f20debc91dc35c8b07905be6c198139591877fb207",
  "src/app/icon.png": "37f721b65125d5ace1fc0921e3cb62a91ec510592aab9b79e4affece7a952601",
  "src/app/apple-icon.png": "ae0b7d3db84c3c78d94fb3d05c24e142beb7aef68e7c395acfa90b6ec37a1ccd",
} as const satisfies Record<string, string>;

const socialCardPaths = ["src/app/opengraph-image.png", "src/app/twitter-image.png"] as const;

describe("phase 2 brand asset contract", () => {
  it("keeps every declared brand asset present and non-empty", () => {
    for (const relativePath of brandAssetPaths) {
      const bytes = readRepositoryFile(relativePath);

      expect(bytes.byteLength, `${relativePath} must not be empty`).toBeGreaterThan(0);
    }
  });

  it("preserves the supplied raster dimensions", () => {
    for (const [relativePath, expected] of Object.entries(expectedDimensions)) {
      expect(readPngDimensions(relativePath), relativePath).toEqual(expected);
    }
  });

  it("preserves the supplied asset bytes", () => {
    for (const [relativePath, expectedHash] of Object.entries(expectedSuppliedHashes)) {
      expect(sha256(relativePath), relativePath).toBe(expectedHash);
    }
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

  it("documents a local-only social-card generator contract", () => {
    const source = readRepositoryText("scripts/generate-social-card.mjs");

    expect(source).toContain("assets/brand/logo-source.png");
    expect(source).toContain(
      "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
    );
    expect(source).toContain("width: 1200");
    expect(source).toContain("height: 630");
    expect(source).toContain("deviceScaleFactor: 1");
    expect(source).toContain("UnseenPrompt");
    expect(source).toContain("Start with the messy version.");
    expect(source).toContain('animations: "disabled"');
    expect(source).toContain("src/app/opengraph-image.png");
    expect(source).toContain("src/app/twitter-image.png");
    expect(source).not.toMatch(/https?:\/\/fonts\.|fetch\(/);
  });
});

describe("phase 2 repository metadata", () => {
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
