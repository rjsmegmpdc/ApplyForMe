import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import { E2E_BASE_URL, E2E_DB_URL, E2E_PORT } from "./e2e/support/constants";

// Use the pre-installed Chromium when PLAYWRIGHT_BROWSERS_PATH points at a
// cache that matches this Playwright version; otherwise fall back to a system
// chromium binary if one is provided via E2E_CHROMIUM_PATH.
const chromiumOverride = process.env.E2E_CHROMIUM_PATH;
const launchOptions =
  chromiumOverride && fs.existsSync(chromiumOverride) ? { executablePath: chromiumOverride } : {};

export default defineConfig({
  testDir: "./e2e",
  // Tests share one SQLite database and one `next dev` server, so keep a
  // modest worker count to avoid write contention and compile stampedes.
  workers: process.env.CI ? 1 : 2,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    colorScheme: "light",
    launchOptions,
  },
  projects: [
    // 1. Log in once per role through the real PIN login form and save the
    //    session cookies (e2e/.auth/<role>.json).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // 2. The main suite.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /destructive\.spec\.ts/],
    },
    // 3. "Delete Everything" wipes the database, so it runs last, on its own.
    {
      name: "destructive",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["chromium"],
      testMatch: /destructive\.spec\.ts/,
    },
  ],
  webServer: {
    // Fresh throwaway SQLite DB + seed, then the Next.js dev server.
    command: `node e2e/support/prepare-db.mjs && npx next dev --turbopack --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/login`,
    // Always start our own server so every run gets a freshly seeded DB.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
    stderr: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
    env: {
      DATABASE_URL: E2E_DB_URL,
      // Test-only values; not secrets.
      NEXTAUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      NEXTAUTH_URL: E2E_BASE_URL,
      AUTH_TRUST_HOST: "true",
      WEBAUTHN_RP_ID: "localhost",
      WEBAUTHN_ORIGIN: E2E_BASE_URL,
      // Blank out optional integrations so nothing external is contacted:
      // OAuth providers are not registered and email goes to the console.
      GOOGLE_CLIENT_ID: "",
      AZURE_AD_CLIENT_ID: "",
      EMAIL_SERVER: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
