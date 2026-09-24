import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-theme-tone 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client（client bundle 路径）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-theme'))
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  })

  it('package.json files 应该 覆盖 lib/index.js 的运行时依赖（防发布包缺文件回归）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    assert.ok(deps.length > 0, 'index.ts 应有静态 re-export')
    for (const dep of deps) {
      assert.ok(
        pkg.files.includes('lib/**/*.js') || pkg.files.includes(`lib/${dep}.js`),
        `files 缺少 lib/${dep}.js（src/index.ts 静态 re-export 了它）`,
      )
    }
  })

  it('行顺序应该 插在官方外观（10）与字号（11）之间 —— 「紧挨外观下面」', async () => {
    const { ROW_ORDER, ROW_ID } = await import('../lib/constants.js')
    // 官方两个整数都被占了：ui-theme/src/client/index.ts:454 外观 order 10、:470 字号 order 11；
    // 列表槽按数值升序渲染，故取两者之间的小数即可落在「外观」正下方。
    assert.equal(ROW_ID, 'theme-tone')
    assert.ok(
      ROW_ORDER > 10 && ROW_ORDER < 11,
      `ROW_ORDER=${ROW_ORDER} 应落在 (10, 11)，否则会跑到字号下面`,
    )
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-theme-tone/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-theme-tone'/u)
  })

  it('client bundle externals 应该 只含平台种子词', async () => {
    const script = await readFile(new URL('../scripts/bundle-client.mjs', import.meta.url), 'utf8')
    const block = /external: \[([\s\S]*?)\]/u.exec(script)
    assert.ok(block, '未找到 external 清单')
    const entries = [...block[1].matchAll(/'([^']+)'/gu)].map(match => match[1])
    // client/web/src/platform.ts:8-14 的 PLATFORM_MODULES —— 模块表恒可应答的种子词
    const platform = new Set([
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    ])
    for (const entry of entries) {
      assert.ok(platform.has(entry), `${entry} 不是平台种子词 —— 运行时 require 会落空`)
    }
  })

  it('schema 应该 与色调表分离，schemastery 不得进入客户端 bundle', async () => {
    const schema = await readFile(new URL('../src/settings-schema.ts', import.meta.url), 'utf8')
    assert.match(schema, /from '@deepseek-ai\/schemastery'/u, 'settings-schema.ts 应持有 schema')
    // 客户端会内联 tones / backdrop / constants，故这三者不得真的 import schemastery
    // （注释里提到它没关系，所以按 import 语句判定而不是字符串包含）。
    const imported = /(?:^|\n)\s*import[^\n]*['"]@deepseek-ai\/schemastery['"]/u
    for (const rel of ['../src/tones.ts', '../src/backdrop.ts', '../src/constants.ts', '../src/client/index.ts']) {
      const source = await readFile(new URL(rel, import.meta.url), 'utf8')
      assert.ok(!imported.test(source), `${rel} 不得 import schemastery（会进客户端 bundle）`)
    }
  })

  it('⛔ 设置「未就绪」时不得用默认值上色（否则每次冷加载都闪一下默认配色）', async () => {
    // 回归守卫：`status === 'loading'` 时 `value` 也是 undefined，若写成
    // `value ?? DEFAULT_SETTINGS` 就会先按默认画一遍（浅 official / 深 violet），
    // 等宿主回值再纠正 —— 改过色调的用户每次冷加载都看到一次可见跳变。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.ok(
      !/\.value \?\? DEFAULT_SETTINGS/u.test(src),
      '不得用 `value ?? DEFAULT_SETTINGS` —— 未就绪时会画默认值',
    )
    assert.match(src, /status !== 'loading'/u, '必须有「loading 不上色」的门')
    assert.match(src, /shouldPaint/u, 'repaint 要经过 shouldPaint 门')
  })

  it('⛔ 宿主不可写时必须落到进程内兜底并告警（不得静默空操作）', async () => {
    // 回归守卫：官方设置表单在 memory 模式下把写入当空操作（`set()` 返回 false）、
    // 也不会有宿主推送。若 setTone 只调 scope.set，用户点色调会毫无反应且无日志。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /localSettings/u, '要有进程内兜底值')
    assert.match(src, /snapshot\.writable/u, 'setTone 要检查 writable')
    assert.match(src, /warnUser\(/u, '不可持久化 / 停用时要走面向用户的告警（logger + console）')
    // setTone 的分支里必须真的写兜底值 + 立刻重绘，且顺序是「本地落值 → 重绘 → 发写入」。
    // 窗口取足够宽（注释长短会变，曾用固定 800 字符导致误报）；只断言**相对顺序**。
    const i = src.indexOf('setTone:')
    assert.ok(i > 0, '找不到 setTone')
    const seg = src.slice(i, i + 4000)
    assert.ok(seg.includes('localSettings'), 'setTone 不可写分支要写 localSettings')
    assert.ok(seg.includes('repaint()'), 'setTone 不可写分支要立刻重绘')
    const localAt = seg.indexOf('localSettings = ')
    const repaintAt = seg.indexOf('repaint()')
    // ⚠️ 匹配**真实调用**（`void scope.set(`），不能用 `scope.set(` —— 上面那段注释里
    // 也提到了 `scope.set()`，会把它的位置当成调用位置。
    const setAt = seg.indexOf('void scope.set(')
    assert.ok(localAt >= 0 && repaintAt > localAt && setAt > repaintAt,
      `顺序必须是「先本地落值 → 立刻重绘 → 再发写入」（local=${localAt} repaint=${repaintAt} set=${setAt}）`)
  })

  it('⛔ client inject 只放跨版本稳定服务（易变面进 inject 会把宿主整页拖死）', async () => {
    // 回归守卫（实测事故）：`inject` 里放一个新版宿主已经改名 / 移除的服务时，fiber 永远
    // pending，而客户端 boot 审计把 pending 当致命失败（packages/client/web/src/boot-client.ts
    // 的 assertEntriesActive）—— 实测 0.1.7-alpha.1 页面停在「Failed to load plugins：
    // @dsh-sparrow/dsh-theme-tone: pending (waiting for service: …)」，宿主 Web UI 完全起不来。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const inject = /export const inject = \[([^\]]*)\]/u.exec(src)?.[1] ?? ''
    const names = [...inject.matchAll(/'([^']+)'/gu)].map(match => match[1])
    assert.deepEqual(names, ['theme', 'slots', 'locale'], 'inject 只允许放跨版本稳定存在的服务')
    assert.ok(!/settings/u.test(inject), '设置面不得进 inject —— 它是会被宿主改名 / 移除的易变面')
    assert.match(
      src,
      /ctx\.inject\(\s*\[\s*'configForms'\s*\]/u,
      '设置面要走 ctx.inject 起的可选依赖 fork（缺了只是不装，entry 仍 active）',
    )
  })

  it('⛔ client half 的能力门不得抛错（抛错 = 宿主整页起不来）', async () => {
    // 客户端侧没有「逐插件捕获 apply 异常」的隔离：任何非 active 的 entry 都是致命失败
    // （boot-client.ts:63-82）。故 client half 走惰性停用（告警 + return），不使用抛错版能力门。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /warnMissingCapabilities\(/u, 'client half 要走不抛错的能力门')
    assert.ok(!/assertCapabilities/u.test(src), 'client half 不得用抛错版能力门')
    const iGate = src.indexOf('warnMissingCapabilities(')
    const iReturn = src.indexOf('])) return')
    const iInstall = src.indexOf('function install(')
    const iStyles = src.indexOf('resources.style = ensureStyles()')
    assert.ok(iGate > 0 && iReturn > 0 && iInstall > 0 && iStyles > 0, '锚点缺失（实现改过？）')
    assert.ok(iGate < iReturn, '门不通过要直接 return（不继续装）')
    assert.ok(iReturn < iInstall && iInstall < iStyles, '惰性停用必须在创建 style / 背景层之前返回')
  })

  it('⛔ 资源必须先武装清理、再创建（中途抛错不得留下无生命周期的 style / 层）', async () => {
    // 回归守卫：cordis 只跑**已注册**的 disposer。若先 ensureStyles/ensureLayer 再注册清理，
    // 两者之间任一环节抛错（bind / overrideTokens 校验 / locale 重名）都会让 <style> 与背景层
    // 永久残留，且 PLAIN_ATTR 从未置上 → 三张表的 body:not([PLAIN_ATTR]) 规则全部 fail-open。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const iCleanup = src.indexOf('dsh-theme-tone: backdrop + token overrides')
    const iStyles = src.indexOf('resources.style = ensureStyles()')
    const iLayer = src.indexOf('resources.layer = ensureLayer()')
    assert.ok(iCleanup > 0 && iStyles > 0 && iLayer > 0, '锚点缺失（实现改过？）')
    assert.ok(iCleanup < iStyles, '清理 effect 必须注册在 ensureStyles() **之前**')
    assert.ok(iCleanup < iLayer, '清理 effect 必须注册在 ensureLayer() **之前**')
    // 清理里不得再直接引用 style/layer 常量 —— 要用 holder，否则 ensureLayer 抛错时
    // style 已创建却无人回收（const 绑定尚未完成）。
    assert.match(src, /resources\.style\?\.remove\(\)/u, '清理要从 holder 取 style')
    assert.match(src, /resources\.layer\?\.remove\(\)/u, '清理要从 holder 取 layer')
  })

  it('⛔ 门属性必须先关成「官方默认」再注入样式表（loading 窗口不得 fail-open）', async () => {
    // 回归守卫：门属性是 `body:not([PLAIN_ATTR])` 的唯一开关，此前只在 paintLayer 里写。
    // 而样式表无条件注入、首次 repaint() 又被 shouldPaint()（status==='loading'）挡住 ——
    // 于是「注入」到「宿主回值」之间存在窗口：门属性不存在 ⇒ 38 条带门规则里 11 条当场命中。
    // 真机实测该窗口内顶栏 backdrop-filter=blur(12px)、输入框卡 blur(10px)：选了「官方默认」
    // 的用户会先看到玻璃再被抹掉，正是「完全不介入」最不该有的闪变。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const iClose = src.indexOf('paintPlain(true)')
    const iStyles = src.indexOf('resources.style = ensureStyles()')
    const iLayer = src.indexOf('resources.layer = ensureLayer()')
    assert.ok(iClose > 0, '注入样式表前必须先把门关成官方默认（缺 paintPlain(true)）')
    assert.ok(iClose < iStyles, 'paintPlain(true) 必须在 ensureStyles() **之前**')
    assert.ok(iClose < iLayer, 'paintPlain(true) 必须在 ensureLayer() **之前**')
    // 声明必须早于清理 effect（清理体要调它，否则该窗口内跑清理会撞 TDZ，
    // 抛 ReferenceError 把真正的失败原因盖掉）。
    const iDecl = src.indexOf('const paintPlain = ')
    const iCleanup = src.indexOf('dsh-theme-tone: backdrop + token overrides')
    assert.ok(iDecl > 0 && iCleanup > 0, '锚点缺失（实现改过？）')
    assert.ok(iDecl < iCleanup, 'paintPlain 必须声明在清理 effect 之前（否则清理会撞 TDZ）')
  })

  it('⛔ theme/change 那条直达 paintLayer 的路径也要过 shouldPaint 门', async () => {
    // theme/change 由 ui-theme 自己的 settings scope 驱动，与本插件 settings 就绪没有先后
    // 保证；若它绕过 shouldPaint()，就会用进程内兜底值（默认 violet）算出 hidden=false
    // 而把门打开 —— 与上一条要堵的是同一个洞的另一个入口。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    const i = src.indexOf('const paintLayer = ')
    assert.ok(i > 0, '缺 paintLayer 定义')
    const seg = src.slice(i, i + 900)
    assert.ok(seg.includes('shouldPaint()'), 'paintLayer 必须先过 shouldPaint 门')
    assert.ok(
      seg.indexOf('shouldPaint()') < seg.indexOf('paintPlain('),
      'shouldPaint 门必须在 paintPlain 之前',
    )
  })
})
