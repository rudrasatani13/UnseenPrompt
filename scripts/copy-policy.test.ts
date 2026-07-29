import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const prohibited = [
  "Stateful Project Copilot",
  "AI-powered",
  "agent-ready",
  "revolutionary",
  "unlock",
  "supercharge",
  "seamless",
  "game-changing",
] as const;

const scannedRoots = [
  "README.md",
  "src",
  "docs/UnseenPrompt – DEVELOPMENT_PLAN.md",
  "docs/UnseenPrompt – PRODUCT_PLAN.md",
  "docs/development",
];

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const supportedExtensions = new Set([".md", ".ts", ".tsx", ".mjs", ".json"]);
const excludedDirectories = new Set(["node_modules", ".next", "coverage", "test-results"]);
const prohibitedListDeclaration = [
  "const prohibited = [",
  ...prohibited.map((phrase) => `  \"${phrase}\",`),
  "] as const;",
].join("\n");

function isExcluded(relativePath: string): boolean {
  const segments = relativePath.split(path.sep);

  if (segments.some((segment) => excludedDirectories.has(segment))) {
    return true;
  }

  if (
    segments[0] === "docs" &&
    segments[1] === "superpowers" &&
    (segments[2] === "plans" || segments[2] === "specs")
  ) {
    return true;
  }

  const basename = path.basename(relativePath);
  return basename.includes(".generated.") || basename.includes(".gen.");
}

function collectFiles(relativeRoot: string): string[] {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);
  const entries = readdirSync(absoluteRoot, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  return entries.flatMap((entry) => {
    const relativePath = path.join(relativeRoot, entry.name);

    if (isExcluded(relativePath)) {
      return [];
    }

    if (entry.isDirectory()) {
      return collectFiles(relativePath);
    }

    return entry.isFile() && supportedExtensions.has(path.extname(entry.name))
      ? [relativePath]
      : [];
  });
}

function readScannedFiles(): readonly string[] {
  return scannedRoots.flatMap((relativeRoot) =>
    !existsSync(path.join(repositoryRoot, relativeRoot))
      ? []
      : supportedExtensions.has(path.extname(relativeRoot))
        ? [relativeRoot]
        : collectFiles(relativeRoot),
  );
}

function findProhibitedCopy(): readonly string[] {
  return readScannedFiles().flatMap((relativePath) => {
    const source = readFileSync(path.join(repositoryRoot, relativePath), "utf8").replaceAll(
      prohibitedListDeclaration,
      "",
    );

    return prohibited
      .filter((phrase) => source.includes(phrase))
      .map((phrase) => `${relativePath}: ${phrase}`);
  });
}

describe("active product copy", () => {
  it("contains no prohibited product language", () => {
    expect(findProhibitedCopy()).toEqual([]);
  });
});
