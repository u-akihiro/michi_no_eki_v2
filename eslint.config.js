const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const prettier = require('eslint-config-prettier')

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
