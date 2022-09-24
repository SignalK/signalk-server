// eslint-disable-next-line no-undef
module.exports = {
  root: true,
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2019,
    sourceType: 'module'
  },
  env: {
    node: true,
    es2019: true
  },
  overrides: [
    {
      files: ['**/*.ts'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier'
      ],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint']
    }
  ]
}
