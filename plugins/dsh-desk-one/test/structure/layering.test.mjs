// @ts-check
/**
 * Half-boundary guard: resolve the real import graph (relative specifiers, including the
 * `from '../host.js'` entry-module form and dynamic `import('…')`) and assert that
 *   - the client half never reaches the host half or a `node:` builtin,
 *   - the host half never reaches the client half.
 *
 * The graph is what matters, not the shape of any single file: splitting / renaming modules inside
 * one half must keep passing, importing the other half must not.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { PLUGIN_ROOT, importSpecifiers, pluginRelative, resolveSourceImport, walkFiles } from './helpers.mjs'

const CLIENT_DIR = new URL('src/client/', PLUGIN_ROOT)
const HOST_ENTRY = new URL('src/host.ts', PLUGIN_ROOT)
const HOST_DIR = new URL('src/host/', PLUGIN_ROOT)

/**
 * @typedef {{ from: string, specifier: string, target: string }} SourceImport
 */

/**
 * Resolve one imported path and return it as a plugin-relative path.
 * @param {URL} from importing module
 * @param {string} specifier relative specifier
 * @returns {Promise<string>}
 */
async function resolveTarget(from, specifier) {
  const resolved = await resolveSourceImport(from, specifier)
  assert.ok(resolved !== null, `无法解析导入 ${specifier}（from ${pluginRelative(from)}）`)
  return pluginRelative(/** @type {URL} */ (resolved))
}

/**
 * Walk every relative import reachable from the given roots.
 * @param {URL[]} roots absolute module URLs
 * @returns {Promise<{
 *   files: string[],
 *   edges: SourceImport[],
 *   nodeImports: { from: string, specifier: string }[],
 *   unresolved: { from: string, specifier: string }[],
 * }>}
 */
async function importClosure(roots) {
  /** @type {string[]} */
  const files = []
  /** @type {SourceImport[]} */
  const edges = []
  /** @type {{ from: string, specifier: string }[]} */
  const nodeImports = []
  /** @type {{ from: string, specifier: string }[]} */
  const unresolved = []
  const seen = new Set()
  const queue = [...roots]
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || seen.has(file.href)) continue
    seen.add(file.href)
    const relative = pluginRelative(file)
    files.push(relative)
    const text = await readFile(file, 'utf8')
    for (const specifier of importSpecifiers(text)) {
      if (specifier.startsWith('node:')) {
        nodeImports.push({ from: relative, specifier })
        continue
      }
      // Bare package specifiers are not a half boundary by themselves (type-only packages exist);
      // only `node:` is banned for the client half.
      if (!specifier.startsWith('.')) continue
      const resolved = await resolveSourceImport(file, specifier)
      if (resolved === null) {
        unresolved.push({ from: relative, specifier })
        continue
      }
      edges.push({ from: relative, specifier, target: pluginRelative(resolved) })
      if (!seen.has(resolved.href)) queue.push(resolved)
    }
  }
  return { files, edges, nodeImports, unresolved }
}

/** @param {string} target @returns {boolean} */
const isClientModule = target => target.startsWith('src/client/')

/** @param {string} target @returns {boolean} */
const isHostModule = target => target === 'src/host.ts' || target.startsWith('src/host/')

describe('分层契约（import 图）', () => {
  it('解析器自检：入口模块写法、.js→.ts 映射、动态 import 都要识别', async () => {
    const clientProbe = new URL('src/client/__probe.ts', PLUGIN_ROOT)
    assert.equal(await resolveTarget(clientProbe, '../host.js'), 'src/host.ts', '必须能识别 from \'../host.js\' 这类入口模块写法')
    assert.equal(await resolveTarget(clientProbe, '../constants.js'), 'src/constants.ts')
    assert.equal(await resolveTarget(clientProbe, './app/DeskOnePage.js'), 'src/client/app/DeskOnePage.tsx')
    assert.equal(await resolveTarget(new URL('src/domain.ts', PLUGIN_ROOT), './model/errors.js'), 'src/model/errors.ts')

    const sample = [
      "import { a } from './a.js'",
      "import type { B } from './b.js'",
      "export * from './c.js'",
      "import './side-effect.css'",
      "const lazy = await import('./lazy.js')",
    ].join('\n')
    assert.deepEqual(importSpecifiers(sample), ['./a.js', './b.js', './c.js', './side-effect.css', './lazy.js'])
  })

  it('client half 不得通过 import 图到达 host half，也不得引入 node: 内置模块', async () => {
    const roots = await walkFiles(CLIENT_DIR, /\.(?:ts|tsx)$/u)
    assert.ok(roots.length > 0, '没有找到 client 源文件')
    const closure = await importClosure(roots)
    assert.ok(closure.files.includes('src/client/index.ts'), 'import 图必须覆盖 client entry')

    assert.deepEqual(closure.unresolved, [], '相对导入必须全部可解析，否则边界守卫会漏检')
    assert.deepEqual(closure.nodeImports, [], 'client half 可达模块不得 import node: 内置模块')
    const reachableHost = closure.edges.filter(edge => isHostModule(edge.target))
    assert.deepEqual(reachableHost, [], 'client half 不得 import host half（含 ../host.js 入口模块与动态 import）')
  })

  it('host half 不得通过 import 图到达 client half', async () => {
    const roots = [HOST_ENTRY, ...await walkFiles(HOST_DIR, /\.(?:ts|tsx)$/u)]
    const closure = await importClosure(roots)
    assert.ok(closure.files.includes('src/host.ts'), 'import 图必须覆盖 host entry')

    assert.deepEqual(closure.unresolved, [], '相对导入必须全部可解析，否则边界守卫会漏检')
    const reachableClient = closure.edges.filter(edge => isClientModule(edge.target))
    assert.deepEqual(reachableClient, [], 'host half 不得 import client half')
  })
})
