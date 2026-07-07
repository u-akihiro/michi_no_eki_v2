const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier')

// TODO: 型情報を要するルール (no-floating-promises 等) を有効化するため、
// 将来 languageOptions.parserOptions.projectService: true を検討する。
// apps/api (Hono) 実装後に導入予定。
module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.wrangler/**',
      '.vite/**',
      '.turbo/**',
      'coverage/**',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
]
