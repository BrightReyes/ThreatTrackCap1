module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2020,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
    "max-len": ["error", {"code": 140}],
    "linebreak-style": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*", "**/*.test.*"],
      env: {
        jest: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
