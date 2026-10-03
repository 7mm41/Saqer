// Lint rules for the whole monorepo. Formatting is Prettier's job; this catches bugs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/next-env.d.ts', 'legacy/**', 'tech/ios/**', 'e2e/shots*/**', '**/*.tsbuildinfo', '.claude/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // the API returns loosely typed JSON to the UIs; views are typed at the edges
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['error', { allow: ['warn', 'error', 'log'] }],
      eqeqeq: ['error', 'smart'],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.name='parseFloat']", message: 'Money is integer baisa: use parseOMR/parsePercent from @katf/shared.' },
      ],
    },
  },
  {
    files: ['web/**/*.tsx', 'tech/src/**/*.tsx', 'admin/src/**/*.tsx', 'ui/src/**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    // service worker and scripts
    files: ['tech/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
);
