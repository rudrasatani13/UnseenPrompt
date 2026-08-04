import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourcePattern = /\.(?:ts|tsx|js|jsx)$/u;
const secretPattern =
  /(?:sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}|sk-(?:proj|live|admin)-[A-Za-z0-9_-]{20,}|AIzaSy[A-Za-z0-9_-]{30,})/u;
const logPattern = /\bconsole\.(?:log|warn|error|info|debug|trace)\s*\(/u;
const forbiddenClientImportPattern =
  /(?:@\/lib\/(?:model|discovery|project)|@\/config\/model\/server|server-only)/u;

function sourceFilesUnder(relativeRoot: string): readonly string[] {
  const root = path.join(process.cwd(), relativeRoot);
  if (!existsSync(root)) return [];
  const files: string[] = [];
  function walk(directory: string): void {
    for (const entry of readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) walk(fullPath);
      else if (sourcePattern.test(entry)) files.push(fullPath);
    }
  }
  walk(root);
  return files;
}

describe("Phase 7 import and privacy boundaries", () => {
  it("keeps client discovery modules away from server/model/repository infrastructure", () => {
    const clientFiles = [
      ...sourceFilesUnder("src/features/discovery"),
      ...sourceFilesUnder("src/app"),
      ...sourceFilesUnder("src/components"),
    ].filter((filePath) => !filePath.includes(`${path.sep}api${path.sep}`));
    const offenders = clientFiles.flatMap((filePath) => {
      const source = readFileSync(filePath, "utf8");
      if (!source.includes("use client") && filePath.includes(`${path.sep}app${path.sep}`)) {
        return [];
      }
      return forbiddenClientImportPattern.test(source) ? [filePath] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("keeps discovery orchestration server-only and free of content logs or provider secrets", () => {
    const files = sourceFilesUnder("src/lib/discovery").filter(
      (filePath) => !filePath.endsWith(".test.ts"),
    );
    const missingMarker = files.filter(
      (filePath) => !/^import ["']server-only["'];/u.test(readFileSync(filePath, "utf8")),
    );
    const unsafe = files.filter((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return logPattern.test(source) || secretPattern.test(source);
    });
    expect(missingMarker).toEqual([]);
    expect(unsafe).toEqual([]);
  });
});
