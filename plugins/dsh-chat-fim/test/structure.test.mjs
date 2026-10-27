// @ts-check
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { DEFAULT_MODEL } from '../lib/suggest.js'
import { globToRegExp, isPacked } from './helpers/pack-glob.mjs'

/** 组件目录里的全部 .tsx 源码（拆分后不再只有一个文件；断言对整目录生效）。 */
async function componentSources() {
  const dir = new URL('../src/client/', import.meta.url)
  const files = (await readdir(dir)).filter(name => name.endsWith('.tsx')).sort()
  assert.ok(files.length >= 3, 'client 组件应当拆成开关 / 菜单 / 数据面三个 .tsx')
  return Promise.all(files.map(async name => ({ name, source: await readFile(new URL(name, dir), 'utf8') })))
}

/** 源码内容行数（忽略结尾换行）。 */
function lineCount(source) {
  return source.trimEnd().split(/\r?\n/u).length
}

describe('dsh-chat-fim 结构', () => {
  it('package.json 应该 声明 dsh.bundle 与 dsh.client', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'))
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })

  it('package.json files 应该 覆盖 lib/index.js 的运行时依赖（防发布包缺文件回归）', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const deps = [...index.matchAll(/from '\.\/([^']+)\.js'/gu)].map(match => match[1])
    assert.ok(deps.length > 0, 'src/index.ts 应当静态 re-export 至少一个模块')
    // 逐条按 files 清单的 glob 语义真判（含否定项）——旧写法
    // `files.includes('lib/**/*.js') || files.includes(`lib/${dep}.js`)` 短路口恒在第一支，
    // 依赖名不存在也恒真，等于没守（本文件末尾的 `files 清单 glob 语义` 组钉住这点）。
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
    assert.match(patch, /id: dsh-chat-fim/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-chat-fim'/u)
    assert.match(patch, /apiKeyEnv: DEEPSEEK_API_KEY/u)
  })

  it('两个 patch 文件的补全模型 应该 都与 DEFAULT_MODEL 一致（防配置漂移）', async () => {
    // `cordis.patch.yml` 是**随包发布**的组合补丁（loader 按包名解析），任何环境都存在；
    // `dev.patch.yml` 是**本机开发用的 overlay**（name 是本机绝对路径、不进仓库，见 .gitignore），
    // 干净检出 / CI 上不存在 —— 故只在它存在时才比对，不因缺文件而红。
    for (const file of ['../cordis.patch.yml', '../dev.patch.yml']) {
      const url = new URL(file, import.meta.url)
      if (!existsSync(url)) {
        assert.equal(file, '../dev.patch.yml', `${file} 应当存在（只有本机开发 overlay 允许缺席）`)
        continue
      }
      const patch = await readFile(url, 'utf8')
      const match = /^\s*model:\s*(\S+)\s*$/mu.exec(patch)
      assert.equal(match?.[1], DEFAULT_MODEL, `${file} 的 model 与 DEFAULT_MODEL 不一致`)
    }
  })

  /**
   * files 守卫的**自证**：钉住 glob 判定的语义，防止守卫自己退化成恒真 / 恒假
   * （上一版就是恒真：短路停在写死的 `lib/** /*.js` 上，依赖名不存在也过）。
   */
  it('files 清单 glob 语义自证：`**` 跨层与零层、`*` 不跨层、否定项后写者胜', () => {
    const files = ['lib/**/*.js', '!lib/client/**', 'lib/types/**/*.d.ts']
    // 正向命中
    assert.equal(isPacked('lib/host.js', files), true, 'lib/**/*.js 应当覆盖 lib/host.js')
    assert.equal(isPacked('lib/deep/nested/x.js', files), true, '** 应当跨层')
    assert.equal(isPacked('lib/types/host.d.ts', files), true, 'lib/types/**/*.d.ts 应当覆盖一层')
    // 否定项排除（后写者胜）
    assert.equal(isPacked('lib/client/index.js', files), false, '!lib/client/** 必须排掉客户端产物')
    assert.equal(isPacked('lib/client.js', files), true, '否定项不得误伤 lib/client.js 本体')
    // 未命中任何规则
    assert.equal(isPacked('lib/host.ts', files), false, '清单只声明了 .js')
    assert.equal(isPacked('src/host.js', files), false, '清单不含 src/')
    assert.equal(isPacked('lib/a/b.js', ['lib/*.js']), false, '单星不跨层')
    // 对照：旧写法恒真（本轮的修因）——连否定项排除掉的产物、以及根本不在清单里的路径都放行
    const legacyGuard = (dep) => files.includes('lib/**/*.js') || files.includes(`lib/${dep}.js`)
    assert.equal(legacyGuard('client/index'), true, '（对照）旧写法对 `!lib/client/**` 排掉的产物恒真')
    assert.equal(isPacked('lib/client/index.js', files), false, '新判定认否定项：客户端产物不进包')
    assert.equal(legacyGuard('types/x.d.ts'), true, '（对照）旧写法对清单没声明的扩展名恒真')
    assert.equal(isPacked('lib/types/x.d.ts', files), true, 'lib/types 下的 .d.ts 在清单内')
    assert.equal(isPacked('lib/types/x.js', files), true, '`lib/**/*.js` 同样覆盖 types 下的 js')
    assert.ok(globToRegExp('lib/**/*.js').test('lib/host.js'), '双星后接斜杠时连零层目录都算')
  })
})

