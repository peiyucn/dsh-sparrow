import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { globToRegExp, isPacked } from './helpers/pack-glob.mjs'

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
    assert.ok(deps.length > 0, 'src/index.ts 应当静态 re-export 至少一个模块')
    // 逐条按 files 清单的 glob 语义真判（旧写法短路口恒真，依赖名不存在也过）。
    for (const dep of deps) {
      assert.ok(
        isPacked(`lib/${dep}.js`, pkg.files),
        `files 清单不覆盖 lib/${dep}.js（lib/index.ts 静态 re-export 了它）`,
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
    // 旧组件改名 / 被取代后 tsc 不清 lib/，须显式删旧产物。
    for (const stale of [
      'lib/client/FileSessionDock.js', 'lib/types/client/FileSessionDock.d.ts',
      'lib/client/FileManageDock.js', 'lib/types/client/FileManageDock.d.ts',
    ]) {
      assert.equal(existsSync(new URL(`../${stale}`, import.meta.url)), false, `lib/ 残留旧产物 ${stale}`)
    }
  })

  /**
   * spec 03：入口迁到官方「主面板」形态；本组守卫钉住**迁走的东西不许回来** ——
   * client half 只注册官方两处槽位，自建遮罩 / dialog 语义 / 焦点陷阱全部消失。
   */
  it('client half 应该 只注册官方 main + sidebar.panellist，不再挂 sidebar.footer.action', async () => {
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /attachMainPanel\(/u, '入口必须经 attachMainPanel 装配')
    assert.ok(!/sidebar\.footer\.action/u.test(index), '不得再注册左栏 footer action（已迁到上面）')
    assert.ok(!/role=['"]dialog['"]/u.test(index), 'client half 不得出现自建 dialog 语义')
  })

  it('⛔ 页面不得自建遮罩 / dialog 语义 / 焦点陷阱（spec 03 决策点）', async () => {
    const page = await readFile(new URL('../src/client/CloudFilesPage.tsx', import.meta.url), 'utf8')
    // 剥注释再判：本文件的注释里**故意**写着「没有 role='dialog'」这类说明，不剥会命中自己的文档。
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
   * 首屏 ready 门的**初值**必须是 loading：React 先用旧 state 渲染一帧，而置 loading 原本放在
   * `useEffect` 里、只能作用于第二帧（真机量到那一帧是上次离开时留下的旧列表，全高）。
   */
  it('首屏应该 在初值上就是 loading（否则挂载首帧会画出空列表/旧列表）', async () => {
    const src = await readFile(new URL('../src/client/CloudFilesPage.tsx', import.meta.url), 'utf8')

    assert.match(src, /const \[loading, setLoading\] = useState\(true\)/u,
      'loading 初值必须为 true（挂载首帧就是 loading）')
    assert.match(src, /const \[summaryPending, setSummaryPending\] = useState\(true\)/u,
      'summaryPending 初值必须为 true（与 loading 一起构成首屏 ready 门）')

    const mountEffect = /useEffect\(\(\) => \{ reloadRef\.current\(\) \}, \[\]\)/u.exec(src)
    assert.ok(mountEffect !== null, '找不到挂载 effect（挂载即拉数据、只发请求）')

    assert.ok(!/const \[open, setOpen\]/u.test(src), '主面板页面不该再有 open 状态（挂载即打开）')
    assert.ok(!/openPanel/u.test(src), '不该再有 openPanel（「打开」这一步随弹窗一起消失）')
  })

  /**
   * 迁到中央列后本页不再继承左栏的 14px（`.centerCol` 没有 font-size，文字退回浏览器默认 16px）。
   * 故钉两件事：① 页面根自带 14px 基准；② 行标题显式给字号与行高（只给基准则行高仍是 normal）。
   */
  it('⛔ 页面根必须自带 14px 基准字号（迁到中央列后不再继承左栏的 14px）', async () => {
    const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    const root = /\.dsh-file-manage-page \{([^}]*)\}/u.exec(styles)
    assert.ok(root !== null, '缺 .dsh-file-manage-page 规则')
    // ⚠️ 必须**剥注释**再判：上面那段注释里自己写着「font-size: 14px」，不剥会把「声明被删」的变异放过去。
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
   * 署名钉左下角、左对齐、无分割线，且与侧边栏「设置」行垂直居中（与归档页同口径）。
   * `-25px` 是算出来的：本页 48px 下内边距 ⇒ 署名中心「视口底 −56.5px」vs 设置行「−31.5px」，
   * 故同时钉住 48px —— 改了它必须重算 margin-bottom。
   */
  it('⛔ 品牌署名必须与侧边栏「设置」行对齐（左下角 / 左对齐 / 无分割线）', async () => {
    const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
    const footer = /\.dsh-file-manage-page-footer \{([^}]*)\}/u.exec(styles)
    assert.ok(footer !== null, '缺 .dsh-file-manage-page-footer 规则')
    // 剥注释，否则注释里的声明会把「真声明被删」的变异放过去。
    const decl = footer[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /margin-top:\s*auto/u,
      '必须 margin-top: auto 把署名推到页面底部（否则矮内容页下面留一大片空白）')
    assert.match(decl, /text-align:\s*left/u,
      '必须左对齐 —— 与页标题、列表同一个左边缘（全页只有它居中的观感已否掉）')
    assert.doesNotMatch(decl, /border-top/u,
      '不得有分割线（owner 2026-10-07：「取消分割线」）')
    assert.match(decl, /padding-top:\s*24px/u,
      '内容超高时署名跟在列表之后，必须留 24px 最小净空（否则贴住列表最后一行）')
    assert.match(decl, /margin-bottom:\s*-25px/u,
      '必须 margin-bottom: -25px —— 与侧边栏「设置」行对齐的那一段（owner：「太高了」）')
    const page = /\.dsh-file-manage-page \{([^}]*)\}/u.exec(styles)
    assert.ok(page !== null, '缺 .dsh-file-manage-page 规则')
    assert.match(page[1].replace(/\/\*[\s\S]*?\*\//gu, ''), /padding:\s*0 clamp\(24px, 4vw, 48px\) 48px/u,
      '本页下内边距必须仍是 48px —— −25px 正是相对它算出来的；改了这里必须同步重算 margin-bottom')
  })

  /** files 守卫的自证：钉住 glob 判定语义，防守卫自己退化成恒真 / 恒假。 */
  it('files 清单 glob 语义自证：`**` 跨层与零层、`*` 不跨层、否定项后写者胜', () => {
    const files = ['lib/**/*.js', '!lib/client/**', 'lib/types/**/*.d.ts']
    assert.equal(isPacked('lib/host.js', files), true, '递归 js 条目应当覆盖 lib/host.js')
    assert.equal(isPacked('lib/deep/nested/x.js', files), true, '双星应当跨层')
    assert.equal(isPacked('lib/types/host.d.ts', files), true, 'types 条目应当覆盖一层')
    assert.equal(isPacked('lib/client/index.js', files), false, 'client 子树必须被否定项排掉')
    assert.equal(isPacked('lib/client.js', files), true, '否定项不得误伤 lib/client.js 本体')
    assert.equal(isPacked('lib/host.ts', files), false, '清单只声明了 .js')
    assert.equal(isPacked('src/host.js', files), false, '清单不含 src/')
    assert.equal(isPacked('lib/a/b.js', ['lib/*.js']), false, '单星不跨层')
    // 对照：旧写法短路口恒真 —— 被否定项排掉的产物、清单没声明的扩展名都放行。
    const legacyGuard = (dep) => files.includes('lib/**/*.js') || files.includes(`lib/${dep}.js`)
    assert.equal(legacyGuard('client/index'), true, '（对照）旧写法对被否定项排掉的产物恒真')
    assert.equal(isPacked('lib/client/index.js', files), false, '新判定认否定项：客户端产物不进包')
    assert.equal(legacyGuard('types/x.d.ts'), true, '（对照）旧写法对清单没声明的扩展名恒真')
    assert.equal(isPacked('lib/types/x.d.ts', files), true, 'lib/types 下的 .d.ts 在清单内')
    assert.ok(globToRegExp('lib/**/*.js').test('lib/host.js'), '双星后接斜杠时连零层目录都算')
  })
})
