import { defineConfig, devices } from "@playwright/test"
import { requireDocumentTestDatabaseUrl } from "./tests/document-test-database"

const database = requireDocumentTestDatabaseUrl(process.env.DOCUMENT_TEST_DATABASE_URL)
const baseURL = "http://127.0.0.1:3255"
process.env.DATABASE_URL = database
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["document-full-app.spec.ts"],
  workers: 1,
  timeout: 120_000,
  outputDir: "./test-results/documents",
  expect: { timeout: 10_000 },
  use: { baseURL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [{ name: "documents-full-app", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3255",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: database,
      SESSION_SECRET: "document-test-session-secret-disposable-only-2026",
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_DIST_DIR: ".next-document-tests",
      UPLOAD_DIR: ".tmp-pgtest/document-test-uploads",
    },
  },
})
