import { defineConfig } from "@playwright/test"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required for Daily browser tests")

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "daily.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/daily",
  use: {
    baseURL: "http://127.0.0.1:3230",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev -p 3230",
    url: "http://127.0.0.1:3230/zh",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "daily-browser-test-session-secret-2026",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3230",
      NEXT_DIST_DIR: ".next-daily-test",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
})
