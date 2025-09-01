import { defineConfig, globalIgnores } from "eslint/config";
import html from "@html-eslint/eslint-plugin";

export default defineConfig([
    globalIgnores(['.parcel-cache/', 'dist/', 'node_modules/']),
    {
        files: ["**/*.html"],
        plugins: { html },
        extends: ["html/recommended"],
        language: "html/html",
        rules: {
            "html/attrs-newline": "error",
        }
    }
]);
