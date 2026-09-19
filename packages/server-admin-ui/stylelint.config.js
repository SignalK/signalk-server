/** @type {import('stylelint').Config} */

export default {
  extends: ['stylelint-config-standard-scss'],

  ignoreFiles: ['./src/styles/core/**'],

  rules: {
    // 1. Ban hex colors everywhere (except ignored files)
    'color-no-hex': [
      true,
      {
        severity: 'error',
        message:
          'Use a CSS variable (var(--bs-*) or var(--sk-*)) instead of a hex color'
      }
    ],

    // 2. Ban named colors (red, white, black, …)
    'color-named': [
      'never',
      {
        severity: 'error',
        message:
          'Use a CSS variable (var(--bs-*) or var(--sk-*)) instead of a named color'
      }
    ],

    // 3. Ban color functions with no legitimate var()-wrapped use in this codebase
    //    (rgb/hsl/hwb are governed by declaration-property-value-disallowed-list instead,
    //    since those are used legitimately with var(--bs-*-rgb) + alpha)
    'function-disallowed-list': [
      ['/^lab/i', '/^lch/i', '/^oklab/i', '/^oklch/i', 'color', 'gray'],
      {
        severity: 'error',
        message:
          'Use a CSS variable (var(--bs-*) or var(--sk-*)) instead of a color function'
      }
    ],

    // 4. Ban literal values inside rgb()/rgba()/hsl()/hsla()/hwb() (e.g. rgba(220, 53, 69, 0.5))
    //    while allowing var()-wrapped tokens combined with an alpha value
    //    (e.g. rgb(var(--bs-primary-rgb), 0.1)) — Bootstrap's own documented pattern
    //    for applying opacity to a token color. Matches on "function( digit"
    //    so anything starting with var(...) passes through untouched.
    'declaration-property-value-disallowed-list': [
      {
        '/^(?!--)/': [/rgba?\(\s*\d/i, /hsla?\(\s*\d/i, /hwb\(\s*\d/i]
      },
      {
        severity: 'error',
        message:
          'Use a CSS variable (var(--bs-*) or var(--sk-*)) instead of a literal color function value'
      }
    ],

    // Disable certain rules:
    'selector-class-pattern': null, // Bootstrap / CoreUI classes
    'custom-property-pattern': null, // --bs-* and --sk-* are fine
    'scss/dollar-variable-pattern': null, // Bootstrap’s $ variables
    'no-descending-specificity': null, // common with Bootstrap overrides
    'scss/comment-no-empty': null, // permit empty comments (eg bs style comments)
    'scss/dollar-variable-empty-line-before': null, // dont manage empty lines
    'custom-property-empty-line-before': null, // dont manage empty lines
    'scss/double-slash-comment-empty-line-before': null, // dont manage empty lines
    'comment-empty-line-before': null, // dont manage empty lines
    'at-rule-empty-line-before': null, // dont manage empty lines
    'declaration-empty-line-before': null, // dont manage empty lines
    'rule-empty-line-before': null // conflicts with prettier standards
  },

  // Allow the real color definitions only in the token / variables files
  overrides: [
    {
      files: ['./src/styles/_bootstrap-variables.scss'],
      rules: {
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null
      }
    }
  ]
}
