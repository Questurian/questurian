import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },

  // ============================================================================
  // ARCHITECTURE BOUNDARIES ENFORCEMENT
  // ============================================================================
  // This configuration enforces one-way data flow:
  //   Shared code → Feature code → Application code
  //
  // Rules:
  // - Shared: Can only import from other shared modules
  // - Features: Can import from shared + same feature (never other features)
  // - App: Can import from any feature + shared (glue layer)
  // ============================================================================
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        // ======================================================================
        // SHARED: Global utilities, components, services
        // ======================================================================
        {
          type: 'shared',
          pattern: ['src/shared/**/*'],
          mode: 'full',
        },

        // ======================================================================
        // FEATURE: Domain-specific business logic (locations, etc.)
        // ======================================================================
        {
          type: 'feature',
          pattern: ['src/features/*/**/*'],
          mode: 'full',
          capture: ['featureName'],
        },

        // ======================================================================
        // APP: Application bootstrap, routing, composition
        // ======================================================================
        {
          type: 'app',
          pattern: ['src/app/**/*'],
          mode: 'full',
        },

        // ======================================================================
        // NEVER IMPORT: Files that should never be imported (tests, etc.)
        // ======================================================================
        {
          type: 'never-import',
          pattern: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}'],
          mode: 'full',
        },
      ],
      'boundaries/ignore': ['**/*.css', '**/*.scss', '**/*.svg', '**/*.png', '**/*.jpg'],
    },
    rules: {
      // ========================================================================
      // RULE: Enforce import boundaries
      // ========================================================================
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // ==================================================================
            // SHARED can import from:
            // - Other shared modules only
            // ==================================================================
            {
              from: ['shared'],
              allow: ['shared'],
            },

            // ==================================================================
            // FEATURE can import from:
            // - Shared modules
            // - Same feature only (using capture group)
            // ==================================================================
            {
              from: ['feature'],
              allow: [
                'shared',
                ['feature', { featureName: '${from.featureName}' }],
              ],
            },

            // ==================================================================
            // APP can import from:
            // - Other app files (for App.tsx, routes, etc.)
            // - Any feature
            // - Shared modules
            // ==================================================================
            {
              from: ['app'],
              allow: ['app', 'shared', 'feature'],
            },

            // ==================================================================
            // NEVER IMPORT cannot be imported by anyone
            // ==================================================================
            {
              from: ['shared', 'feature', 'app'],
              disallow: ['never-import'],
              message: 'Test files should never be imported',
            },
          ],
        },
      ],
    },
  },
])
