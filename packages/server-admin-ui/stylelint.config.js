/** @type {import('stylelint').Config} */

export default {
  extends: ['stylelint-config-standard-scss'],

  ignoreFiles: ['./src/styles/core/**'],

  // defaultSeverity: 'warning',

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

    // 3. Ban the common functional color notations
    //    (rgb, rgba, hsl, hsla, hwb, lab, lch, oklab, oklch, color, …)
    'function-disallowed-list': [
      [
        '/^rgb/i',
        '/^hsl/i',
        '/^hwb/i',
        '/^lab/i',
        '/^lch/i',
        '/^oklab/i',
        '/^oklch/i',
        'color',
        'gray'
      ],
      {
        severity: 'error',
        message:
          'Use a CSS variable (var(--bs-*) or var(--sk-*)) instead of a color function'
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

  // rules: {
  //   'color-no-hex': null,
  //   'scss/load-partial-extension': null,
  //   'no-descending-specificity': null,
  //   'selector-class-pattern': null
  // }

  // Allow the real color definitions only in the token / variables files
  overrides: [
    {
      files: [
        './src/styles/_bootstrap-variables.scss'

        // '**/scss/_bootstrap-variables.scss',
        // '**/scss/_variables*.scss',
        // '**/styles/**/_tokens*.scss',
        // '**/styles/**/_sk-*.scss'
        // add any other files that legitimately contain the palette
      ],
      rules: {
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null
      }
    }
  ]
}
