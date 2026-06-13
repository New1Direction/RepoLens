import js from '@eslint/js';
import globals from 'globals';

// Flat config (ESLint 9). Vanilla ES-module Chrome extension: browser + web-
// extension globals for the app, Node globals for the test runner. Rules are
// intentionally light — advisory warnings, not a wall of errors — so the gate
// is useful without demanding a rewrite of working code.
export default [
  { ignores: ['node_modules/**', 'coverage/**', 'website/**', '.vitest/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions, ...globals.node },
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
