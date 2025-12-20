// eslint.config.mjs  – works with ESLint 9+
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import';
import boundaries from 'eslint-plugin-boundaries';
import unicorn from 'eslint-plugin-unicorn';

export default [
  /* ─── files & globs ESLint must ignore ─────────────────────────── */
  {
    ignores: [
      '**/*.js',          // ← ignore *all* JavaScript bundles
      'out/**',
      'dist/**',
      'dist-dev/**',
      'node_modules/**',
      '.vscode-test.mjs',  // VS Code test harness
      'legacy-backup/**',   // Legacy backup files
      'labs/**',            // containerlab lab files
      'dev/**',             // Vite dev server files
      "src/utils/consts.ts"
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
        project: ['./tsconfig.json', './test/tsconfig.json', './test/e2e/tsconfig.json'],
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
        fetch: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    },
    plugins: { '@typescript-eslint': tseslint.plugin, sonarjs, import: importPlugin, boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'extension', pattern: 'src/reactTopoViewer/extension/**' },
        { type: 'webview', pattern: 'src/reactTopoViewer/webview/**' },
        { type: 'shared', pattern: 'src/reactTopoViewer/shared/**' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx'],
    },
    // merge the two rule-sets
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...sonarjs.configs.recommended.rules,
      // Use TypeScript's noUnused* diagnostics instead of duplicating in ESLint
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // disallow any trailing whitespace
      'no-trailing-spaces': ['error', {
        skipBlankLines: false,    // also flag lines that are purely whitespace
        ignoreComments: false     // also flag whitespace at end of comments
      }],

      // ─── Complexity rules ───
      'complexity': ['error', { max: 15 }],
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-duplicate-string': 'error',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      // Extra SonarJS rules
      'sonarjs/no-nested-template-literals': 'error',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/no-inverted-boolean-check': 'error',

      // ─── Stricter TypeScript rules ───
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // ─── Import rules ───
      'import/no-duplicates': 'error',
      'import/order': ['warn', {
        'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always'
      }],
      'import/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'import/max-dependencies': ['warn', { max: 15 }],

      // ─── Consistent type imports ───
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],

      // ─── Module boundary rules (reactTopoViewer) ───
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          { from: 'extension', allow: ['extension', 'shared'] },
          { from: 'webview', allow: ['webview', 'shared'] },
          { from: 'shared', allow: ['shared'] },
        ],
      }],

      // ─── Cross-layer import restrictions ───
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/reactTopoViewer/webview/**/*',
            from: './src/reactTopoViewer/extension/**/*',
            message: 'Webview cannot import from extension layer',
          },
          {
            target: './src/reactTopoViewer/extension/**/*',
            from: './src/reactTopoViewer/webview/**/*',
            message: 'Extension cannot import from webview layer',
          },
        ],
      }],
    },
  },

  /* ---------- topoViewer: max-lines limit ---------- */
  {
    files: ['src/topoViewer/**/*.ts', 'src/topoViewer/**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }]
    }
  },

  /* ---------- reactTopoViewer: max-lines limit ---------- */
  {
    files: ['src/reactTopoViewer/**/*.ts', 'src/reactTopoViewer/**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }]
    }
  },

  /* ---------- React & Hooks rules for webview ---------- */
  {
    files: ['src/reactTopoViewer/webview/**/*.tsx', 'src/topoViewer/**/*.tsx'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/react-in-jsx-scope': 'off',  // Not needed in React 17+
      'react/prop-types': 'off',          // Using TypeScript
    }
  },

  /* ---------- Filename conventions: React components (PascalCase) ---------- */
  {
    files: ['src/reactTopoViewer/webview/components/**/*.tsx'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'pascalCase' }],
    }
  },

  /* ---------- Filename conventions: Hooks (camelCase) ---------- */
  {
    files: ['src/reactTopoViewer/webview/hooks/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', {
        case: 'camelCase',
        ignore: ['^index\\.ts$'],
      }],
    }
  }
];
