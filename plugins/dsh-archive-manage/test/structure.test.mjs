import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * npm `files` 数组的 glob 语义（只实现本仓库用到的子集，不引第三方依赖）：
 * - `*` 匹配**单个**路径段内任意字符（不跨 `/`）；`?` 同理单字符。
 * - `**` 跨路径段匹配任意深度；`**\/` 可匹配**零个**目录（故 `lib/**\/*.js` 覆盖 `lib/a.js`）。
 * - 以 `!` 开头的条目是否定项，命中即排除（npm 的 files 里 `!` 是排除语义）。
 *
 * 之前这里的守卫写作 `pkg.files.includes('lib/**\/*.js') || pkg.files.includes(\`lib/${dep}.js\`)`——
 * 第一支是**常量**，短路后恒真，依赖名即使不存在也照样通过（三个插件同型的假守卫）。
 * 现在改成真的按 glob 算「这个 dep 的产物会不会被打包」。
 */
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
      // 真按 glob 算：依赖名不存在 / 被否定项排除 / 无正向覆盖，三者都该红。
      assert.ok(
        packagedByFiles(pkg.files, `lib/${dep}.js`),
        `files 未覆盖 lib/${dep}.js（lib/index.ts 静态 re-export 了它）—— 发布包会缺文件`,
      )
    }
    // ⚠️ 否定项 `!lib/client/**` 排除的是 **目录** lib/client/ 下的散装模块
    // （host/客户端共用的 TS 源编译产物），**不**排除同级文件 lib/client.js ——
    // 后者是 `exports['./client']` 指向的 bundle，必须进包。两条一起钉，
    // 防有人把否定项写成能误伤 client.js 的形状（或反过来漏掉散装模块）。
    assert.equal(packagedByFiles(pkg.files, 'lib/client/ArchivePage.js'), false,
      'lib/client/ 下的散装模块应被 !lib/client/** 排除出包（它们已被 bundle 进 lib/client.js）')
    assert.equal(packagedByFiles(pkg.files, 'lib/client.js'), true,
      'lib/client.js 是 exports["./client"] 的 bundle，必须进包（否定项不得误伤）')
    // 守卫自身不得恒真：把覆盖该 dep 的那条正向规则去掉后，必须判为「不会被打包」。
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

  /**
   * owner 2026-10-01 报「改成这种形式后**字变大了**」。
   *
   * 根因不是谁把字号调大了，而是**继承换了来源**：本页原先挂在
   * `sidebar.footer.action` 槽（DOM 落在 `SidebarRoot` 的 `.root` 内，那份 `.root`
   * 有 `font-size: 14px`），迁到中央列后 `.centerCol` **没有** font-size，
   * 于是没写字号的文字退回浏览器默认 **16px**。
   *
   * 实测（1600×900，真实实例）：归档会话标题 16px / line-height `normal`；
   * 官方同位置（左栏会话行标题）是 14px / 20px。
   *
   * 所以本守卫钉两件事：① 页面根必须自带 14px 基准；② 行标题必须显式给字号与行高
   * （只给基准的话行高仍是 `normal`，行盒偏矮、行距发挤）。
   */
  it('⛔ 页面根必须自带 14px 基准字号（迁到中央列后不再继承左栏的 14px）', async () => {
    const src = await readFile(new URL('../src/client/ArchivePage.tsx', import.meta.url), 'utf8')
    const root = /\.dsh-archive-page \{([^}]*)\}/u.exec(src)
    assert.ok(root !== null, '缺 .dsh-archive-page 规则')
    // ⚠️ 必须**剥注释**再判：上面那段注释里自己写着「那份 .root 有 font-size: 14px」，
    // 不剥的话守卫会命中文档、把「声明被删掉」的变异放过去（反向注入实测踩到过）。
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
   * owner 2026-10-01 报「下面 dsh-sparrow 的 logo，分割线和上面都挨上了」→ 当时靠 24px
   * 净空 + 分割线解决；**2026-10-07 owner 改口径**：「固定左下角取消分割线」。
   *
   * 现在是**署名行**：钉在页面左下角（`margin-top: auto` 推到底）、左对齐、无分割线。
   * 三条都要钉住 —— 任一条回退都会让观感退回 owner 否掉的那版：
   * * 去掉 `margin-top: auto` ⇒ 署名不再贴底，矮内容页会在它下面留一大片空白；
   * 变回 `center` ⇒ 全页只有它居中（标题与卡片都左对齐），视线会跳；
   * 加回通栏分割线 ⇒ 线比 11px 的字重得多，先被看到的变成线。
   * 还有 `padding-top: 24px`：内容超高（署名跟在内容之后）时的最小净空。
   */
  it('⛔ 品牌署名必须钉在左下角、左对齐、无分割线（owner 2026-10-07 口径）', async () => {
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
    assert.match(src, /\.dsh-archive-section-card:has\(\+ \.dsh-archive-page-footer\)\s*\{[^}]*margin-bottom:\s*0/u,
      '紧邻署名的区块卡必须把自身 margin-bottom 归零（flex 纵列外边距不合并，否则 12+24=36）')
  })

  /**
   * owner 2026-10-02：「归档页按钮的中文改成归档管理吧」。
   *
   * 这条**曾经漂移过**：`button.label` 在 2026-09-01 更名时写作「归档管理」，
   * 随后被静默改成「归档」（改动混在 `14f9d7b` 入口迁移那次重构里，没有单独说明），
   * 于是侧边栏那行读起来像「归档**动作**」而不是「归档**页面**」。
   * 侧边栏入口文案是**用户可见**的，且与同排的「插件 / 自动化任务 / 云端文件」
   * （都是**名词性入口**）并列，故按名词口径钉住，防再次被顺手缩短。
   */
  it('侧边栏入口中文 应该是「归档管理」（名词性入口，与同排「插件」等一致）', async () => {
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /'button\.label':\s*'归档管理'/u,
      '侧边栏入口中文必须是「归档管理」（不是「归档」——那读成动作，同排入口都是名词）')
    // 英文按 owner 只提中文的原话保持 "Archive"，这条只在**中文**上做约束。
    assert.match(src, /'button\.label':\s*'Archive'/u, '英文入口文案保持 "Archive"')
  })

  /**
   * locale 字典的中英**键集必须一一对应**：漏一个键只会让该语言下显示成键名
   * （`archive-manage.button.label`），不报错、不崩——纯靠测试兜住。
   */
  it('locale 字典 应该 中英键集一一对应（漏键只会静默显示键名）', async () => {
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    /** 取某语言字典块里的全部键。 */
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
