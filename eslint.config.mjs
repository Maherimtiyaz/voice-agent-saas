import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build and tooling output (mirrors .gitignore). Linting the bundled
    // media-streams artifact alone is ~19 MB of generated code and was
    // enough to exhaust the heap on a constrained machine.
    "dist/**",
    "coverage/**",
    ".playwright-mcp/**",
  ]),
]);

export default eslintConfig;
