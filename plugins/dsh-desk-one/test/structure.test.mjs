// @ts-check
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { describe, it } from 'node:test'

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8')
const json = async (relative) => JSON.parse(await read(relative))

describe('dsh-desk-one 结构', () => {
  it('package.json 应该 声明 bundle / client / exports 三件套', async () => {
    const pkg = await json('package.json')
    assert.equal(pkg.name, '@dsh-sparrow/dsh-desk-one')
    assert.equal(pkg.version, '0.2.2-rc.1')
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.deepEqual(pkg.dsh.client.inject, [
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-sidebar',
    ])
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
    assert.equal(pkg.publishConfig.access, 'public')
  })

  it('package.json files 应该 覆盖 host 产物且排除 client 散装模块', async () => {
    const pkg = await json('package.json')
    const files = pkg.files
    assert.ok(files.includes('lib/index.js'))
    assert.ok(files.includes('lib/**/*.js'))
    assert.ok(files.includes('!lib/client/**'))
    // 构建产物必须真实存在（verify 的 build 阶段产出）。
    for (const relative of ['lib/index.js', 'lib/host.js', 'lib/model.js', 'lib/trust.js', 'lib/client.js']) {
      assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)), `缺少构建产物 ${relative}`)
    }
    // client 散装模块不进包，只有 bundle 进包：bundle 单独在 files 的否定项之外。
    assert.ok(files.some(entry => entry === '!lib/client/**'))
  })

  it('cordis.patch.yml 应该 按 bundle patch 结构插入 host 行', async () => {
    const patch = await read('cordis.patch.yml')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-desk-one/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-desk-one'/u)
  })

  it('存储域 应该 声明 nodes / edges 两张表且布局是 per-record', async () => {
    const { DESK_DOMAIN } = await import('../lib/domain.js')
    assert.equal(DESK_DOMAIN.name, 'desk_one')
    assert.equal(DESK_DOMAIN.layout, 'per-record')
    assert.deepEqual(Object.keys(DESK_DOMAIN.tables).sort(), ['edges', 'nodes'])
  })

  it('client half 应该 只注册官方 main + sidebar.panellist，且用不抛错的能力门', async () => {
    const install = await read('src/client/install.ts')
    const index = await read('src/client/index.ts')
    assert.match(install, /attachMainPanel\(/u)
    assert.match(install, /warnMissingCapabilities\(/u)
    assert.match(install, /ctx\.effect\(\(\) => \(\) => \{ style\.remove\(\) \}/u)
    assert.ok(!/assertCapabilities\(/u.test(install), 'client half 不得用抛错版能力门')
    const gateAt = index.indexOf('passesClientGate(ctx)')
    const installAt = index.indexOf('installDeskClient(ctx')
    assert.ok(gateAt > 0, 'client 入口 apply 必须先跑能力门')
    assert.ok(installAt > gateAt, '能力门必须排在安装之前')
  })

  it('便签标签 应该是「满墙贴纸」而非登记表：墙面 + 悬浮「+」+ 可拖动贴纸', async () => {
    const page = await read('src/client/DeskOnePage.tsx')
    const styles = await read('src/client/styles.ts')
    // 墙面容器与悬浮「+」按钮（不是工具栏里的「新建」表单）。
    assert.match(page, /dsh-desk-wall/u)
    assert.match(page, /dsh-desk-add/u)
    assert.match(page, /onPointerDown/u, '贴纸必须支持指针拖拽')
    const addRule = /\.dsh-desk-add \{([^}]*)\}/u.exec(styles)
    assert.ok(addRule !== null, '缺 .dsh-desk-add 规则')
    assert.match(addRule[1], /position:\s*absolute/u, '「+」必须悬浮在墙面右下角')
    // 贴纸直接在墙上写字（textarea），不搞标题/保存按钮的登记表。
    assert.match(page, /dsh-desk-note-body/u)
    assert.ok(!/action\.save/u.test(page), '便签墙不得再有「保存」按钮（失焦即保存）')
    assert.ok(!/placeholder\.title/u.test(page), '便签墙不得再有标题输入框')
    assert.ok(!/dsh-desk-composer/u.test(styles), '登记表式编辑器样式应已删除')
  })

  it('页面 应该 用一个面板承载标签页，而不是弹窗', async () => {
    const page = await read('src/client/DeskOnePage.tsx')
    assert.match(page, /dsh-desk-tabs/u)
    assert.match(page, /data-window-drag/u)
    assert.match(page, /'overview'/u)
    assert.match(page, /'notes'/u)
    for (const forbidden of ['role="dialog"', 'aria-modal', 'position: fixed', 'backdrop-filter']) {
      assert.ok(!page.includes(forbidden), `页面源码里不该有 ${forbidden}`)
    }
  })

  it('页面根 应该 显式 14px 基准字号（中央列不提供基准）', async () => {
    const styles = await read('src/client/styles.ts')
    const root = /\.dsh-desk-page \{([^}]*)\}/u.exec(styles)
    assert.ok(root !== null, '缺 .dsh-desk-page 规则')
    const decl = root[1].replace(/\/\*[\s\S]*?\*\//gu, '')
    assert.match(decl, /font-size:\s*14px/u)
  })

  it('locale 字典 应该 中英键集一一对应，且 locale.d.ts 覆盖全部键', async () => {
    const i18n = await read('src/client/i18n.ts')
    const dict = await read('src/client/locale.d.ts')
    const keysOf = (lang) => {
      const start = i18n.indexOf(`  ${lang}: {`)
      assert.ok(start >= 0, `找不到 ${lang} 字典块`)
      const end = i18n.indexOf('\n  },', start)
      assert.ok(end > start, `${lang} 字典块没有闭合`)
      return [...i18n.slice(start, end).matchAll(/^\s*'([^']+)':/gmu)].map(match => match[1])
    }
    const zh = keysOf('zh')
    const en = keysOf('en')
    assert.ok(zh.length > 0)
    assert.deepEqual(zh.filter(key => !en.includes(key)), [], 'zh 有而 en 没有的键')
    assert.deepEqual(en.filter(key => !zh.includes(key)), [], 'en 有而 zh 没有的键')
    for (const key of zh) {
      assert.ok(dict.includes(`'${key}'`), `locale.d.ts 缺键 ${key}`)
    }
  })

  it('文档 应该 中英双份且含官方 dsh 版本要求行', async () => {
    for (const file of ['README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
      assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `缺 ${file}`)
    }
    for (const file of ['README.md', 'README.zh-CN.md']) {
      const text = await read(file)
      assert.match(text.split(/\r?\n/u)[0], /^#\s+\S/u, `${file} 第一行不是 H1`)
      assert.ok(/(?:^|\s)dsh\s|dsh\s/iu.test(text.replace(/@dsh-sparrow\//gu, '')), `${file} 缺 dsh 环境要求行`)
      assert.match(text, /0\.2\.2-rc\.1/u, `${file} 环境要求行必须写明 0.2.2-rc.1`)
    }
  })

  it('client bundle 应该 保留 main 与 sidebar.panellist 两处槽位注册', async () => {
    const bundle = await read('lib/client.js')
    assert.ok(bundle.includes('sidebar.panellist'), 'bundle 缺 sidebar.panellist 槽位注册')
    assert.ok(bundle.includes("'main'") || bundle.includes('"main"'), 'bundle 缺 main 槽位注册')
  })

  it('spec 应该 保持交付的三份设计文档', async () => {
    const specs = await readdir(new URL('../docs/spec', import.meta.url))
    assert.deepEqual(specs.sort(), ['00-overview.md', '01-object-model.md', '02-modules.md'])
  })
})
