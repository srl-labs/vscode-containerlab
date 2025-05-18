// eslint.config.mjs  – works with ESLint 9+
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  /* ─── files & globs ESLint must ignore ─────────────────────────── */
  {
    ignores: [
      '**/*.js',          // ← ignore *all* JavaScript bundles
      'out/**',
      'dist/**',
      'node_modules/**',
      '.vscode-test.mjs'  // VS Code test harness
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
        project: './tsconfig.json',  // must include all src TS
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    // merge the two rule-sets
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules
    }
  }
];
