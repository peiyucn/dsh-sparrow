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
    // 回归守卫：官方 `SettingsScopeController.enqueue()` 在 memory 模式直接 return，
    // `subscribe` 也永不触发。若 setTone 只调 scope.set，用户点色调会毫无反应且无日志。
    const src = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(src, /localSettings/u, '要有进程内兜底值')
    assert.match(src, /snapshot\.writable/u, 'setTone 要检查 writable')
    assert.match(src, /ctx\.logger\?\.warn/u, '不可持久化时要记一条面向用户的告警')
    // setTone 的分支里必须真的写兜底值 + 立刻重绘
    const i = src.indexOf('setTone:')
    const seg = src.slice(i, i + 800)
    assert.ok(seg.includes('localSettings'), 'setTone 不可写分支要写 localSettings')
    assert.ok(seg.includes('repaint()'), 'setTone 不可写分支要立刻重绘')
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
})
