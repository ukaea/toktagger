import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// React Compiler rules. At "error", a component the compiler would skip fails lint.
const compilerRules = (level) =>
  Object.fromEntries(
    [
      "static-components",
      "use-memo",
      "void-use-memo",
      "component-hook-factories",
      "preserve-manual-memoization",
      "incompatible-library",
      "immutability",
      "globals",
      "refs",
      "error-boundaries",
      "purity",
      "set-state-in-render",
      "unsupported-syntax",
      "config",
      "gating",
      "todo",
    ].map((rule) => [`react-hooks/${rule}`, level]),
  );

const eslintConfig = [
  {
    ignores: [
      "dist/**",
      "build/**",
      "coverage/**",
      "node_modules/**",
      ".next/**",
    ],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": (await import("@typescript-eslint/eslint-plugin"))
        .default,
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      parser: (await import("@typescript-eslint/parser")).default,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      // React rules
      "react/react-in-jsx-scope": "off", // Not needed with React 17+
      "react/prop-types": "off", // Using TypeScript for prop validation
      "react/jsx-uses-react": "warn",
      "react/jsx-uses-vars": "warn",
      "react/jsx-key": "error",
      "react/no-deprecated": "warn",
      "react/no-unknown-property": "error",

      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      ...compilerRules("error"),
      // Warn only: flags long-standing patterns, not a reason the compiler would skip a component
      "react-hooks/set-state-in-effect": "warn",

      // JSX Accessibility rules
      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
  {
    // The compiler skips these files today, so they keep their manual memoisation. Remove a file once it compiles.
    files: [
      "src/app/components/plots/base-plot.tsx",
      "src/app/components/tools/boundingBox.tsx",
      "src/app/components/tools/nav.tsx",
      "src/app/components/tools/polygon.tsx",
      "src/app/components/tools/timePoint.tsx",
      "src/app/components/tools/timeRegion.tsx",
      "src/app/components/ui/apiTokens.tsx",
      "src/app/contexts/AuthContext.tsx",
      "src/app/contexts/SampleContext.tsx",
      "src/app/contexts/apiSchema.tsx",
      "src/app/contexts/healthContext.tsx",
      "src/app/pages/admin/users.tsx",
      "src/app/projects/components/project_config.tsx",
      "src/app/projects/project_id/components/add_samples.tsx",
      "src/app/projects/project_id/components/members.tsx",
    ],
    rules: compilerRules("warn"),
  },
];

export default eslintConfig;
