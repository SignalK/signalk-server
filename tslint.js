const TSRULES = {
  'no-floating-promises': true,
  'member-access': [true, 'no-public'],
  'interface-name': false,
  'max-classes-per-file': false,
  'no-any': false
}

const UNIVERSAL_RULES = {
  prettier: true,
  semicolon: [true, 'never'],
  quotemark: [true, 'single', 'jsx-double'],
  'arrow-parens': [true, 'ban-single-arg-parens'],
  'trailing-comma': [true, { multiline: 'never', singleline: 'never' }],
  'object-literal-sort-keys': false,
  'no-console': false,
  'no-unused-expression': [true, 'allow-fast-null-checks']
}

module.exports = {
  defaultSeverity: 'error',
  rulesDirectory: ['tslint-plugin-prettier'],
  extends: ['tslint:recommended', 'tslint-config-prettier'],
  linterOptions: {
    exclude: ['node_modules/**']
  },
  jsRules: UNIVERSAL_RULES,
  rules: {
    ...UNIVERSAL_RULES,
    ...TSRULES
  }
}
