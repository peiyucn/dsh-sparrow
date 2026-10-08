import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/** npm `files` 数组的 glob 语义（本仓用到的子集，不引第三方依赖）：`*` 不跨段、`?` 单字符、
 * `**` 跨段（双星后接斜杠可匹配零个目录）、`!` 开头为否定项、命中即排除。 */
const globToRegExp = (pattern) => {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` 吃掉整个路径段（含零个）；裸 `**` 跨段匹配。
        if (pattern[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2 } else { out += '.*'; i += 1 }
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    }
  }
  return new RegExp(`^${out}$`, 'u')
}

/** 该路径是否会被这份 `files` 清单打进 npm 包（任一正向条目覆盖，且不被任何否定条目排除）。 */
const packagedByFiles = (files, path) => {
  let covered = false
  for (const entry of files) {
    if (typeof entry !== 'string') continue
    const negative = entry.startsWith('!')
    const target = negative ? entry.slice(1) : entry
    if (!globToRegExp(target).test(path)) continue
    if (negative) return false
    covered = true
  }
  return covered
}

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
    assert.ok(deps.length > 0, 'src/index.ts 应当静态 re-export 至少一个兄弟模块')
    for (const dep of deps) {
      // 依赖名不存在 / 被否定项排除 / 无正向覆盖，三者都该红。
      assert.ok(
        packagedByFiles(pkg.files, `lib/${dep}.js`),
        `files 未覆盖 lib/${dep}.js（lib/index.ts 静态 re-export 了它）—— 发布包会缺文件`,
      )
    }
    // ⚠️ 否定项 `!lib/client/**` 只排除**目录** lib/client/ 下的散装模块，
    // **不**排除同级 lib/client.js（`exports['./client']` 的 bundle，必须进包）—— 两条一起钉。
    assert.equal(packagedByFiles(pkg.files, 'lib/client/ArchivePage.js'), false,
      'lib/client/ 下的散装模块应被 !lib/client/** 排除出包（它们已被 bundle 进 lib/client.js）')
    assert.equal(packagedByFiles(pkg.files, 'lib/client.js'), true,
      'lib/client.js 是 exports["./client"] 的 bundle，必须进包（否定项不得误伤）')
    // 守卫自身不得恒真：去掉覆盖该 dep 的正向规则后必须判为「不会被打包」。
    const withoutGlob = pkg.files.filter(entry => entry !== 'lib/**/*.js')
    assert.equal(packagedByFiles(withoutGlob, 'lib/archive.js'), false,
      '去掉 lib/**/*.js 后 lib/archive.js 仍被判为会打包 —— glob 匹配恒真，守卫没生效')
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-archive-manage/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-archive-manage'/u)
  })

  it('子会话树的竖线应该 由每个节点自画，不得用「实色遮盖」补末节点残段', async () => {
    // 实色遮盖只在「与父面逐像素同色」时成立 —— 叠了颗粒与光的主题会让遮盖带露成一条白线。
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    const children = /\.dsh-archive-tree-children \{([^}]*)\}/u.exec(src)
    assert.ok(children !== null, '缺 .dsh-archive-tree-children 规则')
    assert.ok(
      !/border-left/u.test(children[1]),
      '子区容器不该画 border-left —— 竖线要由每个节点自画，否则末节点残段又需要遮盖',
    )
    const treeRules = src.slice(src.indexOf('.dsh-archive-tree-children'), src.indexOf('.dsh-archive-trigger'))
    assert.ok(
      !/background:\s*var\(--dsw-alias-bg-layer/u.test(treeRules),
      '树里不得用背景色遮盖残段 —— 那个手法依赖「与父面同色」，叠了颗粒就会露成白线',
    )
    assert.match(src, /\.dsh-archive-tree-node::after \{/u, '竖线应由 .dsh-archive-tree-node::after 自画')
    const last = /\.dsh-archive-tree-node-last::after \{([^}]*)\}/u.exec(src)
    assert.ok(last !== null, '缺末节点规则')
    assert.match(last[1], /bottom:\s*auto/u, '末节点竖线应收口（bottom: auto + 有限高度）')
    assert.match(last[1], /height:\s*16px/u, '末节点竖线应止于肘部（16px）')
  })

  /**
   * spec 16：入口迁到官方「主面板」形态；本组守卫钉住**迁走的东西不许回来** ——
   * client half 只注册官方两处槽位，自建遮罩 / dialog 语义 / 焦点陷阱全部消失。
   */
  it('client half 应该 只注册官方 main + sidebar.panellist，不再挂 sidebar.footer.action', async () => {
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /attachMainPanel\(/u, '入口必须经 attachMainPanel 装配')
    assert.ok(!/sidebar\.footer\.action/u.test(index), '不得再注册左栏 footer action（已迁到上面）')
    assert.ok(!/role=['"]dialog['"]/u.test(index), 'client half 不得出现自建 dialog 语义')
  })

  it('⛔ 页面不得自建遮罩 / dialog 语义 / 焦点陷阱（spec 16 决策点 1）', async () => {
    const page = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
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
      'dsh-archive-confirm-overlay',
    ]) {
      assert.ok(!code.includes(forbidden), `页面源码里不该再有 ${forbidden}（主面板是正常流，不是弹窗）`)
    }
    assert.match(code, /from '@deepseek-ai\/dsh-client-ui-primitives'/u)
    assert.match(code, /<Modal\b/u, '二次确认必须走官方 Modal 原语')
  })

  it('页面顶部应该 自带窗口拖拽标记与官方顶带内边距（无遮罩后顶端就是窗口边缘）', async () => {
    const page = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    assert.match(page, /data-window-drag/u, '标题行必须自带 data-window-drag（官方入口型页面同款）')
    assert.match(page, /dsh-archive-page-head/u)
    // 顶带让位（macOS 下标题行不能被红绿灯压住）。
    assert.match(page, /--dsh-frame-top-clearance/u, '标题行必须让出官方顶带')
  })

  it('旧入口组件 应该 已删除（不留死代码）', () => {
    assert.equal(existsSync(new URL('../src/client/ArchiveDock.tsx', import.meta.url)), false,
      'ArchiveDock.tsx 应已删除（弹窗入口被主面板页取代）')
    assert.equal(existsSync(new URL('../src/client/ArchivePage.tsx', import.meta.url)), true,
      'ArchivePage.tsx 是新的主面板页')
  })

  /**
   * 迁到中央列后本页不再继承左栏的 14px（`.centerCol` 没有 font-size，文字退回浏览器默认 16px）。
   * 故钉两件事：① 页面根自带 14px 基准；② 行标题显式给字号与行高（只给基准则行高仍是 normal）。
   */
  it('⛔ 页面根必须自带 14px 基准字号（迁到中央列后不再继承左栏的 14px）', async () => {
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    const root = /\.dsh-archive-page \{([^}]*)\}/u.exec(src)
    assert.ok(root !== null, '缺 .dsh-archive-page 规则')
    // ⚠️ 必须**剥注释**再判：上面那段注释里自己写着「font-size: 14px」，不剥会把「声明被删」的变异放过去。
    const decl = root[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /font-size:\s*14px/u,
      '页面根必须显式 font-size: 14px —— 中央列不提供基准，漏了文字就退回浏览器默认 16px')
  })

  it('⛔ 行标题必须显式给字号与行高（不得只靠继承）', async () => {
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    const title = /title:\s*\{([^}]*)\}/u.exec(src)
    assert.ok(title !== null, '缺 styles.title')
    const decl = title[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /fontSize:\s*14/u, 'styles.title 必须显式 fontSize: 14')
    assert.match(decl, /lineHeight:\s*'20px'/u,
      "styles.title 必须显式 lineHeight: '20px'（留 normal 行盒偏矮、行距发挤）")
  })

  it('⛔ 次级文字必须显式给行高（与云端文件页 / 官方次级文字同为 12px/18px）', async () => {
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    const sec = /secondarySmall:\s*\{([^}]*)\}/u.exec(src)
    assert.ok(sec !== null, '缺 styles.secondarySmall')
    const decl = sec[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /fontSize:\s*12/u, 'secondarySmall 必须显式 fontSize: 12')
    assert.match(decl, /lineHeight:\s*'18px'/u,
      "secondarySmall 必须显式 lineHeight: '18px'（留 normal 行盒只有约 16px，与另一页不一致）")
  })

  /**
   * 署名钉左下角、左对齐、无分割线，且与侧边栏「设置」行垂直居中：`-25px` 是算出来的
   * （本页 48px 下内边距 ⇒ 署名中心「视口底 −56.5px」vs 设置行「−31.5px」），故同时钉住 48px。
   */
  it('⛔ 品牌署名必须与侧边栏「设置」行对齐（左下角 / 左对齐 / 无分割线）', async () => {
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    const footer = /\.dsh-archive-page-footer \{([^}]*)\}/u.exec(src)
    assert.ok(footer !== null, '缺 .dsh-archive-page-footer 规则')
    // 剥注释，否则注释里的声明会把「真声明被删」的变异放过去。
    const decl = footer[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /margin-top:\s*auto/u,
      '必须 margin-top: auto 把署名推到页面底部（否则矮内容页下面留一大片空白）')
    assert.match(decl, /text-align:\s*left/u,
      '必须左对齐 —— 与页标题、区块卡同一个左边缘（全页只有它居中的观感已否掉）')
    assert.doesNotMatch(decl, /border-top/u,
      '不得有分割线（owner 2026-10-07：「取消分割线」）')
    assert.match(decl, /padding-top:\s*24px/u,
      '内容超高时署名跟在内容之后，必须留 24px 最小净空（否则贴住上方内容）')
    assert.match(decl, /margin-bottom:\s*-25px/u,
      '必须 margin-bottom: -25px —— 与侧边栏「设置」行对齐的那一段（owner：「太高了」）')
    const page = /\.dsh-archive-page \{([^}]*)\}/u.exec(src)
    assert.ok(page !== null, '缺 .dsh-archive-page 规则')
    assert.match(page[1].replace(/\/\*[\s\S]*?\*\//gu, ''), /padding:\s*0 clamp\(24px, 4vw, 48px\) 48px/u,
      '本页下内边距必须仍是 48px —— −25px 正是相对它算出来的；改了这里必须同步重算 margin-bottom')
    assert.match(src, /\.dsh-archive-section-card:has\(\+ \.dsh-archive-page-footer\)\s*\{[^}]*margin-bottom:\s*0/u,
      '紧邻署名的区块卡必须把自身 margin-bottom 归零（flex 纵列外边距不合并，否则 12+24=36）')
  })

  /**
   * 侧边栏入口文案按**名词性**口径钉住（与同排「插件 / 自动化任务 / 云端文件」一致），
   * 防再次被顺手缩成「归档」—— 那读起来像动作而不是页面。
   */
  it('侧边栏入口中文 应该是「归档管理」（名词性入口，与同排「插件」等一致）', async () => {
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /'button\.label':\s*'归档管理'/u,
      '侧边栏入口中文必须是「归档管理」（不是「归档」——那读成动作，同排入口都是名词）')
    // 英文保持 "Archive"，本约束只管中文。
    assert.match(src, /'button\.label':\s*'Archive'/u, '英文入口文案保持 "Archive"')
  })

  /** locale 字典中英**键集必须一一对应**：漏键只会静默显示键名，不报错、不崩。 */
  it('locale 字典 应该 中英键集一一对应（漏键只会静默显示键名）', async () => {
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const keysOf = (lang) => {
      const start = src.indexOf(`  ${lang}: {`)
      assert.ok(start >= 0, `找不到 ${lang} 字典块`)
      const end = src.indexOf('\n  },', start)
      assert.ok(end > start, `${lang} 字典块没有闭合`)
      return [...src.slice(start, end).matchAll(/^\s*'([^']+)':/gmu)].map(m => m[1])
    }
    const zh = keysOf('zh')
    const en = keysOf('en')
    assert.ok(zh.length > 0, 'zh 字典为空')
    assert.deepEqual(
      zh.filter(key => !en.includes(key)), [],
      'zh 有而 en 没有的键（英文界面会显示键名）',
    )
    assert.deepEqual(
      en.filter(key => !zh.includes(key)), [],
      'en 有而 zh 没有的键（中文界面会显示键名）',
    )
  })
})
