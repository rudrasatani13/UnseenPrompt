import { readFileSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const workflowPath = path.join(process.cwd(), ".github/workflows/ci.yml");
const workflowSource = readFileSync(workflowPath, "utf8");
const workflow = parse(workflowSource) as {
  permissions?: Record<string, string>;
  jobs?: {
    quality?: {
      "timeout-minutes"?: number;
      steps?: Array<Record<string, unknown>>;
    };
  };
};

function stepRuns(step: Record<string, unknown>): string {
  return typeof step.run === "string" ? step.run : "";
}

describe("phase 2 CI workflow contract", () => {
  it("keeps top-level permissions read-only", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
  });

  it("gives the quality job a 30-minute timeout", () => {
    expect(workflow.jobs?.quality?.["timeout-minutes"]).toBe(30);
  });

  it("installs Chromium after dependencies and runs browser suites after unit tests", () => {
    const steps = workflow.jobs?.quality?.steps ?? [];
    const runs = steps.map(stepRuns);

    const installIndex = runs.findIndex((run) => run.includes("pnpm install --frozen-lockfile"));
    const chromiumIndex = runs.findIndex((run) =>
      run.includes("pnpm exec playwright install --with-deps chromium"),
    );
    const unitIndex = runs.findIndex((run) => run.includes("pnpm test:unit"));
    const e2eIndex = runs.findIndex((run) => run.trim() === "pnpm test:e2e");
    const maintenanceIndex = runs.findIndex((run) => run.trim() === "pnpm test:e2e:maintenance");
    const productionIndex = runs.findIndex((run) => run.trim() === "pnpm test:e2e:production");
    const buildIndex = runs.findIndex((run) => run.trim() === "pnpm build");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(chromiumIndex).toBeGreaterThan(installIndex);
    expect(unitIndex).toBeGreaterThan(chromiumIndex);
    expect(e2eIndex).toBeGreaterThan(unitIndex);
    expect(maintenanceIndex).toBeGreaterThan(e2eIndex);
    expect(productionIndex).toBeGreaterThan(maintenanceIndex);
    expect(buildIndex).toBeGreaterThan(productionIndex);

    expect(runs.filter((run) => run.trim() === "pnpm test:e2e")).toHaveLength(1);
    expect(runs.filter((run) => run.trim() === "pnpm test:e2e:maintenance")).toHaveLength(1);
    expect(runs.filter((run) => run.trim() === "pnpm test:e2e:production")).toHaveLength(1);
  });

  it("uploads Playwright artifacts only on failure with the pinned action", () => {
    const steps = workflow.jobs?.quality?.steps ?? [];
    const artifactStep = steps.find((step) => {
      const uses = typeof step.uses === "string" ? step.uses : "";
      return uses.startsWith("actions/upload-artifact@");
    });

    expect(artifactStep).toBeDefined();
    expect(artifactStep?.if).toBe("failure()");
    expect(artifactStep?.uses).toBe(
      "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
    );

    const withBlock = artifactStep?.with as { path?: string } | undefined;
    expect(withBlock?.path).toContain("playwright-report/");
    expect(withBlock?.path).toContain("test-results/");
  });

  it("does not add deploy credentials or write permissions to quality", () => {
    expect(workflowSource).not.toMatch(
      /CLOUDFLARE_API_TOKEN|wrangler deploy|permissions:[\s\S]*write/,
    );
    expect(workflow.permissions).toEqual({ contents: "read" });
  });
});
