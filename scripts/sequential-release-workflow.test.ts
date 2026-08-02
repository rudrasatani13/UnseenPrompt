import { readFile } from "node:fs/promises";

import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const stagingModelEnvironment = {
  MODEL_PRIMARY_PROVIDER: "${{ vars.STAGING_MODEL_PRIMARY_PROVIDER }}",
  MODEL_PRIMARY_MODEL: "${{ vars.STAGING_MODEL_PRIMARY_MODEL }}",
  MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS:
    "${{ vars.STAGING_MODEL_PRIMARY_INPUT_COST_MICROS_PER_MILLION_TOKENS }}",
  MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS:
    "${{ vars.STAGING_MODEL_PRIMARY_OUTPUT_COST_MICROS_PER_MILLION_TOKENS }}",
  MODEL_FALLBACK_PROVIDER: "${{ vars.STAGING_MODEL_FALLBACK_PROVIDER }}",
  MODEL_FALLBACK_MODEL: "${{ vars.STAGING_MODEL_FALLBACK_MODEL }}",
  MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS:
    "${{ vars.STAGING_MODEL_FALLBACK_INPUT_COST_MICROS_PER_MILLION_TOKENS }}",
  MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS:
    "${{ vars.STAGING_MODEL_FALLBACK_OUTPUT_COST_MICROS_PER_MILLION_TOKENS }}",
  MODEL_TOTAL_DEADLINE_MS: "${{ vars.STAGING_MODEL_TOTAL_DEADLINE_MS }}",
  MODEL_ATTEMPT_TIMEOUT_MS: "${{ vars.STAGING_MODEL_ATTEMPT_TIMEOUT_MS }}",
  MODEL_MAX_OUTPUT_TOKENS: "${{ vars.STAGING_MODEL_MAX_OUTPUT_TOKENS }}",
} as const;

const stagingModelNames = Object.keys(stagingModelEnvironment) as Array<
  keyof typeof stagingModelEnvironment
>;

describe("sequential main release workflow", () => {
  test("runs only after CI succeeds and gates production on staging of the same SHA", async () => {
    const workflow = parse(await readFile(".github/workflows/deploy-release.yml", "utf8"));

    expect(workflow.on.workflow_run.workflows).toEqual(["Continuous Integration"]);
    expect(workflow.on.workflow_run.types).toEqual(["completed"]);
    expect(workflow.on.workflow_run.branches).toEqual(["main"]);
    expect(workflow.on.push).toBeUndefined();

    expect(workflow.jobs.gate.if).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow.jobs.gate.if).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow.jobs.gate.if).toContain("github.event.workflow_run.head_branch == 'main'");

    expect(workflow.jobs.staging.needs).toBe("gate");
    expect(workflow.jobs.production.needs).toEqual(["gate", "staging"]);
    expect(workflow.jobs.production.if).toBe("${{ vars.PRODUCTION_DEPLOY_ENABLED == 'true' }}");
    expect(workflow.jobs.production.env.RELEASE_SHA).toBe("${{ needs.gate.outputs.release_sha }}");

    const releaseCheckout = workflow.jobs.production.steps.find(
      (step: { name?: string }) => step.name === "Check out release SHA",
    );
    expect(releaseCheckout.with.ref).toBe("${{ needs.gate.outputs.release_sha }}");

    const stagingRequireSecrets = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Require staging database credentials",
    );
    expect(stagingRequireSecrets).toBeDefined();

    const stagingRequireApplicationConfig = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Require staging application configuration",
    );
    expect(stagingRequireApplicationConfig.env).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "${{ vars.STAGING_SUPABASE_URL }}",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "${{ vars.STAGING_SUPABASE_PUBLISHABLE_KEY }}",
    });

    const stagingBuild = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Build Worker",
    );
    expect(stagingBuild.env).toEqual(stagingRequireApplicationConfig.env);

    const stagingDeploy = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Deploy staging",
    );
    expect(stagingDeploy.run).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(stagingDeploy.run).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

    const stagingModelGuard = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Require staging model routing configuration",
    );
    expect(stagingModelGuard).toBeDefined();
    expect(stagingModelGuard.env).toEqual(stagingModelEnvironment);
    expect(workflow.jobs.staging.steps.indexOf(stagingModelGuard)).toBeLessThan(
      workflow.jobs.staging.steps.indexOf(stagingDeploy),
    );

    const stagingSecretGuard = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Require staging Worker provider secrets",
    );
    expect(stagingSecretGuard).toBeDefined();
    expect(stagingSecretGuard.env).toEqual({
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
    });
    expect(stagingSecretGuard.run).toContain(
      "pnpm exec wrangler secret list --env staging --format json",
    );
    expect(stagingSecretGuard.run).not.toContain("secret put");
    expect(workflow.jobs.staging.steps.indexOf(stagingSecretGuard)).toBeLessThan(
      workflow.jobs.staging.steps.indexOf(stagingDeploy),
    );

    for (const name of stagingModelNames) {
      expect(stagingDeploy.env[name]).toBe(stagingModelEnvironment[name]);
      expect(stagingDeploy.run).toContain(`--var "${name}:\${${name}}"`);
    }
    expect(stagingDeploy.run).not.toContain("--keep-vars");
    expect(stagingDeploy.run).not.toMatch(/MODEL_REVIEWER/);
    expect(Object.keys(stagingDeploy.env)).not.toEqual(
      expect.arrayContaining([
        "MODEL_REVIEWER_PROVIDER",
        "MODEL_REVIEWER_MODEL",
        "MODEL_REVIEWER_INPUT_COST_MICROS_PER_MILLION_TOKENS",
        "MODEL_REVIEWER_OUTPUT_COST_MICROS_PER_MILLION_TOKENS",
      ]),
    );

    // Provider credential values are never read from GitHub or passed as Wrangler command args.
    const workflowSource = await readFile(".github/workflows/deploy-release.yml", "utf8");
    expect(workflowSource).not.toMatch(
      /\$\{\{\s*secrets\.(?:ANTHROPIC|OPENAI|GEMINI)_API_KEY\s*\}\}/,
    );
    expect(stagingSecretGuard.run).not.toMatch(/secret put|API_KEY\s*:/);
    expect(stagingDeploy.run).not.toMatch(/(?:ANTHROPIC|OPENAI|GEMINI)_API_KEY/);

    for (const step of workflow.jobs.production.steps) {
      expect(step.run ?? "").not.toMatch(/MODEL_(PRIMARY|FALLBACK|REVIEWER|TOTAL|ATTEMPT|MAX)/);
      expect(step.env ?? {}).not.toEqual(
        expect.objectContaining(
          Object.fromEntries(stagingModelNames.map((name) => [name, expect.anything()])),
        ),
      );
    }

    const stagingSmoke = workflow.jobs.staging.steps.find(
      (step: { name?: string }) => step.name === "Smoke-test staging",
    );
    expect(stagingSmoke.env.VERIFY_AUTH_SURFACE).toBe("true");

    const recoveryGate = workflow.jobs.production.steps.find(
      (step: { name?: string }) => step.name === "Require backup/PITR confirmation",
    );
    expect(recoveryGate.env.PRODUCTION_DB_RECOVERY_CONFIRMED).toBe(
      "${{ vars.PRODUCTION_DB_RECOVERY_CONFIRMED }}",
    );
  });
});
