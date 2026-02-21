const { defineConfig, globalIgnores } = require('eslint/config')
const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier/flat')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const reactCompiler = require('eslint-plugin-react-compiler')
const eslintReact = require('@eslint-react/eslint-plugin')
const chai = require('eslint-plugin-chai-friendly')

module.exports = defineConfig([
  globalIgnores([
    '**/public',
    '**/public_src',
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
    'packages/assemblyscript-plugin-sdk/build/**',
    // Legacy admin UI - kept as fallback, not actively maintained
    'packages/server-admin-ui/**'
  ]),

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

  // Server-admin UI React 19 specific options
  {
    settings: {
      react: {
        version: 'detect'
      }
    },
    files: ['packages/server-admin-ui-react19/src/**/*.{js,jsx,ts,tsx}'],
    extends: [
      common('@typescript-eslint/'),
      tseslint.configs.recommended,
      react.configs.flat.recommended,
      eslintReact.configs['recommended-typescript']
    ],
    plugins: {
      'react-hooks': reactHooks,
      'react-compiler': reactCompiler
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        project: './packages/server-admin-ui-react19/tsconfig.json'
      },
      globals: {
        ...globals.browser
      }
    },
    rules: {
      // React hooks rules
      ...reactHooks.configs.recommended.rules,
      // React compiler rules
      'react-compiler/react-compiler': 'warn',
      // React 17+ with new JSX transform doesn't require React in scope
      'react/react-in-jsx-scope': 'off',
      // Disable prop-types (using TypeScript)
      'react/prop-types': 'off',
      'react/no-string-refs': 'off',
      'react/no-direct-mutation-state': 'off'
    }
  },

  // Streams package - uses synchronous require() for lazy/dynamic imports
  {
    files: ['packages/streams/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
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
