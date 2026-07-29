import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const scriptPath = path.join(process.cwd(), "scripts/create-waitlist-removal-link.ts");
const SECRET = "local_test_token_secret_0000000000000000";
const ENTRY = "11111111-2222-4333-8444-555555555555";

describe("create-waitlist-removal-link", () => {
  it("prints a fragment URL for valid arguments", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", scriptPath, ENTRY, "2"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          WAITLIST_TOKEN_SECRET: SECRET,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /^https:\/\/unseenprompt\.com\/waitlist\/remove#token=[A-Za-z0-9._%-]+\n$/,
    );
    expect(result.stdout).not.toContain(SECRET);
  });

  it("rejects invalid UUID input", () => {
    const result = spawnSync("pnpm", ["exec", "tsx", scriptPath, "not-a-uuid", "1"], {
      encoding: "utf8",
      env: {
        ...process.env,
        WAITLIST_TOKEN_SECRET: SECRET,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/UUID/i);
  });
});
