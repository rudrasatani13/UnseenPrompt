import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const restrictedImports = (groups) => [
  "error",
  {
    patterns: groups.map((group) => ({
      group: [group],
      message: "This import crosses an architectural boundary. Use a lower-level module.",
    })),
  },
];

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  eslintConfigPrettier,
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports([
        "@/app/**",
        "@/components/**",
        "@/features/**",
        "@/lib/**",
      ]),
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/app/**", "@/components/**", "@/features/**"]),
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/app/**", "@/features/**"]),
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restrictedImports(["@/app/**"]),
    },
  },
  globalIgnores([".next/**", ".open-next/**", "coverage/**", "next-env.d.ts"]),
]);
