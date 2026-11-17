import { createEslintConfig } from './eslint-base.mjs'

const nodeGlobals = {
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
}

export default [
  ...createEslintConfig({
    pureLogicDir: 'plugins/dsh-desk-one/src/model',
    ignores: ['plugins/*/lib/**', 'market/**'],
  }),
  {
    files: ['plugins/*/scripts/**/*.mjs', 'plugins/*/test/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
]
