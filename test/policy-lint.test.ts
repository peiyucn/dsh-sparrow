import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { checkRepository } from '../scripts/check-policy.mjs'

const PLUGIN = 'plugins/dsh-theme-tone'
const ROOT_PACKAGE = {
  name: 'fixture',
  private: true,
  version: '1.2.3',
  engines: { node: '>=24.9.0' },
  scripts: {
    verify: 'npm run lint && npm test',
    lint: 'npm run lint:code && npm run lint:policy',
    'lint:code': 'eslint .',
    'lint:policy': 'node scripts/check-policy.mjs',
  },
  devDependencies: { '@types/node': '^24.19.2' },
}
const PLUGIN_PACKAGE = {
  name: '@dsh-sparrow/dsh-theme-tone',
  version: '1.2.3',
  engines: { node: '>=24.9.0' },
  devDependencies: { '@types/node': '^24.19.2' },
  files: ['lib/**/*.js', 'cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md'],
}
const CI_WORKFLOW = [
  'name: ci',
  'on:',
  '  push:',
  '    branches: [dev, main]',
  'jobs:',
  '  typecheck:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/setup-node@v7',
  '        with:',
  '          node-version: 24',
  '  build:',
  '    runs-on: ubuntu-latest',
  '  test:',
  '    runs-on: ubuntu-latest',
  '  package:',
  '    runs-on: ubuntu-latest',
  '',
].join('\n')
const PUBLISH_WORKFLOW = [
  'name: Publish',
  'jobs:',
  '  publish:',
  '    environment: npm-publish',
  '    steps:',
  '      - name: Security alert gate',
  '        env:',
  '          GH_TOKEN: SECURITY_ALERTS_TOKEN',
  '        run: echo gate',
  '      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
  '      - run: npm publish',
  '  promote:',
  '    runs-on: ubuntu-latest',
  '',
].join('\n')
const MARKET_WORKFLOW = [
  'name: Market',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '  deploy:',
  '    runs-on: ubuntu-latest',
  '',
].join('\n')

const BASE_FILES: Record<string, string> = {
  'AGENTS.md': '# fixture\n',
  'README.md': '# fixture\n\nEnglish | [简体中文](README.zh-CN.md)\n',
  'README.zh-CN.md': '# fixture\n\n简体中文 | [English](README.md)\n',
  'SECURITY.md': '# security\n',
  'docs/brand.md': '# brand\n',
  'docs/private-seams.md': '# seams\n',
  'meta/rules/engineering.md': [
    '# 工程管线',
    '',
    '| 项目 | 开发分支 | CI | 发布 | 部署 / 同步 |',
    '|---|---|---|---|---|',
    '| dsh-sparrow | dev | `typecheck` → `build` → `test` → `package` | `publish`（npm） | `deploy`（`market.yml`） |',
    '',
  ].join('\n'),
  '.gitignore': 'node_modules/\nlib/\n*.tgz\njunit.xml\n.release-notes/\n',
  '.github/workflows/ci.yml': CI_WORKFLOW,
  '.github/workflows/publish.yml': PUBLISH_WORKFLOW,
  '.github/workflows/market.yml': MARKET_WORKFLOW,
  [`${PLUGIN}/package.json`]: JSON.stringify(PLUGIN_PACKAGE, null, 2),
  [`${PLUGIN}/README.md`]: [
    '# dsh-theme-tone',
    '',
    'English | [简体中文](README.zh-CN.md)',
    '',
    '## Settings',
    '',
    '| Key | Values |',
    '|---|---|',
    '| lightTone | official |',
    '| darkTone | official |',
    '',
  ].join('\n'),
  [`${PLUGIN}/README.zh-CN.md`]: [
    '# dsh-theme-tone',
    '',
    '简体中文 | [English](README.md)',
    '',
    '## 设置',
    '',
    '| 键 | 取值 |',
    '|---|---|',
    '| lightTone | official |',
    '| darkTone | official |',
    '',
  ].join('\n'),
  [`${PLUGIN}/CHANGELOG.md`]: '# Changelog\n\nEnglish | [简体中文](CHANGELOG.zh-CN.md)\n\n## [1.2.3] - 2026-01-01\n\n- fixture\n',
  [`${PLUGIN}/CHANGELOG.zh-CN.md`]: '# 更新日志\n\n简体中文 | [English](CHANGELOG.md)\n\n## [1.2.3] - 2026-01-01\n\n- fixture\n',
  [`${PLUGIN}/cordis.patch.yml`]: '- insert:\n    - id: theme-tone\n      name: "@dsh-sparrow/dsh-theme-tone"\n',
  [`${PLUGIN}/docs/spec/00-overview.md`]: '# spec\n',
  [`${PLUGIN}/src/settings-schema.ts`]: [
    'export const Config = z.object({',
    "  lightTone: z.union(['official']).default('official').volatile(),",
    "  darkTone: z.union(['official']).default('official').volatile(),",
    '})',
    '',
  ].join('\n'),
  [`${PLUGIN}/test/example.test.ts`]: "import { test } from 'node:test'\n\ntest('ok', () => {})\n",
}

