import { defineConfig, devices } from "@playwright/test"
import path from "node:path"

// End-to-end smoke tests (e2e/README.md). `pnpm test:e2e` starts `next dev` on the bookmark-test
// database through scripts/with-test-db.mjs, with mail captured to e2e/.outbox and the paid services
// switched off, then runs every flow at phone width and on desktop.
const PORT = Number(process.env.E2E_PORT) || 3040
const OUTBOX_DIR = path.join(__dirname, "e2e", ".outbox")

// Blank keys make the app take its own "not configured" paths: no Stripe checkout, no AI calls, no
// Hardcover lookups, no uploads, no social sign-in.
const STUBBED = [
  "STRIPE_SECRET_KEY",
  "STRIPE_RESTRICTED_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_WORKSPACE_ID",
  "HARDCOVER_API_TOKEN",
  "UPLOADTHING_SECRET",
  "UPLOADTHING_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_ID",
  "GITHUB_SECRET",
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
]

export default defineConfig({
  testDir: "./e2e",
  // Each flow signs up its own readers, so flows can run side by side; the first compile of each route
  // in `next dev` is slow, hence the generous timeouts.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node scripts/with-test-db.mjs pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    env: {
      MAIL_OUTBOX_DIR: OUTBOX_DIR,
      WITH_TEST_DB_BLANK: STUBBED.join(","),
      // middleware.ts reads the non-secure session cookie on http://localhost.
      DEV: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
})
