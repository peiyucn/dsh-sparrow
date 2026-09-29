import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-file-manage 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client（侧边栏入口依赖）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.deepEqual(pkg.dsh.client.inject, [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ])
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('package.json peerDependencies 应该 声明官方客户端与凭据/设置 seam', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.ok('@deepseek-ai/dsh-llm-deepseek' in pkg.peerDependencies)
    assert.ok('@deepseek-ai/dsh-credentials' in pkg.peerDependencies)
    assert.ok('@deepseek-ai/dsh-settings' in pkg.peerDependencies)
    assert.ok('@deepseek-ai/dsh-host-webserver' in pkg.peerDependencies)
  })

  it('package.json files 应该 覆盖 lib/index.js 的运行时依赖（防发布包缺文件回归）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    for (const dep of deps) {
      assert.ok(
        pkg.files.includes('lib/**/*.js') || pkg.files.includes(`lib/${dep}.js`),
        `files 缺少 lib/${dep}.js（lib/index.ts 静态 re-export 了它）`,
      )
    }
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-file-manage/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-file-manage'/u)
  })

  it('lib/ 应该 不残留 src 已删除组件的编译产物（防改名后过期产物随包发布）', () => {
    // FileSessionDock 曾随 0.1.0 发布（src 已改名 FileManageDock，tsc 不清 lib/）。
    assert.equal(existsSync(new URL('../lib/client/FileSessionDock.js', import.meta.url)), false)
    assert.equal(existsSync(new URL('../lib/types/client/FileSessionDock.d.ts', import.meta.url)), false)
  })

  /**
   * 打开面板的**首帧**必须是 loading —— 守卫 owner 2026-09-30 报的
   * 「打开后先全高展示闪一下，然后变矮，出现 loading」。
   *
   * 真机逐帧量到的样子（**只有 1 帧 / 12ms**，肉眼却很明显）：
   * ```
   * 帧1  h=672  summary=true  loading=false  card=true    ← 上一次关闭时留下的旧列表（全高）
   * 帧2  h=409  summary=true  loading=true   card=false   ← 才变成 loading
   * ```
   * 根因不是样式，是**状态复用**：`open` 翻 true 时 React 先用旧 state 渲染一帧，
   * 而清空（`setRows([])`）与置 loading 原本放在 `useEffect` 里，只能作用于**第二帧**。
   *
   * 修法 = 把清空与置 loading 挪进点击处理器的 `openPanel()`，与 `setOpen(true)` 批进同一次渲染。
   * 这条测试从源码结构上钉住这个形状（本插件没有 client 侧 DOM 测试环境，
   * 且该缺陷只有首帧时序能暴露，故按结构断言 —— 与 picker/sticky 那类用例同一取舍）。
   */
  it('打开面板应该 在同一批更新里清空并置 loading（否则首帧会画出旧列表）', async () => {
    const src = await readFile(new URL('../src/client/FileManageDock.tsx', import.meta.url), 'utf8')

    // ① 打开动作必须走 openPanel（而不是裸 setOpen(true)），否则清空晚一帧
    assert.match(src, /onClick=\{\(\) => \{ if \(open\) setOpen\(false\); else openPanel\(\) \}\}/u,
      '入口按钮的 onClick 必须调用 openPanel()')

    // ② openPanel 内部要同时设置 loading 与 summaryPending（首屏 ready 门的两半）
    const openPanel = /const openPanel = useCallback\(\(\) => \{([\s\S]*?)\}, \[\]\)/u.exec(src)
    assert.ok(openPanel !== null, '找不到 openPanel 定义')
    const body = openPanel[1]
    for (const call of ['setRows([])', 'setSummary(null)', 'setLoading(true)', 'setSummaryPending(true)', 'setOpen(true)']) {
      assert.ok(body.includes(call), `openPanel 缺少 ${call}（首帧就不是 loading）`)
    }

    // ③ 打开用的 effect **不得**再自己清空/置 loading：那会多出一帧「已打开但没 loading」的中间态
    // ⚠️ 正则要**非贪婪到该 effect 自己的收尾** `}, [open, reload])`，否则会跨函数吃到 loadMore 里的 setRows。
    const openEffect = /useEffect\(\(\) => \{\r?\n\s*if \(!open\) return\r?\n([\s\S]*?)\r?\n\s*\}, \[open, reload\]\)/u.exec(src)
    assert.ok(openEffect !== null, '找不到 open 对应的 effect')
    // ⚠️ 先剥注释再判：这段 effect 的注释里**故意**写了「不要在这里再 setRows / setLoading」，
    // 不剥的话守卫会命中自己的文档（实测踩过一次）。
    const effectBody = openEffect[1]
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '')
    for (const forbidden of ['setRows(', 'setSummary(', 'setLoading(', 'setSummaryPending(']) {
      assert.ok(!effectBody.includes(forbidden), `open 的 effect 里不该再有 ${forbidden}（清空已提前到 openPanel）`)
    }
    assert.ok(effectBody.includes('reload()'), 'open 的 effect 仍要负责发请求（reload）')
  })
})
