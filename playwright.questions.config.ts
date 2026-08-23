import { defineConfig, devices } from "@playwright/test"
import { requireQuestionTestDatabaseUrl } from "./tests/question-test-database"

const { url: databaseUrl } = requireQuestionTestDatabaseUrl(
  process.env.QUESTION_TEST_DATABASE_URL
)

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "questions.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/questions",
  use: {
    baseURL: "http://127.0.0.1:3250",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-light",
      use: { ...devices["Desktop Chrome"], channel: "chrome", colorScheme: "light" },
    },
    {
      name: "desktop-dark",
      use: { ...devices["Desktop Chrome"], channel: "chrome", colorScheme: "dark" },
    },
    {
      name: "mobile-light",
      use: { ...devices["Pixel 7"], channel: "chrome", colorScheme: "light" },
    },
    {
      name: "mobile-dark",
      use: { ...devices["Pixel 7"], channel: "chrome", colorScheme: "dark" },
    },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --webpack -p 3250",
    url: "http://127.0.0.1:3250/admin/questions",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      QUESTION_TEST_DATABASE_URL: databaseUrl,
      SESSION_SECRET: "questions-browser-test-session-secret-2026",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3250",
      NEXT_DIST_DIR: ".next-questions-test",
      NEXT_TELEMETRY_DISABLED: "1",
      QUESTION_TEST_DISABLE_WEBPACK_CACHE: "1",
    },
  },
})
