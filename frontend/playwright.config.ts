import { defineConfig, devices } from "@playwright/test";
import { BACKEND_DIR, E2E_API_PORT, E2E_WEB_PORT, e2eMongoUri } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One worker, in order: every test writes to the same shared database, so
  // running them in parallel would let one test's edits affect another's.
  // Each test still uses its own contacts and unique tag names.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 }, // Atlas round trips from a laptop
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: "**/responsive.spec.ts",
    },
    {
      // A phone (Chromium engine, 412px wide, touch screen) for layout checks.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: "**/responsive.spec.ts",
    },
  ],
  webServer: [
    {
      command: "npx tsx src/server.ts",
      cwd: BACKEND_DIR,
      url: `http://localhost:${E2E_API_PORT}/api/health`,
      // Never reuse a running server: it could be pointed at the dev database.
      reuseExistingServer: false,
      timeout: 60_000,
      env: { MONGODB_URI: e2eMongoUri(), PORT: String(E2E_API_PORT), NODE_ENV: "test" },
    },
    {
      command: `npx vite --port ${E2E_WEB_PORT} --strictPort`,
      url: `http://localhost:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: `http://localhost:${E2E_API_PORT}` },
    },
  ],
});
