import { globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import globals from 'globals'
import * as tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import react from 'eslint-plugin-react'
import chai from 'eslint-plugin-chai-friendly'

export default tseslint.config(
  globalIgnores(['**/public', '**/dist']),

  // All files
  {
    languageOptions: {
      globals: globals.node
    }
  },

  // JavasScript-only
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, common()]
  },

  // TypeScript-only
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended, common('@typescript-eslint/')]
  },

  // Test-only options
  {
    files: [
      '{src,packages/*/src}/**/*.test.{ts,js}',
      '{test,packages/*/test}/**/*.{js,ts}'
    ],
    plugins: { chai },
    rules: {
      'no-unused-expressions': 'off', // disable original rule
      'chai/no-unused-expressions': 'error'
    },
    languageOptions: {
      globals: globals.mocha
    }
  },

  // Server-admin UI
  {
    settings: {
      react: {
        version: 'detect'
      }
    },
    files: ['packages/server-admin-ui/src/**/*.js'],
    extends: [react.configs.flat.recommended, common()],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: globals.browser
    },
    rules: {
      'react/prop-types': 'off',
      'react/no-string-refs': 'off',
      'react/no-direct-mutation-state': 'off'
    }
  },

  // Disable rules that prettier handles
  prettier
)

// Common rules for all files
function common(prefix = '') {
  return {
    rules: {
      [`${prefix}no-unused-vars`]: [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      [`${prefix}no-unused-expressions`]: [
        'error',
        {
          allowShortCircuit: true,
          allowTernary: true
        }
      ]
    }
  }
}
