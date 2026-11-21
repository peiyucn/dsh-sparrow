

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PLUGIN_ROOT, fileExists, read, readJson, walkFiles } from './helpers.ts'

const DSH_PACKAGE_PREFIX = '@deepseek-ai/dsh-'

const REQUIRED_SPECS = [
  '00-overview.md',
  '01-object-model.md',
  '02-modules.md',
  '03-task-board.md',
  '04-sessions.md',
  '05-schedule.md',
  '06-session-index.md',
  '07-notebook.md',
  '12-auto-task-capture-prompt.md',
  '13-task-card-collapse.md',
  '14-task-card-running-orbit.md',
  '15-task-session-unlink.md',
]
const DOC_PAIRS = [
  ['README.md', 'README.zh-CN.md'],
  ['CHANGELOG.md', 'CHANGELOG.zh-CN.md'],
]


const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

describe('文档契约', () => {
  it('README / CHANGELOG 应该中英双份，且都以 H1 开头', async () => {
    for (const pair of DOC_PAIRS) {
      for (const file of pair) {
        assert.ok(await fileExists(file), `缺文档 ${file}`)
        const text = await read(file)
        assert.match(text.split(/\r?\n/u)[0] ?? '', /^#\s+\S/u, `${file} 第一行必须是 H1`)
      }
    }
  })

  it('README 应该顶部互链，并写明当前版本与支持的 DSH 范围', async () => {
    const pkg = await readJson('package.json')
    const ranges = [...new Set(Object.entries(pkg.peerDependencies)
      .filter(([name]) => name.startsWith(DSH_PACKAGE_PREFIX))
      .map(([, version]) => String(version)))]
    assert.equal(ranges.length, 1, 'peerDependencies 的 dsh 包必须写同一兼容范围')
    const dshRange = ranges[0]

    for (const pair of DOC_PAIRS) {
      const [en, zh] = pair
      const enHead = (await read(en)).split(/\r?\n/u).slice(0, 8).join('\n')
      const zhHead = (await read(zh)).split(/\r?\n/u).slice(0, 8).join('\n')
      assert.ok(enHead.includes(zh), `${en} 顶部缺少指向 ${zh} 的互链`)
      assert.ok(zhHead.includes(en), `${zh} 顶部缺少指向 ${en} 的互链`)
    }

    for (const readme of DOC_PAIRS[0]) {
      const text = await read(readme)
      assert.ok(text.includes(pkg.version), `${readme} 缺少当前插件版本 ${pkg.version}`)
      assert.ok(text.includes(dshRange), `${readme} 缺少支持的 DSH 范围 ${dshRange}`)
    }
  })

  it('CHANGELOG 应该含当前版本的版本段', async () => {
    const pkg = await readJson('package.json')
    const heading = new RegExp(`^##\\s+\\[?${escapeRegExp(String(pkg.version))}\\]?`, 'mu')
    for (const changelog of DOC_PAIRS[1]) {
      const text = await read(changelog)
      assert.match(text, heading, `${changelog} 应该有 ${pkg.version} 的版本段`)
    }
  })

  it('spec 关键设计文档必须存在（允许新增，不允许静默缺失）', async () => {
    const specDir = new URL('docs/spec/', PLUGIN_ROOT)
    const specFiles = await walkFiles(specDir, /\.md$/u)
    assert.ok(specFiles.length >= REQUIRED_SPECS.length, `docs/spec 里的文档数不应少于 ${REQUIRED_SPECS.length}`)
    for (const required of REQUIRED_SPECS) {
      assert.ok(await fileExists(`docs/spec/${required}`), `缺关键 spec 文档 docs/spec/${required}`)
      const text = await read(`docs/spec/${required}`)
      assert.ok(text.trim().length > 0, `spec 文档 ${required} 是空的`)
    }
  })
})
