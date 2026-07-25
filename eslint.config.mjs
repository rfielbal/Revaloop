import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      // Les validateurs de sécurité refusent volontairement les caractères de
      // contrôle avec des classes explicites comme \x00-\x1f.
      "no-control-regex": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "desktop/dist/**",
    "desktop/src-tauri/target/**",
    "desktop/src-tauri/gen/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
