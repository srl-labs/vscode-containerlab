#!/usr/bin/env node
/**
 * Barrel Export Limit Checker
 *
 * Scans all index.ts files in src/ and counts exports.
 * Fails if any barrel file exceeds the configured limit.
 */

const fs = require("fs");
const path = require("path");

// Configuration
const DEFAULT_MAX_EXPORTS = 50;
const CUSTOM_LIMITS = {
  // Allow larger barrels for specific entry points
  "src/commands/index.ts": 120,
  "src/reactTopoViewer/webview/hooks/index.ts": 65,
  "src/reactTopoViewer/webview/hooks/groups/index.ts": 80, // Consolidated from core/interactions/undo/utils
  "src/reactTopoViewer/shared/parsing/index.ts": 60,
  "src/reactTopoViewer/shared/io/index.ts": 60,
  "src/treeView/index.ts": 60
};

const SRC_DIR = path.join(__dirname, "..", "src");

/**
 * Recursively find all index.ts files in a directory
 */
function findBarrelFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findBarrelFiles(fullPath, files);
    } else if (entry.name === "index.ts" || entry.name === "index.tsx") {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Count export statements in a file
 */
function countExports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  let exportCount = 0;
  let inMultiLineExport = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      continue;
    }

    // Count multi-line exports (export { a, b, c } from ...)
    if (inMultiLineExport) {
      // Count each identifier on this line
      const identifiers = trimmed.match(/\b\w+\b/g) || [];
      // Filter out keywords
      const keywords = ["from", "type", "as", "export", "import"];
      exportCount += identifiers.filter(
        (id) => !keywords.includes(id) && !id.startsWith("'") && !id.startsWith('"')
      ).length;

      if (trimmed.includes("}")) {
        inMultiLineExport = false;
      }
      continue;
    }

    // Named export declarations: export { ... } or export { ... } from '...'
    if (/^export\s*\{/.test(trimmed)) {
      if (trimmed.includes("}")) {
        // Single line export
        const match = trimmed.match(/export\s*(type\s*)?\{([^}]+)\}/);
        if (match) {
          const exports = match[2]
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);
          exportCount += exports.length;
        }
      } else {
        // Multi-line export starts
        inMultiLineExport = true;
        const match = trimmed.match(/export\s*(type\s*)?\{(.*)$/);
        if (match && match[2]) {
          const exports = match[2]
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);
          exportCount += exports.length;
        }
      }
      continue;
    }

    // Single export: export const/function/class/type/interface
    if (/^export\s+(const|let|var|function|class|type|interface|enum|abstract)\s+/.test(trimmed)) {
      exportCount++;
      continue;
    }

    // Default export
    if (/^export\s+default\s+/.test(trimmed)) {
      exportCount++;
      continue;
    }

    // Re-export all (should be banned, but count anyway)
    if (/^export\s+\*\s+from/.test(trimmed)) {
      exportCount += 10; // Penalize wildcard re-exports
      continue;
    }
  }

  return exportCount;
}

/**
 * Get the relative path from project root
 */
function getRelativePath(filePath) {
  const projectRoot = path.join(__dirname, "..");
  return path.relative(projectRoot, filePath);
}

/**
 * Main function
 */
function main() {
  console.log("Checking barrel file export counts...\n");

  const barrelFiles = findBarrelFiles(SRC_DIR);
  const violations = [];
  const results = [];

  for (const filePath of barrelFiles) {
    const relativePath = getRelativePath(filePath);
    const exportCount = countExports(filePath);
    const maxExports = CUSTOM_LIMITS[relativePath] || DEFAULT_MAX_EXPORTS;

    results.push({ path: relativePath, count: exportCount, max: maxExports });

    if (exportCount > maxExports) {
      violations.push({
        path: relativePath,
        count: exportCount,
        max: maxExports,
        over: exportCount - maxExports
      });
    }
  }

  // Sort by export count (descending) for the summary
  results.sort((a, b) => b.count - a.count);

  // Print top 10 largest barrels
  console.log("Top 10 largest barrel files:");
  console.log("─".repeat(60));
  for (const result of results.slice(0, 10)) {
    const status = result.count > result.max ? "❌" : "✓";
    console.log(`${status} ${result.path}`);
    console.log(`   Exports: ${result.count} / ${result.max} max`);
  }
  console.log();

  // Report violations
  if (violations.length > 0) {
    console.log(`\n⚠️  Found ${violations.length} barrel file(s) exceeding export limits:\n`);
    for (const v of violations) {
      console.log(`  ${v.path}`);
      console.log(`    Exports: ${v.count} (${v.over} over limit of ${v.max})`);
    }
    console.log("\nTo fix:");
    console.log("  1. Split the barrel into smaller domain-specific barrels");
    console.log("  2. Encourage direct imports from sub-modules");
    console.log("  3. If necessary, increase the limit in scripts/check-barrel-exports.js\n");

    // Exit with error if --strict flag is passed
    if (process.argv.includes("--strict")) {
      process.exit(1);
    }
    process.exit(0);
  }

  console.log(`✓ All ${barrelFiles.length} barrel files are within export limits\n`);
  process.exit(0);
}

main();
