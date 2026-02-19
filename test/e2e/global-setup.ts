/**
 * Global setup for Playwright E2E tests.
 *
 * The containerlab-gui dev server now uses an in-memory file API, so there is
 * no on-disk topology reset required before test execution.
 */
export default async function globalSetup(): Promise<void> {
  console.log("[GlobalSetup] In-memory topology store; skipping filesystem reset");
}
