const restrictedGlobals = require("eslint-restricted-globals")

module.exports = {
  env: {
    es6: true,
    node: true
  },
  extends: [
    "eslint:recommended",
  ],
  parserOptions: {
      "ecmaVersion": 2018,
      "sourceType": "module",
      "ecmaFeatures": {
        "jsx": true
      }
  },
   plugins: ["node"],
  rules: {
    "array-callback-return": "error",
    curly: "off",
    eqeqeq: [
      "error",
      "always",
      {
        null: "ignore",
      },
    ],
    "for-direction": "error",
    "getter-return": "error",
    "guard-for-in": "off",
    "handle-callback-err": "error",
    "object-curly-spacing": ["error", "never"],
    "no-extra-bind": "error",
    "no-console": "off",
    "prefer-const": "error",
    "no-var": "error",
    "no-duplicate-imports": "error",
    "no-eval": "error",
    "no-extend-native": "error",
    "no-implied-eval": "error",
    "no-invalid-this": "off",
    "no-labels": "error",
    "no-path-concat": "error",
    "no-restricted-globals": ["error"].concat(restrictedGlobals),
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-useless-computed-key": "error",
    "object-curly-spacing": "off",
    quotes: ["error", "single", { avoidEscape: true }],
    semi: [2, "never"],
    "unicode-bom": "error",
    "linebreak-style": [
      "error",
      "unix"
    ]
  },
}