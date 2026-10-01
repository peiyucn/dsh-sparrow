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
    // FileSessionDock 曾随 0.1.0 发布（src 已改名）；FileManageDock 随 0.2.0-rc.2 的
    // 主面板改造被 CloudFilesPage 取代（tsc 不清 lib/，须显式删旧产物）。
    for (const stale of [
      'lib/client/FileSessionDock.js', 'lib/types/client/FileSessionDock.d.ts',
      'lib/client/FileManageDock.js', 'lib/types/client/FileManageDock.d.ts',
    ]) {
      assert.equal(existsSync(new URL(`../${stale}`, import.meta.url)), false, `lib/ 残留旧产物 ${stale}`)
    }
  })

  /**
   * spec 03：入口从「左栏 footer action + 自建全屏弹窗」迁到官方「主面板」形态。
   *
   * 本组守卫钉住**迁走的东西不许回来**：client half 只注册官方两处槽位，
   * 自建遮罩 / `role='dialog'` / `aria-modal` / 点遮罩关闭 / 焦点陷阱全部消失。
   * （删除确认仍用弹窗语义，但那是**官方 `Modal` 原语**，不在本文件的守卫范围内。）
   */
  it('client half 应该 只注册官方 main + sidebar.panellist，不再挂 sidebar.footer.action', async () => {
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /attachMainPanel\(/u, '入口必须经 attachMainPanel 装配')
    assert.ok(!/sidebar\.footer\.action/u.test(index), '不得再注册左栏 footer action（已迁到上面）')
    assert.ok(!/role=['"]dialog['"]/u.test(index), 'client half 不得出现自建 dialog 语义')
  })

  it('⛔ 页面不得自建遮罩 / dialog 语义 / 焦点陷阱（spec 03 决策点）', async () => {
    const page = await readFile(new URL('../src/client/CloudFilesPage.tsx', import.meta.url), 'utf8')
    // 剥注释再判：本文件的注释里**故意**写着「没有 role='dialog'」这类说明，
    // 不剥的话守卫会命中自己的文档（本文件下方那条 effect 守卫踩过同一个坑）。
    const code = page
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '')
    for (const forbidden of [
      "role=\"dialog\"", "role='dialog'",
      'aria-modal',
      "role=\"alertdialog\"", "role='alertdialog'",
      'position: fixed',
      'backdrop-filter',
      'dsh-file-manage-confirm-overlay',
    ]) {
      assert.ok(!code.includes(forbidden), `页面源码里不该再有 ${forbidden}（主面板是正常流，不是弹窗）`)
    }
    // 删除确认走**官方 Modal 原语**（官方主页面做确认的同款做法）。
    assert.match(code, /<Modal\b/u, '删除确认必须走官方 Modal 原语')
  })

  it('页面顶部应该 自带窗口拖拽标记与官方顶带内边距（无遮罩后顶端就是窗口边缘）', async () => {
    const page = await readFile(new URL('../src/client/CloudFilesPage.tsx', import.meta.url), 'utf8')
    assert.match(page, /data-window-drag/u, '标题行必须自带 data-window-drag（官方入口型页面同款）')
    assert.match(page, /dsh-file-manage-page-head/u)
    const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    assert.match(styles, /--dsh-frame-top-clearance/u, '标题行必须让出官方顶带')
  })

  /**
   * 首屏 ready 门的**初值**必须是 loading —— 守卫 owner 2026-09-30 报的
   * 「打开后先全高展示闪一下，然后变矮，出现 loading」。
   *
   * ⚠️ 迁到主面板后这条不变、但**触发点变了**：以前是「点入口打开」，
   * 现在是「页面在中央列挂载」。真机逐帧量到的样子（**只有 1 帧 / 12ms**，肉眼却很明显）：
   * ```
   * 帧1  h=672  summary=true  loading=false  card=true    ← 上一次离开时留下的旧列表（全高）
   * 帧2  h=409  summary=true  loading=true   card=false   ← 才变成 loading
   * ```
   * 根因不是样式，是**状态复用**：React 先用旧 state 渲染一帧，而置 loading 原本放在
   * `useEffect` 里，只能作用于**第二帧**。修法 = 把 `loading` / `summaryPending` 的
   * **初值**直接给 true，首帧就是 loading，那一帧不再存在。
   */
  it('首屏应该 在初值上就是 loading（否则挂载首帧会画出空列表/旧列表）', async () => {
    const src = await readFile(new URL('../src/client/CloudFilesPage.tsx', import.meta.url), 'utf8')

    // ① 两个 ready 门的初值都必须是 true（不是 useEffect 里补）
    assert.match(src, /const \[loading, setLoading\] = useState\(true\)/u,
      'loading 初值必须为 true（挂载首帧就是 loading）')
    assert.match(src, /const \[summaryPending, setSummaryPending\] = useState\(true\)/u,
      'summaryPending 初值必须为 true（与 loading 一起构成首屏 ready 门）')

    // ② 挂载 effect 只负责发请求，不得自己再清空/置 loading —— 那会多出一帧中间态
    const mountEffect = /useEffect\(\(\) => \{ reloadRef\.current\(\) \}, \[\]\)/u.exec(src)
    assert.ok(mountEffect !== null, '找不到挂载 effect（挂载即拉数据、只发请求）')

    // ③ 入口不得是「点开」形态：没有 open 态、没有打开动作
    assert.ok(!/const \[open, setOpen\]/u.test(src), '主面板页面不该再有 open 状态（挂载即打开）')
    assert.ok(!/openPanel/u.test(src), '不该再有 openPanel（「打开」这一步随弹窗一起消失）')
  })

  /**
   * owner 2026-10-01 报「改成这种形式后**字变大了**」。
   *
   * 根因不是谁把字号调大了，而是**继承换了来源**：本页原先挂在
   * `sidebar.footer.action` 槽（DOM 落在 `SidebarRoot` 的 `.root` 内，那份 `.root`
   * 有 `font-size: 14px`），迁到中央列后 `.centerCol` **没有** font-size，
   * 于是没写字号的文字退回浏览器默认 **16px**。
   *
   * 实测（1600×900，真实实例）：云端文件名 16px / line-height `normal`；
   * 官方同位置（列表标题 / 左栏会话行）是 14px / 20px。
   *
   * 所以本守卫钉两件事：① 页面根必须自带 14px 基准；② 行标题必须显式给字号与行高
   * （只给基准的话行高仍是 `normal`，行盒偏矮、行距发挤）。
   */
  it('⛔ 页面根必须自带 14px 基准字号（迁到中央列后不再继承左栏的 14px）', async () => {
    const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    const root = /\.dsh-file-manage-page \{([^}]*)\}/u.exec(styles)
    assert.ok(root !== null, '缺 .dsh-file-manage-page 规则')
    // ⚠️ 必须**剥注释**再判：上面那段注释里自己写着「那份 .root 有 font-size: 14px」，
    // 不剥的话守卫会命中文档、把「声明被删掉」的变异放过去（反向注入实测踩到过）。
    const decl = root[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /font-size:\s*14px/u,
      '页面根必须显式 font-size: 14px —— 中央列不提供基准，漏了文字就退回浏览器默认 16px')
  })

  it('⛔ 行标题必须显式给字号与行高（不得只靠继承）', async () => {
    const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    const title = /title:\s*\{([^}]*)\}/u.exec(styles)
    assert.ok(title !== null, '缺 styles.title')
    const decl = title[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /fontSize:\s*14/u, 'styles.title 必须显式 fontSize: 14')
    assert.match(decl, /lineHeight:\s*'20px'/u,
      "styles.title 必须显式 lineHeight: '20px'（留 normal 行盒偏矮、行距发挤）")
  })

  /**
   * owner 2026-10-01 报「下面 dsh-sparrow 的 logo，分割线和上面都挨上了」。
   *
   * 实测：本页分割线到上方内容 **0px**（列表容器 `.dsh-file-manage-body` 的底边
   * 正好等于分割线的位置），读起来就是贴在一起。旧浮层版 footer 在固定高度的面板里
   * 被 body 的弹性撑开，搬进页面正常流后这层净空没了 ⇒ 必须显式补回。
   */
  it('⛔ 品牌 footer 的分割线上方必须留净空（不得贴住内容）', async () => {
    const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    const footer = /\.dsh-file-manage-page-footer \{([^}]*)\}/u.exec(styles)
    assert.ok(footer !== null, '缺 .dsh-file-manage-page-footer 规则')
    // 同上：剥注释，否则注释里的「24px」会把声明被删的变异放过去。
    const decl = footer[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /margin-top:\s*24px/u,
      '品牌 footer 必须留 24px 净空 —— 漏了分割线会贴住列表最后一行')
  })
})
