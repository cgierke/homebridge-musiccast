import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist/", "node_modules/"] },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // the cache is deliberately untyped
        files: ["src/Cache.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
        },
    },
);
