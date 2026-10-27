// @ts-check
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  API_PREFIX,
  CREDIT_PROJECTION_KEY,
  DISPLAY_NAME,
  LOCALE_NAMESPACE,
  PROVIDER_ID,
  SETTINGS_NAMESPACE,
  STYLE_SELECTOR,
} from '../lib/constants.js'

/**
 * 2026-10 第一阶段重构的结构守卫：文档只剩单一现状、契约常量单一来源、
 * client 统一注入样式、组件内不再自建 `<style>`、能力门与注册冲突处理就位。
 */
const SRC = new URL('../src/', import.meta.url)
const CLIENT = new URL('../src/client/', import.meta.url)
const readSrc = (name) => readFile(new URL(name, SRC), 'utf8')
const readClient = (name) => readFile(new URL(name, CLIENT), 'utf8')
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')

describe('dsh-codebuddy-credits 结构：文档与契约常量', () => {
  it('docs/spec 应该 只剩单一的 00-overview（01–10 已删）', async () => {
    const specs = await readdir(new URL('../docs/spec', import.meta.url))
    assert.deepEqual(specs, ['00-overview.md'])
  })

  it('provider id / settings NS / display name / locale ns / 投影 key 应该 全部来自 constants', () => {
    assert.equal(PROVIDER_ID, 'codebuddy-credits')
    assert.equal(SETTINGS_NAMESPACE, 'llm-codebuddy-credits')
    assert.equal(DISPLAY_NAME, 'CodeBuddy Credits')
    assert.equal(LOCALE_NAMESPACE, 'codebuddy-credits')
    assert.equal(CREDIT_PROJECTION_KEY, 'codebuddyCredits')
    assert.equal(LOCALE_NAMESPACE, PROVIDER_ID, 'locale 命名空间与 provider id 同源（各自是常量，不手写第二份）')
    assert.equal(API_PREFIX, `/api/${PROVIDER_ID}`, 'HTTP 前缀必须由 provider id 派生')
    assert.equal(STYLE_SELECTOR, 'style[data-dsh-codebuddy-credits]')
  })

  it('package.json 应该 声明 bundle patch / client web / 客户端导出', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
    assert.equal(pkg.exports['./client'].default, './lib/client.js')
  })
})

