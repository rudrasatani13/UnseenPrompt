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

describe("architectural import boundaries", () => {
  it("rejects relative imports from lib into app", async () => {
    const messages = await lintFrom("src/lib/boundary-fixture.ts", 'import "../app/page";');

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: "crossLayerImport",
        }),
      ]),
    );
  });

  it("continues to reject alias imports from domain into features", async () => {
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
  });
});
