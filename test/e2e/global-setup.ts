/**
 * Global setup for Playwright E2E tests.
 * Resets disk topology files to their original state before tests run.
 */

import * as fs from 'fs';
import * as path from 'path';

const TOPOLOGIES_DIR = path.join(__dirname, '../../dev/topologies');
const TOPOLOGIES_ORIGINAL_DIR = path.join(__dirname, '../../dev/topologies-original');

export default async function globalSetup(): Promise<void> {
  console.log('[GlobalSetup] Resetting disk files from topologies-original...');

  try {
    // Ensure topologies directory exists (it's gitignored so may not exist in CI)
    await fs.promises.mkdir(TOPOLOGIES_DIR, { recursive: true });

    // First, delete all annotation files in topologies (clean slate)
    const currentFiles = await fs.promises.readdir(TOPOLOGIES_DIR);
    for (const file of currentFiles) {
      if (file.endsWith('.annotations.json')) {
        const filePath = path.join(TOPOLOGIES_DIR, file);
        try {
          await fs.promises.unlink(filePath);
          console.log('[GlobalSetup] Deleted:', file);
        } catch {
          // Ignore errors
        }
      }
    }

    // Copy all files from topologies-original to topologies
    const originalFiles = await fs.promises.readdir(TOPOLOGIES_ORIGINAL_DIR);
    for (const file of originalFiles) {
      const srcPath = path.join(TOPOLOGIES_ORIGINAL_DIR, file);
      const destPath = path.join(TOPOLOGIES_DIR, file);

      const content = await fs.promises.readFile(srcPath, 'utf8');
      await fs.promises.writeFile(destPath, content, 'utf8');
      console.log('[GlobalSetup] Restored:', file);
    }

    console.log('[GlobalSetup] Disk reset complete');
  } catch (err) {
    console.error('[GlobalSetup] Failed to reset disk files:', err);
    throw err;
  }
}