describe('dsh-codebuddy-credits 结构：常量不再手写字面量', () => {
  it('client/index.ts 的卡片 key / locale ns 应该 来自 constants', async () => {
    const src = await readClient('index.ts')
    assert.match(src, /import \{[^}]*LOCALE_NAMESPACE[^}]*SETTINGS_NAMESPACE[^}]*\} from '\.\.\/constants\.js'/u,
      'client/index 必须从 constants import LOCALE_NAMESPACE / SETTINGS_NAMESPACE')
    assert.match(src, /key: SETTINGS_NAMESPACE/u, '设置卡槽位 key 必须用 SETTINGS_NAMESPACE')
    assert.match(src, /ctx\.locale\.register\(LOCALE_NAMESPACE/u, '词典必须注册到 LOCALE_NAMESPACE')
    assert.ok(!/locale: 'codebuddy-credits'/u.test(src), '槽位 locale 不得手写字面量')
    assert.ok(!/key: 'llm-codebuddy-credits'/u.test(src), '卡片 key 不得手写字面量')
  })

  it('client/model-facts.ts 应该 不再自带 provider id 字面量', async () => {
    const src = await readClient('model-facts.ts')
    assert.ok(!/codebuddy-credits/u.test(src), 'model-facts 不负责声明 provider id（消费方从 constants import）')
    assert.ok(!/ensureModelFacts/u.test(src), 'ensureModelFacts 无调用方，已删')
  })

  it('credits-ledger / credits-projection 应该 从 constants 取 provider id 与投影 key', async () => {
    const ledger = await readSrc('credits-ledger.ts')
    assert.match(ledger, /import \{ PROVIDER_ID \} from '\.\/constants\.js'/u)
    assert.ok(!/const PROVIDER_ID = 'codebuddy-credits'/u.test(ledger), '不得再内联定义 provider id')

    const projection = await readSrc('credits-projection.ts')
    assert.match(projection, /import \{ CREDIT_PROJECTION_KEY \} from '\.\/constants\.js'/u)
    assert.match(projection, /key: CREDIT_PROJECTION_KEY/u, '投影单元 key 必须来自 constants')
    assert.ok(!/key: 'codebuddyCredits'/u.test(projection), '不得再手写投影 key')
  })

  it('host index.ts 应该 用常量组装 provider / settings / 投影读取', async () => {
    const src = stripComments(await readSrc('index.ts'))
    assert.match(src, /export const name = SETTINGS_NAMESPACE/u)
    assert.match(src, /import \{[^}]*PROVIDER_ID[^}]*SETTINGS_NAMESPACE[^}]*\} from '\.\/constants\.js'/u,
      'provider id / settings NS 必须从 constants import')
    assert.ok(!/'llm-codebuddy-credits'/u.test(src), '插件名不得手写（= SETTINGS_NAMESPACE）')
    assert.ok(!/'codebuddy-credits'/u.test(src), 'provider id 不得手写（= PROVIDER_ID）')
    assert.match(src, /stateOf\(session, CREDIT_PROJECTION_KEY\)/u)
  })

  it('adapter 的 provider 展示名 应该 来自 constants', async () => {
    const src = await readSrc('adapter.ts')
    assert.match(src, /import \{[^}]*DISPLAY_NAME[^}]*\} from '\.\/constants\.js'/u)
    assert.match(src, /name: DISPLAY_NAME/u)
    assert.ok(!/CodeBuddy Credits/u.test(stripComments(src)), '展示名不得在 adapter 里手写')
  })

  it('web.ts 应该 由 API_PREFIX 派生路由前缀且不再用 socket 来源白名单', async () => {
    const src = stripComments(await readSrc('web.ts'))
    assert.match(src, /const PREFIX = API_PREFIX/u)
    assert.ok(!/localOnly/u.test(src), 'LAN 修复：localOnly 双门已删，信任栅栏覆盖回环/LAN')
    assert.ok(!/remoteAddress/u.test(src), '不得再按 socket 来源拒绝请求')
  })
})

