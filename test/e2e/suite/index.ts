import fs from "node:fs";
import path from "node:path";

import Mocha from "mocha";

function collectTestFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
    } else if (entry.name.endsWith(".test.js")) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    timeout: 60000,
    ui: "tdd"
  });

  for (const file of collectTestFiles(__dirname)) {
    mocha.addFile(file);
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} VS Code E2E test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}
