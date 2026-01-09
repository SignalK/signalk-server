const { defineConfig, globalIgnores } = require('eslint/config')
const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier/flat')
const react = require('eslint-plugin-react')
const chai = require('eslint-plugin-chai-friendly')

module.exports = defineConfig([
  globalIgnores(['**/public', '**/dist', '**/.__mf__temp']),

  // TypeScript options
  {
    files: ['**/*.ts'],
    extends: [common('@typescript-eslint/'), tseslint.configs.recommended],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.node
    }
  },

  // JavasScript-only options
  {
    files: ['**/*.js'],
    extends: [common(), js.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
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
      parser: tseslint.parser,
      globals: globals.mocha
    }
  },

  // Server-admin UI specific options
  {
    settings: {
      react: {
        version: 'detect'
      }
    },
    files: ['packages/server-admin-ui/src/**/*.js'],
    extends: [common(), react.configs.flat.recommended],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'react/prop-types': 'off',
      'react/no-string-refs': 'off',
      'react/no-direct-mutation-state': 'off'
    }
  },

  // Disable rules that prettier handles
  prettier
])

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
      ],
      'no-return-assign': ['error', 'always'],
      eqeqeq: ['error', 'always']
    }
  }
}
