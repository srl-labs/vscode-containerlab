#!/usr/bin/env node
/**
 * Similar Files Checker
 *
 * Detects files with similar names that might indicate
 * duplicated patterns that could be consolidated.
 *
 * Examples:
 * - useFreeTextState.ts vs useFreeShapeState.ts
 * - sshxShare.ts vs gottyShare.ts
 * - NodePersistenceIO.ts vs LinkPersistenceIO.ts
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Patterns that often indicate parallel implementations
const SIMILAR_PATTERNS = [
  // Annotation types
  { pattern: /FreeText/i, counterpart: /FreeShape/i, description: 'FreeText/FreeShape' },
  // Persistence types
  { pattern: /Node(?!s)/i, counterpart: /Link/i, description: 'Node/Link' },
  { pattern: /Node(?!s)/i, counterpart: /Edge/i, description: 'Node/Edge' },
  // Share commands
  { pattern: /Sshx/i, counterpart: /Gotty/i, description: 'SSHX/GoTTY' },
  // State types
  { pattern: /Text/i, counterpart: /Shape/i, description: 'Text/Shape' },
];

/**
 * Recursively find all TypeScript files in a directory
 */
function findTsFiles(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common non-source directories
      if (entry.isDirectory()) {
        if (['node_modules', 'out', 'dist', 'dist-dev', '.git', 'legacy-backup'].includes(entry.name)) {
          continue;
        }
        findTsFiles(fullPath, files);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        // Skip test files and declaration files
        if (!entry.name.includes('.test.') && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Get the relative path from project root
 */
function getRelativePath(filePath) {
  const projectRoot = path.join(__dirname, '..');
  return path.relative(projectRoot, filePath);
}

/**
 * Check if two file names match a similar pattern
 */
function findSimilarPairs(files) {
  const pairs = [];
  const fileMap = new Map();

  // Build a map of files by their base pattern
  for (const file of files) {
    const name = path.basename(file, path.extname(file));

    for (const { pattern, counterpart, description } of SIMILAR_PATTERNS) {
      if (pattern.test(name)) {
        // Create a normalized key by replacing the pattern
        const key = name.replace(pattern, '__PATTERN__');
        if (!fileMap.has(key)) {
          fileMap.set(key, []);
        }
        fileMap.get(key).push({ file, pattern: description, original: name });
      }

      if (counterpart.test(name)) {
        // Also check counterpart
        const key = name.replace(counterpart, '__PATTERN__');
        if (!fileMap.has(key)) {
          fileMap.set(key, []);
        }
        fileMap.get(key).push({ file, pattern: description, original: name });
      }
    }
  }

  // Find groups with multiple files (potential duplicates)
  for (const [key, matches] of fileMap.entries()) {
    if (matches.length >= 2) {
      // Deduplicate by file path
      const uniqueFiles = [...new Map(matches.map(m => [m.file, m])).values()];
      if (uniqueFiles.length >= 2) {
        pairs.push({
          pattern: uniqueFiles[0].pattern,
          files: uniqueFiles.map(m => getRelativePath(m.file)),
        });
      }
    }
  }

  // Deduplicate pairs
  const seen = new Set();
  return pairs.filter(pair => {
    const key = pair.files.sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/**
 * Main function
 */
function main() {
  console.log('Checking for similar file patterns...\n');

  const files = findTsFiles(SRC_DIR);
  const similarPairs = findSimilarPairs(files);

  if (similarPairs.length === 0) {
    console.log('No similar file patterns detected.\n');
    process.exit(0);
  }

  console.log(`Found ${similarPairs.length} potential parallel implementation(s):\n`);
  console.log('─'.repeat(70));

  for (const pair of similarPairs) {
    console.log(`\nPattern: ${pair.pattern}`);
    console.log('Files:');
    for (const file of pair.files) {
      console.log(`  - ${file}`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`\nSummary: ${similarPairs.length} parallel implementation patterns detected`);
  console.log('\nThese files follow similar naming patterns and may benefit from consolidation.');
  console.log('Run "npm run lint:cpd" to see actual code duplication.\n');

  // Don't fail the build, just report
  process.exit(0);
}

main();
