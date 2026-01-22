const { defineConfig, globalIgnores } = require('eslint/config')
const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier/flat')
const react = require('eslint-plugin-react')
const chai = require('eslint-plugin-chai-friendly')
const importPlugin = require('eslint-plugin-import')

module.exports = defineConfig([
  globalIgnores([
    '**/public',
    '**/dist',
    '**/.__mf__temp',
    // WASM plugin examples - AssemblyScript has different semantics
    'examples/wasm-plugins/**/assembly/**',
    // AssemblyScript SDK - decorators and types not compatible with ESLint
    'packages/assemblyscript-plugin-sdk/assembly/**',
    // Auto-generated WASM bindings (created by AssemblyScript compiler)
    'examples/wasm-plugins/**/build/**',
    'examples/wasm-plugins/**/plugin.js',
    'examples/wasm-plugins/**/plugin.d.ts',
    'packages/assemblyscript-plugin-sdk/build/**'
  ]),

  // TypeScript options
  {
    files: ['**/*.ts'],
    extends: [common('@typescript-eslint/'), tseslint.configs.recommended],
    plugins: {
      import: importPlugin
    },
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.node
    },
    rules: {
      'import/no-extraneous-dependencies': 'error'
    }
  },

  // JavasScript-only options
  {
    files: ['**/*.js'],
    extends: [common(), js.configs.recommended],
    plugins: {
      import: importPlugin
    },
    languageOptions: {
      globals: globals.node
    },
    rules: {
      'import/no-extraneous-dependencies': 'error'
    }
  },

  // Test-only options
  {
    files: [
      '{src,packages/*/src}/**/*.test.{ts,js}',
      '{test,packages/*/test}/**/*.{js,ts}'
    ],
    plugins: {
      chai,
      import: importPlugin
    },
    rules: {
      'no-unused-expressions': 'off', // disable original rule
      'chai/no-unused-expressions': 'error',
      'import/no-extraneous-dependencies': ['error', { devDependencies: true }]
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
    plugins: {
      import: importPlugin
    },
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
      'react/no-direct-mutation-state': 'off',
      'import/no-extraneous-dependencies': 'error'
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