describe('dsh-chat-fim 架构不变量（重构成 theme-tone 形）', () => {
  it('文档应该 只剩单一现状 spec', async () => {
    const specs = await readdir(new URL('../docs/spec', import.meta.url))
    assert.deepEqual(specs, ['00-overview.md'])
  })

  it('⛔ 组件目录不得内联样式表 / 自建 style 标签（CSS 只在 client/styles.ts）', async () => {
    for (const { name, source } of await componentSources()) {
      assert.ok(!source.includes("createElement('style')"), `${name} 不得自建 style 标签`)
      assert.ok(!/textContent\s*=\s*`/u.test(source), `${name} 不得内联 CSS 模板串`)
      // 类名一律从 styles.ts 的类名表取：组件里出现 `dsh-chat-fim-` 字样就是又手写了一份。
      assert.ok(!source.includes('dsh-chat-fim-'), `${name} 不得手写类名 / 选择器字符串`)
    }
  })

  it('样式表应该 由 client/styles.ts 注入，并在 ctx.effect 的清理里移除', async () => {
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /ensureChatFimStyles\(\)/u, 'client 入口必须从 styles.ts 注入口取样式')
    assert.match(index, /ctx\.effect\(\(\) => \(\) => \{ styles\.remove\(\) \}/u, '样式表必须在 effect 里移除')
  })

  it('样式命名应该 统一为 chat-fim（不再有 busy 时代的标记与函数名）', async () => {
    for (const file of ['../src/client/index.ts', '../src/client/ChatFimDock.tsx', '../src/client/styles.ts']) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8')
      assert.ok(!source.includes('data-dsh-chat-fim-busy'), `${file} 不得再用 busy 标记`)
      assert.ok(!source.includes('ensureSuggestBusyStyles'), `${file} 不得再用 busy 时代的注入函数名`)
    }
  })

  /**
   * client half 的门必须**不抛错**且先于一切注册：宿主 boot 审计把任一非 active entry 当致命失败，
   * 抛错会让整页只渲染 "Failed to load plugins"。缺能力时什么都不装。
   */
  it('client 入口 应该 先跑不抛错的能力门，再注册样式与槽位', async () => {
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /warnMissingCapabilities\(/u, 'client half 必须先跑 warnMissingCapabilities')
    assert.ok(!/assertCapabilities\(/u.test(index), 'client half 不得用抛错版能力门')
    const gate = index.indexOf('warnMissingCapabilities(')
    for (const later of ['ensureChatFimStyles()', 'ctx.effect(', 'ctx.slots.inject(']) {
      const at = index.indexOf(later)
      assert.ok(at > gate, `${later} 必须排能力门之后（缺能力时连样式都不装）`)
    }
  })
})

describe('dsh-chat-fim 第二阶段拆分：组合根与关注点模块', () => {
  it('host.ts 应该 只是组合根（<100 行：能力门 → normalizeConfig → 注册路由）', async () => {
    const host = await readFile(new URL('../src/host.ts', import.meta.url), 'utf8')
    assert.ok(lineCount(host) < 100, `host.ts 应当 <100 行，实际 ${lineCount(host)}`)
    assert.match(host, /export function apply\(/u, 'host.ts 必须导出 apply')
    assert.match(host, /createCompleteHandler\(/u, 'host.ts 必须把 handler 交给 host/routes.ts')
    assert.match(host, /from '\.\/host\/routes\.js'/u, 'host.ts 必须从 host/routes.ts 取 handler')
    // 组合根不碰 handler 内部：路由分发 / 收发 / 上游请求 / 信任栅栏都不在这里。
    for (const forbidden of ['sendJson(', 'readRequestBody(', 'fetch(', 'req.method', 'isTrustedBrowserRequest(']) {
      assert.ok(!host.includes(forbidden), `host.ts 不得出现 ${forbidden}（应在 host/ 子模块）`)
    }
  })

  it('Dock 应该 只留编排与 DOM 挂载（<250 行；环测量在 ring.ts）', async () => {
    const dock = await readFile(new URL('../src/client/ChatFimDock.tsx', import.meta.url), 'utf8')
    assert.ok(lineCount(dock) < 250, `ChatFimDock.tsx 应当 <250 行，实际 ${lineCount(dock)}`)
    assert.match(dock, /useRingRect\(/u, '环测量应来自 client/ring.ts')
    assert.match(dock, /ref=\{anchorRef\} className=\{cls\.anchor\}/u, 'Dock 仍负责隐藏锚点与环的 DOM 挂载')
  })

  it('每个关注点模块 应该 存在且 <300 行', async () => {
    const modules = [
      'src/host/http.ts', 'src/host/routes.ts', 'src/host/upstream.ts', 'src/host/diagnostics.ts', 'src/host/session.ts',
      'src/config.ts', 'src/prompt.ts', 'src/guards.ts', 'src/upstream.ts', 'src/trigger.ts', 'src/format.ts',
      'src/client/contracts.ts', 'src/client/store.ts', 'src/client/ring.ts',
      'src/client/ChatFimSwitch.tsx', 'src/client/ChatFimMenu.tsx',
    ]
    for (const file of modules) {
      const url = new URL(`../${file}`, import.meta.url)
      assert.ok(existsSync(url), `${file} 应当存在`)
      const source = await readFile(url, 'utf8')
      assert.ok(lineCount(source) < 300, `${file} 应当 <300 行，实际 ${lineCount(source)}`)
    }
  })

  it('⛔ host-only 的 parseCompleteBody（Buffer）不得进 client 可 import 的纯逻辑模块', async () => {
    // suggest.ts 是 facade、六个关注点模块是纯逻辑：任一使用 Buffer / 导出 parseCompleteBody，
    // 都会被 client bundle 拖进浏览器。
    for (const file of ['src/suggest.ts', 'src/config.ts', 'src/prompt.ts', 'src/guards.ts', 'src/upstream.ts', 'src/trigger.ts', 'src/format.ts']) {
      const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
      assert.ok(!/Buffer\s*\./u.test(source), `${file} 不得使用 Buffer（host-only）`)
      assert.ok(!/export[^\n]*parseCompleteBody/u.test(source), `${file} 不得导出 parseCompleteBody（host-only）`)
    }
    const http = await readFile(new URL('../src/host/http.ts', import.meta.url), 'utf8')
    assert.match(http, /export function parseCompleteBody/u, 'parseCompleteBody 留在 host/http.ts')
    // client entry 的图只走纯逻辑 facade；bundle 里真的没有 Buffer（构建后自证）。
    const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    assert.ok(!/Buffer\s*\./u.test(bundle), 'client bundle 不得出现 Node 的 Buffer')
  })

  it('client 组件 应该 只从 client 侧模块与纯逻辑 facade 取依赖（不 import host/）', async () => {
    for (const { name, source } of await componentSources()) {
      assert.ok(!source.includes("from '../host/"), `${name} 不得 import host 模块`)
      assert.ok(!source.includes("from './host/"), `${name} 不得 import host 模块`)
    }
  })
})
