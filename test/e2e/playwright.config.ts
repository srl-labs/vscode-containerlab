import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for React TopoViewer E2E tests.
 * Tests run against the Vite dev server on port 5173.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // Run sequentially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for dev server
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../../playwright-report' }]
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    cwd: '../../' // Run from project root
  }
});
