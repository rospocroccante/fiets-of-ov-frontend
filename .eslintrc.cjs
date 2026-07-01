/* ESLint config for the Vite + React + TypeScript app. */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: [
    "dist",
    "node_modules",
    "coverage",
    "*.config.js",
    "*.config.cjs",
    "*.config.ts",
    "src/**/*.js",
    "src/**/*.d.ts",
  ],
  rules: {
    // TypeScript already resolves identifiers; no-undef misfires on TS types/globals.
    "no-undef": "off",
    // Surface unused code without breaking the build; allow intentional _-prefixed names.
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
  overrides: [
    {
      // Tests and the react-leaflet mock: pragmatic relaxations.
      files: ["**/*.test.ts", "**/*.test.tsx", "src/__mocks__/**", "src/test/**"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
