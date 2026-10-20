import { defineConfig, devices } from "@playwright/test"
import { requireQuestionTestDatabaseUrl } from "./tests/question-test-database"

const { url: databaseUrl } = requireQuestionTestDatabaseUrl(
  process.env.QUESTION_TEST_DATABASE_URL
)
const browserLaunch = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
  : { channel: "chrome" }

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
      use: { ...devices["Desktop Chrome"], ...browserLaunch, colorScheme: "light" },
    },
    {
      name: "desktop-dark",
      use: { ...devices["Desktop Chrome"], ...browserLaunch, colorScheme: "dark" },
    },
    {
      name: "mobile-light",
      use: { ...devices["Pixel 7"], ...browserLaunch, colorScheme: "light" },
    },
    {
      name: "mobile-dark",
      use: { ...devices["Pixel 7"], ...browserLaunch, colorScheme: "dark" },
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_FULL_APP_PRODUCTION === "1"
      ? "node node_modules/next/dist/bin/next build --webpack && node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3250"
      : "node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3250",
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