function makeRepo(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-sparrow-policy-'))
  const files: Record<string, string> = {
    ...BASE_FILES,
    'package.json': JSON.stringify(ROOT_PACKAGE, null, 2),
    ...overrides,
  }
  for (const [file, content] of Object.entries(files)) {
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  return root
}

function withRepo(run: (root: string) => void): void {
  const root = makeRepo()
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function pluginPackage(mutate: (pkg: Record<string, unknown>) => void): string {
  const pkg = JSON.parse(BASE_FILES[`${PLUGIN}/package.json`]) as Record<string, unknown>
  mutate(pkg)
  return JSON.stringify(pkg, null, 2)
}

function rootPackage(mutate: (pkg: Record<string, unknown>) => void): string {
  const pkg = JSON.parse(JSON.stringify(ROOT_PACKAGE)) as Record<string, unknown>
  mutate(pkg)
  return JSON.stringify(pkg, null, 2)
}

test('the real repository passes all policy checks', () => {
  assert.deepEqual(checkRepository(process.cwd()), [])
})

test('a clean fixture passes every policy check', () => {
  withRepo((root) => {
    assert.deepEqual(checkRepository(root), [])
  })
})

test('QG001 fails when a required document is missing', () => {
  withRepo((root) => {
    rmSync(join(root, 'SECURITY.md'))
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG001')))
  })
})

test('QG002 fails when a settings table drifts from the schema', () => {
  withRepo((root) => {
    const file = join(root, PLUGIN, 'README.md')
    writeFileSync(file, BASE_FILES[`${PLUGIN}/README.md`].replace(
      '| lightTone | official |\n| darkTone | official |',
      '| darkTone | official |\n| lightTone | official |',
    ), 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG002')))
  })
})

test('QG003 fails when @types/node drifts from engines.node', () => {
  withRepo((root) => {
    const pkg = pluginPackage((value) => {
      const dev = value.devDependencies as Record<string, string>
      dev['@types/node'] = '22.20.0'
    })
    writeFileSync(join(root, PLUGIN, 'package.json'), pkg, 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG003')))
  })
})

test('QG004 fails when the bilingual documents stop cross-linking', () => {
  withRepo((root) => {
    const file = join(root, PLUGIN, 'README.zh-CN.md')
    writeFileSync(file, BASE_FILES[`${PLUGIN}/README.zh-CN.md`].replace('[English](README.md)', ''), 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG004')))
  })
})

test('QG005 fails when a CHANGELOG misses the package version', () => {
  withRepo((root) => {
    const file = join(root, PLUGIN, 'CHANGELOG.zh-CN.md')
    writeFileSync(file, BASE_FILES[`${PLUGIN}/CHANGELOG.zh-CN.md`].replace('1.2.3', '1.2.2'), 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG005')))
  })
})

test('QG006 fails when verify omits lint', () => {
  withRepo((root) => {
    const pkg = rootPackage((value) => {
      const scripts = value.scripts as Record<string, string>
      scripts.verify = 'npm test'
    })
    writeFileSync(join(root, 'package.json'), pkg, 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG006')))
  })
})

test('QG007 fails on an unknown or reordered CI job', () => {
  withRepo((root) => {
    writeFileSync(join(root, '.github/workflows/ci.yml'), CI_WORKFLOW.replace('  test:', '  checks:'), 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG007')))
  })
})

test('QG008 fails when the alert gate moves after publishing', () => {
  withRepo((root) => {
    const reordered = PUBLISH_WORKFLOW.replace(
      '      - name: Security alert gate\n        env:\n          GH_TOKEN: SECURITY_ALERTS_TOKEN\n        run: echo gate\n      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main\n      - run: npm publish\n',
      '      - run: npm publish\n      - name: Security alert gate\n        env:\n          GH_TOKEN: SECURITY_ALERTS_TOKEN\n        run: echo gate\n      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main\n',
    )
    writeFileSync(join(root, '.github/workflows/publish.yml'), reordered, 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG008')))
  })
})

test('QG009 fails when test files become publishable', () => {
  withRepo((root) => {
    const pkg = pluginPackage((value) => {
      const files = value.files as string[]
      files.push('test/**')
    })
    writeFileSync(join(root, PLUGIN, 'package.json'), pkg, 'utf8')
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG009')))
  })
})

test('QG010 fails when a focused test is committed', () => {
  withRepo((root) => {
    const focused = 'test' + '.only'
    writeFileSync(
      join(root, PLUGIN, 'test/example.test.ts'),
      `import { test } from 'node:test'\n\n${focused}('focused', () => {})\n`,
      'utf8',
    )
    assert.ok(checkRepository(root).some((line) => line.startsWith('QG010')))
  })
})
