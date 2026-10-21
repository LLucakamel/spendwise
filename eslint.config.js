import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dist-*', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Files that intentionally export helpers next to components: shadcn/ui primitives
    // (variant helpers), context providers with their hooks, the route table and the entry point.
    files: [
      'src/components/ui/**/*.tsx',
      'src/app/AppRoutes.tsx',
      'src/main.tsx',
      'src/data/DataProvider.tsx',
      'src/hooks/use-theme.tsx',
      'src/features/budgets/budgetUi.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