describe('dsh-codebuddy-credits 结构：能力门与注册冲突', () => {
  it('host 门 应该 探真实调用的方法，且不再探从未使用的 resolveModelInfo', async () => {
    const src = await readSrc('index.ts')
    assert.match(src, /llm\.registerAdapter/u)
    assert.match(src, /llm\.registerConfigurableProviders/u)
    assert.match(src, /llm\.registerModelDiscovery/u)
    assert.ok(!/llm\.resolveModelInfo/u.test(src), 'resolveModelInfo 从未使用，不得再进能力门')
    assert.match(src, /assertCapabilities\(ctx, name/u)
  })

  it('三处注册 / ensureRoutes 必须包 try-catch，DUPLICATE_* 走统一告警', async () => {
    const src = await readSrc('index.ts')
    assert.match(src, /warnRegistrationFailure\(/u)
    /** @type {Array<[string, RegExp]>} */
    const calls = [
      ['设置页 provider 目录', /warnRegistrationFailure\(ctx, name, '设置页 provider 目录', error\)/u],
      ['provider 路由', /warnRegistrationFailure\(ctx, name, 'provider 路由', error\)/u],
      ['模型发现', /warnRegistrationFailure\(ctx, name, '模型发现', error\)/u],
    ]
    for (const [label, re] of calls) assert.match(src, re, `${label} 的注册失败必须走 warnRegistrationFailure`)
    assert.match(src, /try \{\s*ensureRoutes\(ambientKey\(\)\)\s*\}/u, 'ensureRoutes(ambientKey()) 必须包 try-catch')
  })

  it('client half 应该 先跑不抛错的惰性门（slots.inject/register + locale.register/bind）', async () => {
    const src = await readClient('index.ts')
    assert.match(src, /warnMissingCapabilities\(c, SETTINGS_NAMESPACE, \[/u)
    for (const probe of ['ctx.slots.inject', 'ctx.slots.register', 'ctx.locale.register', 'ctx.locale.bind']) {
      assert.ok(src.includes(`name: '${probe}'`), `client 能力门缺少 ${probe} 探针`)
    }
    assert.match(src, /if \(!warnMissingCapabilities\([\s\S]*?\)\) return/u, '缺失时必须直接 return（不注册任何东西）')
    assert.ok(!/assertCapabilities\(/u.test(src), 'client half 不得使用抛错版能力门')
    // 门必须出现在任何副作用之前。
    const gate = src.indexOf('warnMissingCapabilities(')
    for (const sideEffect of ['injectCodeBuddyStyles(', 'ctx.locale.register(', 'ctx.slots.inject(']) {
      assert.ok(gate < src.indexOf(sideEffect), `能力门必须早于 ${sideEffect}`)
    }
  })
})

describe('dsh-codebuddy-credits 结构：样式统一注入', () => {
  it('styles.ts 应该 提供纯 build*Css 与统一注入函数（不再有 ensure*Styles）', async () => {
    const src = await readClient('styles.ts')
    for (const builder of [
      'buildIndicatorCss', 'buildCardCss', 'buildStatsCss', 'buildTurnCreditCss',
      'buildModelLabelCss', 'buildCreditDialogCss', 'buildCodeBuddyCss',
    ]) {
      assert.match(src, new RegExp(`export function ${builder}\\(`, 'u'), `缺 ${builder}()`)
    }
    assert.match(src, /export function injectCodeBuddyStyles\(/u)
    assert.match(src, /STYLE_SELECTOR/u, 'HMR 复用必须用 marker 选择器')
    assert.ok(!/ensure[A-Z]\w*Styles/u.test(src), '不得再保留 ensure*Styles')
  })

  it('client/index.ts 应该 统一注入样式并登记卸载清理', async () => {
    const src = await readClient('index.ts')
    assert.match(src, /const style = injectCodeBuddyStyles\(\)/u)
    assert.match(src, /ctx\.effect\(\(\) => \(\) => \{ style\.remove\(\) \}/u, '样式表必须在 effect 里移除')
    assert.ok(!/createElement\('style'\)/u.test(src), 'index 不直接建 style（交给 styles.ts）')
  })

  it('⛔ 组件内不得 createElement(\'style\') / 直接 append head', async () => {
    const entries = await readdir(CLIENT, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue
      const src = await readClient(entry.name)
      assert.ok(!/createElement\('style'\)/u.test(src), `${entry.name} 不得自建 <style>（统一由 styles.ts 注入）`)
      assert.ok(!/document\.head/u.test(src), `${entry.name} 不得直接 append document.head`)
      assert.ok(!/ensure[A-Z]\w*Styles/u.test(src), `${entry.name} 不得再导出 ensure*Styles`)
    }
  })

  it('组件静态样式应该 走类名表，只有定位 / 宽度等动态值保留 inline style', async () => {
    for (const file of [
      'CodeBuddyCreditsIndicator.tsx', 'CodeBuddyCreditsCard.tsx', 'CodeBuddyCreditsStats.tsx',
      'CodeBuddyTurnCredit.tsx', 'CodeBuddyModelLabel.tsx', 'CreditDialog.tsx', 'BusyDot.tsx',
    ]) {
      const src = await readClient(file)
      assert.match(src, /CCB_CLASS/u, `${file} 必须用 styles.ts 的类名表`)
      assert.ok(!/const \w+Style: CSSProperties/u.test(src), `${file} 不得再定义静态样式对象`)
    }
  })
})

describe('dsh-codebuddy-credits 结构：契约红线', () => {
  it('src 内不得使用 localStorage（会话/模型事实只存内存或投影）', async () => {
    const root = fileURLToPath(SRC)
    const files = await readdir(root, { recursive: true, withFileTypes: true })
    for (const entry of files) {
      if (!entry.isFile() || !/\.tsx?$/u.test(entry.name)) continue
      const src = await readFile(join(entry.parentPath ?? root, entry.name), 'utf8')
      assert.ok(!/localStorage/u.test(src), `${entry.name} 不得使用 localStorage`)
    }
  })

  it('adapter 不得再留 onUsage / CodeBuddyUsage / usageReported（记账只走事件重放）', async () => {
    const src = await readSrc('adapter.ts')
    for (const dead of ['onUsage', 'CodeBuddyUsage', 'usageReported']) {
      assert.ok(!new RegExp(`\\b${dead}\\b`, 'u').test(src), `adapter 不得保留 ${dead}`)
    }
  })
})
