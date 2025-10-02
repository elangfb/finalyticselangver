// @ts-check

import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import ts from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'

const jsExts = ['**/*.js', '**/*.cjs', '**/*.mjs', '**/*.jsx']
const tsExts = ['**/*.ts', '**/*.tsx']
const allExts = [...jsExts, ...tsExts]

const legacyFiles = ['src/main-legacy.ts']

export default defineConfig([
  globalIgnores(['.parcel-cache/', 'dist/', 'node_modules/', ...legacyFiles]),

  { files: allExts },

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
])
