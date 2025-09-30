// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import ts from 'typescript-eslint'
import html from '@html-eslint/eslint-plugin'
import stylistic from '@stylistic/eslint-plugin'

const jsExts = ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.jsx']
const tsExts = ['**/*.ts', '**/*.tsx']
const allExts = [...jsExts, ...tsExts]

const legacyFiles = ['src/main-legacy.ts']

export default defineConfig([
  globalIgnores(['.parcel-cache/', 'dist/', 'node_modules/', ...legacyFiles]),
  {
    files: ['**/*.html'],
    plugins: { html },
    extends: ['html/recommended'],
    language: 'html/html',
    rules: {
      'html/attrs-newline': 'error',
    },
  },

  {
    files: allExts,
    extends: [
      js.configs.recommended,
      ts.configs.recommended,
      ts.configs.stylistic,
      {
        rules: {
          // Allow unused variables that start with _
          '@typescript-eslint/no-unused-vars': [
            'warn',
            {
              argsIgnorePattern: '^_',
              varsIgnorePattern: '^_',
              caughtErrorsIgnorePattern: '^_',
            },
          ],
        },
      },
    ],
  },

  {
    files: allExts,
    extends: [
      stylistic.configs.customize({
        indent: 2,
        quotes: 'single',
        semi: false,
        jsx: true,
        arrowParens: true,
        braceStyle: '1tbs',
        blockSpacing: true,
        quoteProps: 'consistent-as-needed',
        commaDangle: 'always-multiline',
      }),
      {
        rules: {
          // Soft wrap guidance similar to printWidth
          'max-len': [
            'warn',
            {
              code: 120,
              ignoreComments: true,
              ignoreStrings: true,
              ignoreTemplateLiterals: true,
              ignoreRegExpLiterals: true,
              ignoreUrls: true,
            },
          ],
        },
      },
    ],
  },
])
