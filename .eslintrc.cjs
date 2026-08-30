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
    {
      // Cloudflare Pages Functions. Plain JavaScript running in the Workers runtime,
      // and the only production code here that TypeScript never sees - which is why
      // no-undef goes back on for it: without a compiler behind it, a misspelled
      // global is otherwise found by nobody until the deployed site returns a 500.
      // The environment is the Workers one (fetch, Request, Response, URL and the
      // rest), not the browser's and not Node's.
      files: ["functions/**/*.js"],
      env: { worker: true, es2022: true, browser: false, node: false },
      // eslint's bundled `worker` globals predate AbortSignal being a global of its
      // own. The Workers runtime has had it for years and the function uses
      // AbortSignal.timeout, so it is declared here rather than by turning the rule
      // off, which would give back exactly the checking this override is here for.
      globals: { AbortSignal: "readonly" },
      rules: {
        "no-undef": "error",
      },
    },
  ],
};
