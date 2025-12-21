// eslint.config.mjs  – works with ESLint 9+
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import importPlugin from 'eslint-plugin-import-x';
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
    plugins: { '@typescript-eslint': tseslint.plugin, sonarjs, 'import-x': importPlugin, boundaries },
    settings: {
      'boundaries/elements': [
        // ReactTopoViewer layers
        { type: 'rtv-extension', pattern: 'src/reactTopoViewer/extension/**', mode: 'file' },
        { type: 'rtv-webview', pattern: 'src/reactTopoViewer/webview/**', mode: 'file' },
        { type: 'rtv-shared', pattern: 'src/reactTopoViewer/shared/**', mode: 'file' },
        // Main extension layers
        { type: 'commands', pattern: 'src/commands/**', mode: 'file' },
        { type: 'treeView', pattern: 'src/treeView/**', mode: 'file' },
        { type: 'services', pattern: 'src/services/**', mode: 'file' },
        { type: 'utils', pattern: 'src/utils/**', mode: 'file' },
        { type: 'helpers', pattern: 'src/helpers/**', mode: 'file' },
        { type: 'types', pattern: 'src/types/**', mode: 'file' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', 'src/extension.ts', 'src/globals.ts'],
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
      'import-x/no-duplicates': 'error',
      'import-x/order': ['warn', {
        'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always'
      }],
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'import-x/max-dependencies': ['warn', { max: 15 }],

      // ─── Consistent type imports ───
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],

      // ─── Module boundary rules ───
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // ReactTopoViewer layer boundaries
          { from: 'rtv-extension', allow: ['rtv-extension', 'rtv-shared'] },
          { from: 'rtv-webview', allow: ['rtv-webview', 'rtv-shared'] },
          { from: 'rtv-shared', allow: ['rtv-shared'] },
          // Main extension layer boundaries
          { from: 'commands', allow: ['commands', 'services', 'utils', 'helpers', 'types', 'treeView'] },
          { from: 'treeView', allow: ['treeView', 'services', 'utils', 'helpers', 'types'] },
          { from: 'services', allow: ['services', 'utils', 'helpers', 'types'] },
          { from: 'utils', allow: ['utils', 'types'] },
          { from: 'helpers', allow: ['helpers', 'types'] },
          { from: 'types', allow: ['types'] },
        ],
      }],

      // ─── Cross-layer import restrictions ───
      'import-x/no-restricted-paths': ['error', {
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
          // TreeView cannot import from commands
          {
            target: './src/treeView/**/*',
            from: './src/commands/**/*',
            message: 'TreeView cannot import from Commands. Use Services layer.',
          },
          // Commands should only import from treeView barrel
          {
            target: './src/commands/**/*',
            from: './src/treeView/**/!(index).ts',
            message: 'Commands should import from treeView/index.ts only.',
          },
        ],
      }],

      // ─── Type safety rules (warnings for gradual adoption) ───
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // ─── Complexity and readability rules ───
      'no-nested-ternary': 'error',
      'max-params': ['warn', { max: 10 }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // ─── Ban wildcard re-exports ───
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message: 'Use named re-exports instead of "export * from"'
        }
      ],
    },
  },

  /* ---------- Ban re-exports outside index.ts ---------- */
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration[source]',
          message: 'Re-exports only allowed in index.ts files'
        },
        {
          selector: 'ExportAllDeclaration',
          message: 'Use named re-exports instead of "export * from"'
        }
      ]
    }
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
  },

  /* ---------- Test files: relax type safety rules ---------- */
  {
    files: ['test/**/*.ts', 'test/**/*.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      'no-console': 'off',
    }
  }
];
