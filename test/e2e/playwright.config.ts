import { defineConfig, devices } from "@playwright/test";

const parsedWorkers = Number.parseInt(process.env.PW_WORKERS ?? "", 10);
const workers = Number.isFinite(parsedWorkers) ? Math.max(4, parsedWorkers) : 4;

/**
 * Playwright configuration for React TopoViewer E2E tests.
 * Tests run against the Vite dev server on port 5173.
 *
 * Note: Worker count is limited to prevent overwhelming the single dev server.
 * Retries are enabled to handle flaky network/timing issues.
 */
export default defineConfig({
  globalSetup: require.resolve("./global-setup"),
  testDir: "./specs",
  // CI runners are slower and more variable; reduce intra-file parallelism to
  // avoid intermittent timeouts while still allowing worker parallelism.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Retry flaky tests - helps with timing issues and connection resets
  retries: process.env.CI ? 2 : 1,
  // Keep at least 4 workers to validate true parallel execution behavior.
  workers: process.env.CI ? 2 : 6,
  // Increase timeout for slower CI environments
  timeout: 90000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../../playwright-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Timeouts for individual actions
    actionTimeout: 20000,
    navigationTimeout: 45000
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Grant clipboard permissions for copy/paste tests
        permissions: ["clipboard-read", "clipboard-write"]
      }
    }
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 180000 : 120000,
    cwd: "../../" // Run from project root
  }
});
