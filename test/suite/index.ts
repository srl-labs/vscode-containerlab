import Mocha from 'mocha';
import glob = require('glob');
import * as path from 'path';

/**
 * Run the Mocha test suite.
 */
export function run(): Promise<void> {
  // Use the TDD interface so that globals like `suite` and `test` are defined.
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  // Resolve the root folder for tests (adjust if needed)
  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    // Find all test files ending with .test.js in the output directory.
    glob('**/*.test.js', { cwd: testsRoot }, (err: Error | null, files: string[]) => {
      if (err) {
        return reject(err);
      }

      // Add each test file to Mocha
      files.forEach((file: string) => {
        mocha.addFile(path.resolve(testsRoot, file));
      });

      try {
        mocha.run((failures: number) => {
          if (failures > 0) {
            return reject(new Error(`${failures} tests failed.`));
          }
          resolve();
        });
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  });
}
