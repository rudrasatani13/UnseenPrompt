import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function lintFrom(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, {
    filePath: path.join(process.cwd(), filePath),
  });

  return result?.messages ?? [];
}

/*
 * Booting ESLint and resolving the flat config takes seconds, and it competes
 * with the rest of the suite for CPU. The default 5s timeout is not enough under
 * parallel load, so this suite declares the real cost of the operation.
 */
const eslintBootstrapTimeout = 30_000;

describe("architectural import boundaries", () => {
  it(
    "rejects relative imports from lib into app",
    async () => {
      const messages = await lintFrom("src/lib/boundary-fixture.ts", 'import "../app/page";');

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            messageId: "crossLayerImport",
          }),
        ]),
      );
    },
    eslintBootstrapTimeout,
  );

  it(
    "continues to reject alias imports from domain into features",
    async () => {
      const messages = await lintFrom(
        "src/domain/boundary-fixture.ts",
        'import "@/features/project";',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            messageId: "crossLayerImport",
          }),
        ]),
      );
    },
    eslintBootstrapTimeout,
  );

  it("keeps waitlist server config out of client modules", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const clientRoots = ["src/components", "src/features", "src/app"];
    const offenders: string[] = [];

    function walk(directory: string): void {
      for (const entry of readdirSync(directory)) {
        const fullPath = join(directory, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!/\.(tsx|ts|jsx|js)$/u.test(entry)) {
          continue;
        }
        if (fullPath.includes("/api/")) {
          continue;
        }
        const source = readFileSync(fullPath, "utf8");
        if (source.includes("@/config/waitlist/server") || source.includes("config/waitlist/server")) {
          // Server Components under app may import server modules; only flag "use client".
          if (source.includes('"use client"') || source.includes("'use client'")) {
            offenders.push(fullPath);
          }
        }
      }
    }

    for (const root of clientRoots) {
      walk(join(process.cwd(), root));
    }

    expect(offenders).toEqual([]);
  });
});
