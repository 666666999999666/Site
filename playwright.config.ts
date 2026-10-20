import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["editor.spec.ts", "question-library.spec.ts", "document-workflow.spec.ts", "reader-layout.spec.ts", "editor-images.spec.ts", "reader-interactions.spec.ts", "blog-discovery.spec.ts", "admin-refactor.spec.ts"],
  fullyParallel: false,
  workers: 1,
  outputDir: "./test-results/editor",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3220",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
          : { channel: "chrome" }),
      },
    },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev tests/editor-harness --webpack -H 127.0.0.1 -p 3220",
    url: "http://127.0.0.1:3220",
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 120_000,
  },
})
