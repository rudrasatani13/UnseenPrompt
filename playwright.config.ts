import { defineConfig, devices } from "@playwright/test";

const allowedAppEnvironments = ["local", "preview", "staging", "production", "test"] as const;
const allowedMaintenanceModes = ["off", "on"] as const;

type AppEnvironment = (typeof allowedAppEnvironments)[number];
type MaintenanceMode = (typeof allowedMaintenanceModes)[number];

function readAppEnvironment(): AppEnvironment {
  const value = process.env.E2E_APP_ENV ?? "preview";

  if (!allowedAppEnvironments.includes(value as AppEnvironment)) {
    throw new Error(
      `E2E_APP_ENV must be one of ${allowedAppEnvironments.join(", ")}; received ${value}`,
    );
  }

  return value as AppEnvironment;
}

function readMaintenanceMode(): MaintenanceMode {
  const value = process.env.E2E_MAINTENANCE_MODE ?? "off";

  if (!allowedMaintenanceModes.includes(value as MaintenanceMode)) {
    throw new Error(
      `E2E_MAINTENANCE_MODE must be one of ${allowedMaintenanceModes.join(", ")}; received ${value}`,
    );
  }

  return value as MaintenanceMode;
}

const appEnvironment = readAppEnvironment();
const maintenanceMode = readMaintenanceMode();
const port = Number(process.env.E2E_PORT ?? "3100");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`E2E_PORT must be a valid TCP port; received ${String(process.env.E2E_PORT)}`);
}

const runtimeBaseUrl = `http://127.0.0.1:${port}`;
const metadataBaseUrl =
  appEnvironment === "production" ? "https://unseenprompt.com" : runtimeBaseUrl;

/*
 * Production `next start` is the locked browser target: real HTTP status codes,
 * no dev overlay, and no soft not-found documents. Env is applied to both build
 * and start so NEXT_PUBLIC_* and server env stay aligned.
 */
const productionWaitlistEnv =
  appEnvironment === "production"
    ? [
        "NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA",
        "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
        "SUPABASE_URL=https://waitlist.invalid",
        "SUPABASE_SECRET_KEY=sb_secret_local_test_value_000000000000",
        "RESEND_API_KEY=re_local_test_value_0000000000000000",
        "WAITLIST_TOKEN_SECRET=local_test_token_secret_0000000000000000",
        "WAITLIST_FROM_EMAIL=UnseenPrompt <hello@unseenprompt.com>",
      ].join(" ")
    : "";

const envPrefix = [
  `APP_ENV=${appEnvironment}`,
  `NEXT_PUBLIC_APP_URL=${metadataBaseUrl}`,
  "RELEASE_SHA=e2e",
  `MAINTENANCE_MODE=${maintenanceMode}`,
  productionWaitlistEnv,
]
  .filter(Boolean)
  .join(" ");

const serverCommand = [
  envPrefix,
  "pnpm exec next build",
  "&&",
  envPrefix,
  `pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
].join(" ");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{platform}/{arg}{ext}",
  use: {
    baseURL: runtimeBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "wide",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: serverCommand,
    url: runtimeBaseUrl,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  expect: {
    toHaveScreenshot: {
      // Font antialiasing only — do not mask content regions.
      maxDiffPixelRatio: 0.02,
    },
  },
});
