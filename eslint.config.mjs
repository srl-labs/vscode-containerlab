// eslint.config.mjs  – works with ESLint 9+
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import aggregateComplexity from './eslint-plugin-aggregate-complexity.mjs';

export default [
  /* ─── files & globs ESLint must ignore ─────────────────────────── */
  {
    ignores: [
      '**/*.js',          // ← ignore *all* JavaScript bundles
      'out/**',
      'dist/**',
      'node_modules/**',
      '.vscode-test.mjs',  // VS Code test harness
      'legacy-backup/**',   // Legacy backup files
      'labs/**'            // containerlab lab files
    ]
  },

  /* ---------- every other JS/JSON file ---------- */
  eslint.configs.recommended,   // same as "eslint:recommended"

  /* ---------- TypeScript (syntax + type-aware) ---------- */
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json', './test/tsconfig.json'],
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tseslint.plugin, sonarjs, unicorn, 'aggregate-complexity': aggregateComplexity },
    // merge the rule-sets (Unicorn rules are disabled by default)
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...sonarjs.configs.recommended.rules,
      // disallow any trailing whitespace
      'no-trailing-spaces': ['error', {
        skipBlankLines: false,    // also flag lines that are purely whitespace
        ignoreComments: false     // also flag whitespace at end of comments
      }],
      'complexity': ['error', { max: 15 }],
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': 'error',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      'aggregate-complexity/aggregate-complexity': ['error', { max: 15 }]

    }
  },

  /* ---------- Extension runtime (Node) – enforce Node protocol imports ---------- */
  {
    files: ['src/**/*.ts', '!src/topoViewer/webview-ui/**'],
    plugins: { unicorn },
    rules: {
      'unicorn/prefer-node-protocol': 'error'
    }
  },

  /* ---------- Webview UI (browser) – turn off Node-specific rules ---------- */
  {
    files: ['src/topoViewer/webview-ui/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/prefer-global-this': 'off'
    }
  },

  /* ---------- Tests – relax module/style constraints ---------- */
  {
    files: ['test/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': 'off',
      'unicorn/import-style': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/prefer-module': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/prefer-top-level-await': 'off'
    }
  },

  /* ---------- Declarations – avoid false-positives in d.ts ---------- */
  {
    files: ['**/*.d.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/require-module-specifiers': 'off',
      'unicorn/no-abusive-eslint-disable': 'off'
    }
  }

];
