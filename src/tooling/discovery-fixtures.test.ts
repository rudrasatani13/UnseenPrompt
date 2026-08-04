import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const fixtureDirectory = path.join(process.cwd(), "tests", "fixtures", "discovery");
const fixtureFiles = readdirSync(fixtureDirectory).filter((file) => file.endsWith(".json"));

type Fixture = {
  readonly id: string;
  readonly mode: "new_build" | "feature" | "bug" | "review" | "test" | "deploy" | "improve";
  readonly skillLevel: "beginner" | "intermediate" | "expert";
  readonly language: string;
  readonly initialRequestText: string;
  readonly tags: readonly string[];
  readonly boundaryCharacter?: string;
  readonly boundaryRepeat?: number;
  readonly boundaryBytes?: number;
};

function loadFixtures(): readonly Fixture[] {
  return fixtureFiles.map(
    (file) => JSON.parse(readFileSync(path.join(fixtureDirectory, file), "utf8")) as Fixture,
  );
}

describe("Phase 7 discovery fixtures", () => {
  it("covers every supported intent mode with bounded synthetic inputs", () => {
    const fixtures = loadFixtures();
    const modes = new Set(fixtures.map((fixture) => fixture.mode));

    expect(modes).toEqual(
      new Set(["new_build", "feature", "bug", "review", "test", "deploy", "improve"]),
    );
    for (const fixture of fixtures) {
      expect(fixture.id).toMatch(/^[a-z0-9-]+$/u);
      expect(fixture.initialRequestText.trim().length).toBeGreaterThan(0);
      expect(new TextEncoder().encode(fixture.initialRequestText).byteLength).toBeLessThanOrEqual(
        16_384,
      );
      expect(["beginner", "intermediate", "expert"]).toContain(fixture.skillLevel);
    }
  });

  it("includes multilingual, mixed-script, sparse, expert, and exact multibyte boundary cases", () => {
    const fixtures = loadFixtures();
    const tags = new Set(fixtures.flatMap((fixture) => fixture.tags));
    for (const tag of ["multilingual", "mixed-script", "sparse", "expert", "multibyte"]) {
      expect(tags.has(tag)).toBe(true);
    }

    const boundary = fixtures.find((fixture) => fixture.id === "multibyte-boundary");
    expect(boundary?.boundaryCharacter).toBe("界");
    expect(boundary?.boundaryRepeat).toBe(5_461);
    expect(boundary?.boundaryBytes).toBe(16_383);
    expect(
      new TextEncoder().encode(
        boundary?.boundaryCharacter?.repeat(boundary.boundaryRepeat ?? 0) ?? "",
      ).byteLength,
    ).toBe(boundary?.boundaryBytes);
  });
});
