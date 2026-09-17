import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const DANGEROUS_HTML_MESSAGE =
  'dangerouslySetInnerHTML is banned: transaction descriptions and merchant text are untrusted. Render as plain text (see lib/sanitize.ts).'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'public/mockServiceWorker.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Security: no HTML injection surface anywhere in the app (CLAUDE.md).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXIdentifier[name='dangerouslySetInnerHTML']",
          message: DANGEROUS_HTML_MESSAGE,
        },
        { selector: "Identifier[name='dangerouslySetInnerHTML']", message: DANGEROUS_HTML_MESSAGE },
        { selector: "Literal[value='dangerouslySetInnerHTML']", message: DANGEROUS_HTML_MESSAGE },
      ],
      // Money safety: Number(), parseFloat and arithmetic on formatted strings are reviewed by hand;
      // the lint layer at least blocks implicit any and unhandled promises.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Generated shadcn components export variants alongside components.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/array-type': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      // Asymmetric matchers (expect.stringMatching, …) are typed `any`.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  prettier,
)
