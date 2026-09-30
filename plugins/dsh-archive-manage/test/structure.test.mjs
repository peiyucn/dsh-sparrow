import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-archive-manage 结构', () => {
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
    assert.match(patch, /id: dsh-archive-manage/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-archive-manage'/u)
  })

  it('子会话树的竖线应该 由每个节点自画，不得用「实色遮盖」补末节点残段', async () => {
    // 回归守卫（2026-09-20，owner 报「看见蓝框里那个白线了么…官方纯白色调因为同色所以看不见」）：
    // 旧实现把竖线画成子区容器的 border-left，于是它在末节点底部多拖一截，
    // 需要一条 `background: var(--dsw-alias-bg-layer-2)` 的**实色遮盖带**盖掉。
    // 那个手法只在「与父面**逐像素**同色」时成立 —— 而 dsh-theme-tone 会给抬升面
    // 叠颗粒与光，父面不再是纯色，纯色遮盖带就露成一条白线。
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    // ① 子区容器不得再画 border-left（竖线改由节点自画）
    const children = /\.dsh-archive-tree-children \{([^}]*)\}/u.exec(src)
    assert.ok(children !== null, '缺 .dsh-archive-tree-children 规则')
    assert.ok(
      !/border-left/u.test(children[1]),
      '子区容器不该画 border-left —— 竖线要由每个节点自画，否则末节点残段又需要遮盖',
    )
    // ② 任何 tree 相关规则都不得用「背景色遮盖」当收口手段
    const treeRules = src.slice(src.indexOf('.dsh-archive-tree-children'), src.indexOf('.dsh-archive-trigger'))
    assert.ok(
      !/background:\s*var\(--dsw-alias-bg-layer/u.test(treeRules),
      '树里不得用背景色遮盖残段 —— 那个手法依赖「与父面同色」，叠了颗粒就会露成白线',
    )
    // ③ 竖线材质必须与横连同一个 token，且末节点只画到肘部（自然收口）
    assert.match(src, /\.dsh-archive-tree-node::after \{/u, '竖线应由 .dsh-archive-tree-node::after 自画')
    const last = /\.dsh-archive-tree-node-last::after \{([^}]*)\}/u.exec(src)
    assert.ok(last !== null, '缺末节点规则')
    assert.match(last[1], /bottom:\s*auto/u, '末节点竖线应收口（bottom: auto + 有限高度）')
    assert.match(last[1], /height:\s*16px/u, '末节点竖线应止于肘部（16px）')
  })

  /**
   * spec 16：入口从「左栏 footer action + 自建全屏弹窗」迁到官方「主面板」形态。
   *
   * 本组守卫钉住**迁走的东西不许回来**：client half 只注册官方两处槽位，
   * 自建遮罩 / `role='dialog'` / `aria-modal` / 点遮罩关闭 / 焦点陷阱全部消失。
   * （二次确认框仍用弹窗语义，但那是**官方 `Modal` 原语**，不在本文件的守卫范围内。）
   */
  it('client half 应该 只注册官方 main + sidebar.panellist，不再挂 sidebar.footer.action', async () => {
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /attachMainPanel\(/u, '入口必须经 attachMainPanel 装配')
    assert.ok(!/sidebar\.footer\.action/u.test(index), '不得再注册左栏 footer action（已迁到上面）')
    assert.ok(!/role=['"]dialog['"]/u.test(index), 'client half 不得出现自建 dialog 语义')
  })

  it('⛔ 页面不得自建遮罩 / dialog 语义 / 焦点陷阱（spec 16 决策点 1）', async () => {
    const page = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    // 剥注释再判：本文件的注释里**故意**写着「没有 role='dialog'」这类说明，
    // 不剥的话守卫会命中自己的文档（file-manage 那边踩过同类坑）。
    const code = page
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '')
    for (const forbidden of [
      "role=\"dialog\"", "role='dialog'",
      'aria-modal',
      "role=\"alertdialog\"", "role='alertdialog'",
      'position: fixed',
      'backdrop-filter',
      'dsh-archive-confirm-overlay',
    ]) {
      assert.ok(!code.includes(forbidden), `页面源码里不该再有 ${forbidden}（主面板是正常流，不是弹窗）`)
    }
    // 二次确认走**官方 Modal 原语**（官方主页面做确认的同款做法）。
    assert.match(code, /from '@deepseek-ai\/dsh-client-ui-primitives'/u)
    assert.match(code, /<Modal\b/u, '二次确认必须走官方 Modal 原语')
  })

  it('页面顶部应该 自带窗口拖拽标记与官方顶带内边距（无遮罩后顶端就是窗口边缘）', async () => {
    const page = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    assert.match(page, /data-window-drag/u, '标题行必须自带 data-window-drag（官方入口型页面同款）')
    assert.match(page, /dsh-archive-page-head/u)
    // 顶带让位写在样式表里（macOS 下标题行不能被红绿灯压住）。
    assert.match(page, /--dsh-frame-top-clearance/u, '标题行必须让出官方顶带')
  })

  it('旧入口组件 应该 已删除（不留死代码）', () => {
    assert.equal(existsSync(new URL('../src/client/ArchiveDock.tsx', import.meta.url)), false,
      'ArchiveDock.tsx 应已删除（弹窗入口被主面板页取代）')
    assert.equal(existsSync(new URL('../src/client/ArchivePage.tsx', import.meta.url)), true,
      'ArchivePage.tsx 是新的主面板页')
  })
})
