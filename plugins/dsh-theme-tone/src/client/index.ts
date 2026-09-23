/**
 * dsh-theme-tone client half：
 * - 底色 + 左栏填充经官方 `ctx.theme.overrideTokens` 公开 seam 落地（token 覆盖层，
 *   两个模式一次给全，故明暗轴切换无需重写）。
 * - 两个径向染色 + 颗粒纹理由插件自有的固定背景层承载（token 装不下渐变与纹理），
 *   深色轴走 `mix-blend-mode: screen`、浅色轴走正常合成，见 src/backdrop.ts。
 * - 「设置 → 常规」外观区挂一条「色调」行（`ROW_ORDER`，紧随官方外观与字号之间）。
 *
 * 无 slots 之外的服务写操作、不碰官方 DOM 结构、不 import Node 模块；
 * 卸载即回收 token / 背景层 / 样式表 / 设置行。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only：拉入 ui-renderer 的 SlotRegistry 服务合并（ctx.slots）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { cssSupports, hasCapability, warnMissingCapabilities, warnUser } from '../compat.js'
import {
  BACKDROP_CLASS,
  BOTTOM_VARIABLE,
  GRAIN_ATTR,
  LOCALE_NAMESPACE,
  LEFT_VARIABLE,
  MARKER_ATTR,
  PACKAGE_NAME,
  PLAIN_ATTR,
  ROW_ID,
  ROW_ORDER,
  ROW_SLOT,
  SETTINGS_NAMESPACE,
  TOP_VARIABLE,
  WORKSTART_ATTR,
  name,
} from '../constants.js'
import {
  LAYER_SELECTOR,
  REQUIRED_CSS_FEATURES,
  STYLE_SELECTOR,
  backdropPlan,
  buildBackdropCss,
} from '../backdrop.js'
import { buildGlassCss, buildSeamCss } from '../glass.js'
import { buildSurfaceCss } from '../surface.js'
import { buildSweepCss } from '../sweep.js'
import { isWorkstartProbe } from '../workstart.js'
import {
  DEFAULT_SETTINGS,
  toneFieldFor,
  toneIdOf,
  tokenOverrides,
  type ColorScheme,
  type ThemeToneSettings,
  type ToneId,
} from '../tones.js'
import { ThemeToneRow, type ThemeToneRowInjected } from './ThemeToneRow.js'
import { en, zh } from './locales.js'
import { buildRowCss } from './styles.js'
import { createThemeToneRowStore } from './store.js'

/**
 * 客户端硬依赖：主题、槽位、文案 —— **只放跨版本稳定存在的服务**。
 *
 * ⚠️ 设置的读取面（0.1.5-rc.2 的 `settingsScope`）**绝不能**写进这里：
 * `inject` 里缺服务时 fiber 会**永远 pending**，而客户端 boot 审计把 pending 当致命失败
 * （`dsh 0.1.7-alpha.1`：`packages/client/web/src/boot-client.ts:63-82`，pending 判定在 `:73-75`）
 * —— 实测该版本下页面直接停在 "Failed to load plugins：@dsh-sparrow/dsh-theme-tone:
 * pending (waiting for service: settingsScope)"，即插件把宿主整个 Web UI 拖死。
 * 换成 `ctx.inject` 起的**可选依赖 fork**（见 apply）：缺设置面只是本插件不画，宿主照常启动。
 */
export const inject = ['theme', 'slots', 'locale']

/**
 * 注入样式表（背景层 + 设置行 + 玻璃 + 缝挡板 + 抬升面合成一张；按标记属性去重，HMR / 重载不叠加）。
 * @returns 供卸载清理的 style 元素。
 */
function ensureStyles(): HTMLStyleElement {
  const css = `${buildBackdropCss()}${buildRowCss()}${buildGlassCss()}${buildSeamCss()}${buildSurfaceCss()}${buildSweepCss()}`
  const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
  if (existing !== null) {
    // 同名去重命中时校验内容：HMR 升级后旧 style 可能残留过期规则，刷新之。
    if (existing.textContent !== css) existing.textContent = css
    return existing
  }
  const style = document.createElement('style')
  style.setAttribute(MARKER_ATTR, '')
  style.textContent = css
  document.head.appendChild(style)
  return style
}

/**
 * 插入背景层（按标记属性去重，避免重载后叠层）。初始 `hidden`，由渲染计划接管。
 * @returns 供卸载清理的背景层元素。
 */
function ensureLayer(): HTMLDivElement {
  const existing = document.querySelector<HTMLDivElement>(LAYER_SELECTOR)
  if (existing !== null) return existing
  const layer = document.createElement('div')
  layer.setAttribute(MARKER_ATTR, '')
  layer.setAttribute('aria-hidden', 'true')
  layer.className = BACKDROP_CLASS
  layer.hidden = true
  // 固定定位层挂 body 即可；极端早期（body 未就绪）退到 documentElement。
  // ⚠️ 这一处**可以**退到 documentElement（与标记属性不同）：它是 `position: fixed` 的
  // 纯装饰层，样式表按 `.dsh-theme-tone` **类名**命中、不依赖任何 `body` 锚定选择器，
  // 挂在 `<html>` 上照常显示。标记属性则必须挂 body —— 消费侧写的是 `body:not([…])`。
  ;(document.body ?? document.documentElement).appendChild(layer)
  return layer
}

/**
 * client half 入口：稳定面能力门 → 等设置面就绪后装插件（见 {@link install}）。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》）：稳定面缺失即**惰性停用** ——
  // 告警后直接返回，不注册任何槽位 / 样式 / 监听。
  //
  // ⚠️ 客户端这半边**不能抛错**（故用 `warnMissingCapabilities` 而不是抛错版能力门）：
  // 客户端 boot 审计把任何非 active 的 entry 当致命失败，`apply` 抛错 = 宿主整页停在
  // "Failed to load plugins"。所以这里只检查**跨版本稳定**的能力面。
  if (!warnMissingCapabilities(ctx, name, [
    { name: 'ctx.theme.getTheme', ok: hasCapability(() => ctx.theme?.getTheme) },
    { name: 'ctx.theme.overrideTokens', ok: hasCapability(() => ctx.theme?.overrideTokens) },
    { name: 'ctx.slots.inject', ok: hasCapability(() => ctx.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => ctx.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => ctx.locale?.register) },
    ...REQUIRED_CSS_FEATURES.map(feature => ({
      name: `CSS ${feature.name}`,
      ok: cssSupports(feature.probe),
    })),
  ])) return

  /**
   * 设置读取面（`settingsScope`）走**可选依赖**：`ctx.inject` 起一个 fork，等它出现再装。
   *
   * ⚠️ 它**不能**写进本模块的 `inject`：inject 里缺服务时 fiber 会**永远 pending**，
   * 而客户端 boot 审计把 pending 当致命失败（`dsh 0.1.7-alpha.1`
   * `packages/client/web/src/boot-client.ts:63-82`，pending 判定在 `:73-75`）—— 实测该版本下
   * 宿主整页停在 "Failed to load plugins …: pending (waiting for service: settingsScope)"。
   * 也**不能**在这里当场一次性探测（`ctx.settingsScope?.bind`）：0.1.5-rc.2 上 ui-settings
   * 常常晚于本 entry 提供该服务，当场探必空 → 插件在**受支持的那条线**上白停用（实测过）。
   *
   * fork 的两种结局：服务出现 → 装；这条宿主线根本没有该服务（0.1.7+ 已改名 `configForms`）
   * → fork 一直挂着，本插件什么都不做。fork 是本 entry 的**子 fiber**，不进宿主 boot 审计的
   * entry 列表（`ctx.loader.entries()`），故它 pending 不会拖垮宿主启动 —— 这正是
   * 「宁可自己什么都不做，也不让宿主起不来」。
   */
  ctx.inject(['settingsScope'], (settingsCtx) => { install(settingsCtx) })
}

/**
 * 装上插件：色调 token 覆盖 + 背景层 + 玻璃 / 缝隙 / 抬升面 / 扫光样式表 + 设置行 + 订阅。
 *
 * 由 {@link apply} 在 `settingsScope` 就绪后调用；入参是该 fork 的上下文，所有
 * `ctx.effect` / `ctx.on` / 槽位注册都记在 fork 上 —— 本插件 entry 卸载（或设置服务消失）
 * 时它们随 fork 一起回收，不留 style / 背景层 / 监听。
 * @param ctx - 已就绪 `settingsScope` 的 Cordis 上下文。
 */
function install(ctx: Context): void {

  /**
   * 标记属性的**唯一宿主** —— 所有 `PLAIN_ATTR` / `WORKSTART_ATTR` 的读写都用它。
   *
   * ⚠️ **不能退到 `documentElement`**：消费侧的选择器全是 `body:not([PLAIN_ATTR])`
   * 与 `body:not([PLAIN_ATTR])[WORKSTART_ATTR]` —— 属性若挂在 `<html>` 上，
   * `body:not([...])` 恒真，三张表的门全部 **fail-open**，官方默认档下玻璃与抬升面照样命中。
   *
   * `body` 为 null 时（理论上不会：模块在 boot 之后才执行，`index.html` 自带 `<body>`）
   * 就**不打标记** —— 宁可这次不画，也不要打一个消费侧读不到的标记。
   * 同一个 `target` 被读/写/清理共用，避免 set 与 remove 目标漂移把属性残留下来。
   */
  const markerHost = document.body

  /**
   * 把「这一轴是官方默认」挂到 body 上 / 摘掉。
   *
   * 玻璃与抬升面两张表的 CSS 仍然静态注入（可测、不重解析），靠 `body:not([PLAIN_ATTR])`
   * 这个门决定命不命中 —— 官方默认下两张表整表让路，外观与没装插件逐像素一致。
   * 挂在 `document.body` 上而不是 `documentElement`：presenter 的 token 也写在 body 上，同一处好回收。
   *
   * ⚠️ **本函数必须声明在清理 effect 之前**：清理体要调它，若声明在 effect 之后，
   * 那么「effect 注册」与「声明」之间任一环节抛错时，cordis 跑清理会撞上 TDZ，
   * 抛 `ReferenceError` 把真正的失败原因盖掉（见下面清理 effect 的 ⚠️）。
   * @param plain - 当前轴是否为官方默认（= 整层隐藏）。
   */
  const paintPlain = (plain: boolean): void => {
    const target = markerHost
    if (target === null) return
    if (plain) target.setAttribute(PLAIN_ATTR, '')
    else target.removeAttribute(PLAIN_ATTR)
  }

  /**
   * 先武装清理，再创建资源。
   *
   * ⚠️ **顺序不能反**：cordis 只跑**已注册**的 disposer。若先 `ensureStyles()` /
   * `ensureLayer()` 再注册清理，那么两者之间任一环节抛错（`settingsScope.bind`、
   * 首次 `repaint` 里的 `overrideTokens` 校验、`locale.register` 重名…）都会让
   * `<style>` 与背景层**永久留在 DOM 里**，而 `PLAIN_ATTR` 从未置上 →
   * 三张表的 `body:not([PLAIN_ATTR])` 规则全部 fail-open 命中，
   * 得到一个「样式生效、无背景层、无生命周期」的半应用态。
   *
   * 用一个可变 holder 装资源：`ensureStyles` 自身抛错时 holder 仍为空，清理是空操作；
   * 它成功而 `ensureLayer` 抛错时，holder 里已有 style，清理照样收得掉。
   * 注册顺序也顺带正确 —— cordis 按注册的**逆序**跑 disposer，先注册者最后运行，
   * 正好让资源在所有其它 effect 之后回收。
   */
  const resources: { style?: HTMLStyleElement; layer?: HTMLDivElement } = {}
  ctx.effect(() => () => {
    resources.layer?.remove()
    resources.style?.remove()
    disposeTokens?.()
    // 门也要摘掉：留着它，卸载后玻璃与抬升面两张表的规则会继续被挡（表本身也随 style 没了，
    // 但属性不该残留在 body 上）。待启动态标记同理 —— 它是本插件加的，卸载必须收干净。
    paintPlain(false)
    markerHost?.removeAttribute(WORKSTART_ATTR)
  }, 'dsh-theme-tone: backdrop + token overrides')

  /**
   * ⚠️ **先把门关成「官方默认」，再注入样式表。**
   *
   * 门属性是 `body:not([PLAIN_ATTR])` 的**唯一开关**，而它此前只在 `paintLayer` 里写
   * （即 `paintPlain(plan.hidden)`）。可样式表是在本函数下面**无条件**注入的，而首次
   * `repaint()` 又要过 `shouldPaint()` 那道门 —— `status === 'loading'`（宿主还没回第一帧，
   * 官方 `SettingsScopeController` 的初值恒为 `'loading'`，见 `ui-settings/.../settings-scope.ts:71`）
   * 时它**直接 return，从不调用 `paintLayer`**。于是从「样式表注入」到「宿主回值」之间
   * 存在一个窗口：门属性**不存在** → 38 条带门的规则里**有 11 条当场命中**。
   *
   * 实测（真机 dsh）：该窗口内顶栏拿到 `backdrop-filter: blur(12px)`、输入框卡拿到
   * `blur(10px) saturate(1.45)` 且底色变成 58% 半透明 —— 一个选了「官方默认」的用户
   * 会先看到玻璃与染色，等宿主回值再被抹掉，正是本插件承诺「**完全不介入**」时最不该有的闪变。
   *
   * 修法：初值取**最保守**的一侧（`plain = true` = 整层让路）。宿主回值后 `paintLayer`
   * 会按真实色调把它翻成正确的值；期间宁可少画（官方外观），也绝不先画错。
   * 与 `shouldPaint()`「未就绪不上色」的既有口径完全一致 —— 原来只是漏在门属性这一条上。
   */
  paintPlain(true)
  resources.style = ensureStyles()
  resources.layer = ensureLayer()
  // 只留 layer 的局部别名（渲染计划要写它的 style 属性）；
  // style 仅由清理 effect 经 holder 回收，无其它读取点，故不取名。
  const layer = resources.layer
  const scope: SettingsScope<ThemeToneSettings> = ctx.settingsScope.bind<ThemeToneSettings>({
    namespace: SETTINGS_NAMESPACE,
  })
  const rowStore = createThemeToneRowStore()

  let disposeTokens: (() => void) | undefined
  let boundRow: BoundActions<typeof rowStore> | undefined
  let lastTokenKey = ''
  let revision = 0

  /**
   * 进程内兜底值 —— 宿主侧设置**不可用**时（非 loopback 的 memory 模式，或命名空间未暴露）
   * 用它承载本次会话的选择。
   *
   * 为什么必须有：官方契约 `mode: 'memory'` 时 `writable` 恒为 false，
   * 且 `SettingsScopeController.enqueue()` 在 memory 下**直接 return**
   * （官方 `ui-settings/lib/client.js`：`if (this.persistence === "memory" || this.disposed)
   * return Promise.resolve()`）。也就是说此时 `set()` 是**静默空操作**、`subscribe` 永不触发
   * （只有 `persistence === "host"` 才订阅 mirror）。
   *
   * 若不做兜底：用户点色调**屏幕毫无反应、也无任何日志** —— 既违反本插件 spec
   * （01-design §6「按 ui-theme 对非 loopback 的口径降级为进程内状态，并在日志里说明」），
   * 也违反根规范《鲁棒性·失败路径用户可见》与《扩展与宿主兼容·不得带病运行》。
   */
  let localSettings: ThemeToneSettings = DEFAULT_SETTINGS
  let warnedNoPersistence = false

  /**
   * 当前该用哪份设置。
   *
   * ⚠️ 这里**不能**写成 `value ?? DEFAULT_SETTINGS`：`status === 'loading'` 时
   * `value` 也是 `undefined`，那样会在宿主回第一帧之前**先按默认值上色**，
   * 等真值到达再纠正 —— 改过色调的用户每次冷加载都会看到一次可见跳变
   * （浅色轴默认 `official`、深色轴默认 `violet`，与多数人的实际选择不同）。
   * 就绪前一律用**进程内兜底值**（初值 = 默认，且此时没人改过它），
   * 并由 {@link shouldPaint} 决定先不上色。
   */
  const readSettings = (): ThemeToneSettings => {
    const snapshot = scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) return snapshot.value
    return localSettings
  }

  /**
   * 现在能不能上色。
   *
   * `loading`（宿主还没回第一帧）→ **不上色**：此刻没有任何权威值，
   * 按默认值画一遍再纠正就是可避免的闪变（见 {@link readSettings}）。
   * `ready` → 正常上色。`unavailable` → 用进程内兜底值上色（选择仍应生效，只是不持久化）。
   */
  const shouldPaint = (): boolean => scope.getSnapshot().status !== 'loading'

  /** 宿主不可写时记**一条**告警（不重复刷）。 */
  const warnIfNotPersistable = (): void => {
    if (warnedNoPersistence) return
    const snapshot = scope.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.writable) return
    if (snapshot.status === 'loading') return
    warnedNoPersistence = true
    warnUser(
      ctx,
      `${name}: 本次会话的设置无法写入宿主（${snapshot.mode === 'memory' ? '页面非本机回环地址' : '该设置项对当前客户端不可用'}）；`
      + '色调仍会在本次会话内生效，但不会持久化。从本机回环地址访问 dsh 即可保存。',
    )
  }

  /**
   * 写 token 覆盖层。色值与明暗轴无关（两个模式一次给全），故只在设置真的变了才重写 ——
   * `overrideTokens` 会 emit `theme/change`，条件跳过同时也是防自激环的闸门。
   * 同一 source 再调即整层替换并重排到顶，旧 disposer 随之变 no-op，故只留最新一个。
   *
   * ⚠️ `lastTokenKey` **必须在成功后**才前进：先置 key 再调用的话，万一 `overrideTokens`
   * 抛错（官方会校验入参形状），key 已经前进了 —— 下次同样的设置会被判为「没变」而**永不重试**，
   * 色调就永久停在旧值上。写在后面则失败不前进，下一次 repaint 会自然重试。
   */
  const paintTokens = (settings: ThemeToneSettings): void => {
    const key = `${settings.lightTone}|${settings.darkTone}`
    if (key === lastTokenKey) return
    const dispose = ctx.theme.overrideTokens(PACKAGE_NAME, tokenOverrides(settings))
    // 成功之后才认账
    lastTokenKey = key
    disposeTokens = dispose
  }

  /**
   * 写背景层与行状态：依赖当前解析出的明暗轴。
   *
   * ⚠️ **这里也要过 `shouldPaint()` 那道门**（不能只靠 `repaint()` 里的那份）。
   * `theme/change` 是**另一条**直达本函数的路径，它**不经过 `repaint()`** —— 而官方的
   * `theme/change` 由 ui-theme 自己的 settings scope 驱动，与本插件的 settings 就绪
   * **没有先后保证**。于是「ui-theme 先就绪、本插件还在 `loading`」时，本函数会用
   * `readSettings()` 的进程内兜底值（= 默认值，深色轴 `violet`）算出 `hidden = false`
   * → `paintPlain(false)` **把门打开** → 一个实际选了「官方默认」的用户照样吃到玻璃与染色，
   * 直到本插件自己回值再纠正。这与上面 `paintPlain(true)` 要堵的是**同一个洞**，只是另一个入口。
   *
   * 未就绪一律不画：层保持 `hidden`、门保持关，等本插件拿到权威值再一次性画对。
   */
  const paintLayer = (snapshot: ThemeSnapshot): void => {
    if (!shouldPaint()) return
    const settings = readSettings()
    const scheme: ColorScheme = snapshot.active.colorScheme
    const plan = backdropPlan(scheme, settings)
    layer.hidden = plan.hidden
    // 「这一轴选了官方默认」= 没有染色 = 整层隐藏。把这个事实挂到 body 上，
    // 让玻璃与抬升面两张表整表让路（owner：官方默认的都不要动，给个完全不动的参考）。
    paintPlain(plan.hidden)
    if (!plan.hidden) {
      layer.style.setProperty(TOP_VARIABLE, plan.top)
      layer.style.setProperty(BOTTOM_VARIABLE, plan.bottom)
      // 左侧金晕是可选层；纯色色调不给就移除变量，让样式表里的 transparent 兜底生效。
      if (plan.left === '') layer.style.removeProperty(LEFT_VARIABLE)
      else layer.style.setProperty(LEFT_VARIABLE, plan.left)
    }
    layer.setAttribute(GRAIN_ATTR, plan.grain ? 'on' : 'off')
    revision += 1
    boundRow?.sync(scheme, toneIdOf(settings, scheme), revision)
  }

  /** 设置变更：token、层、行全都要重算。 */
  const repaint = (): void => {
    // 宿主还没回第一帧（`loading`）就不上色 —— 此刻没有权威值，按默认画一遍再纠正
    // 就是一次可避免的闪变（见 readSettings 的 ⚠️）。
    if (!shouldPaint()) return
    warnIfNotPersistable()
    const settings = readSettings()
    paintTokens(settings)
    paintLayer(ctx.theme.getTheme())
  }

  /**
   * 「未选工作区」待启动态的观测 —— 给 body 打 {@link WORKSTART_ATTR}，让玻璃把边界让回官方。
   *
   * 为什么需要观测：官方那个状态只体现为一个 **CSS-module 哈希类名**（不能写，仓库红线），
   * 它同时写入的语义属性又全被本插件与官方其它控件污染（三选一全误命中，见 constants.ts）。
   * 唯一可靠的判据是**那条虚线伪元素自己的签名** —— 所以只能读 `::after` 的计算样式。
   *
   * 代价与边界：
   * * 每次只读**一个**元素（`[data-composer-card]`）的两个计算值，不做子树遍历；
   * * `getComputedStyle` 会强制样式解析，故**同一帧内合并**（rAF 去抖），
   *   且只在 DOM 变动时跑 —— hero 页与对话页都很安静，不会成为热路径；
   * * observer 挂在 `document.body`（官方卡片进出都在其下），随 `ctx.effect` 卸载断开。
   */
  const probeWorkstart = (): void => {
    const target = markerHost
    // body 缺失（理论上不会）就不打标记 —— 消费侧只认 body 上的属性。
    if (target === null) return
    const card = document.querySelector('[data-composer-card]')
    let active = false
    if (card !== null) {
      // 传 null 取伪元素自身；`::after` 在部分引擎上要用 webkit 版取 mask。
      const after = getComputedStyle(card, '::after')
      active = isWorkstartProbe({
        content: after.content,
        maskImage: after.maskImage,
        webkitMaskImage: after.getPropertyValue('-webkit-mask-image'),
      })
    }
    if (active) target.setAttribute(WORKSTART_ATTR, '')
    else target.removeAttribute(WORKSTART_ATTR)
  }

  /**
   * 同一帧内合并多次 DOM 变动，避免连续写属性触发无谓重排。
   *
   * ⚠️ rAF 句柄**必须存下来并在卸载时取消**：`ctx.effect` 只管它收集到的 disposer，
   * 不会替你取消已入队的动画帧。否则「变动入队 → 卸载 → 帧才到」这条时序里，
   * 回调会在清理**之后**跑，把刚摘掉的 {@link WORKSTART_ATTR} 重新写回 body
   * （官方那条虚线仍在，判定仍为真）—— 属性就永久残留了。
   */
  let probeScheduled = false
  let probeFrame = 0
  const scheduleProbe = (): void => {
    if (probeScheduled) return
    probeScheduled = true
    probeFrame = requestAnimationFrame(() => {
      probeScheduled = false
      probeFrame = 0
      probeWorkstart()
    })
  }

  repaint()
  ctx.effect(() => scope.subscribe(() => { repaint() }), 'dsh-theme-tone: settings scope')

  // 待启动态观测：初跑一次，随后只在 DOM 变动时重算（同帧合并，见 scheduleProbe）。
  // `attributes` 必须过滤到 class —— 否则官方每次改任意属性都会触发全量回调节流。
  probeWorkstart()
  ctx.effect(() => {
    const root = markerHost
    // body 缺失时没有可观察的宿主 —— 直接不装（probeWorkstart 也不会打标记）。
    if (root === null) return () => {}
    const observer = new MutationObserver(scheduleProbe)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    return () => {
      observer.disconnect()
      // 取消尚未触发的探测，见 scheduleProbe 的 ⚠️。
      if (probeFrame !== 0) cancelAnimationFrame(probeFrame)
      probeFrame = 0
      probeScheduled = false
    }
  }, 'dsh-theme-tone: workstart probe')

  // 明暗轴切换：token 层已按模式给全，presenter 会自己取用，故只需重算层与行。
  // `ctx.on` 的监听器本身就以 effect 记在当前 fiber 上，卸载自动摘除，无需再包一层。
  ctx.on('theme/change', snapshot => { paintLayer(snapshot) })

  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), 'dsh-theme-tone: locale dictionaries')

  ctx.slots.inject(ROW_SLOT, () => ctx.slots.register({
    name: ROW_SLOT,
    id: ROW_ID,
    order: ROW_ORDER,
    locale: LOCALE_NAMESPACE,
    store: rowStore,
    inject: (actions: BoundActions<typeof rowStore>): ThemeToneRowInjected => {
      boundRow = actions
      // 注册后立刻补一次同步，避免丢掉「注册」与「首次事件」之间的变化。
      // 仍走 repaint 那道「未就绪不上色」的门 —— 注册早于宿主回值时不画默认色。
      repaint()
      return {
        setTone: (id: ToneId) => {
          const scheme = ctx.theme.getTheme().active.colorScheme
          const field = toneFieldFor(scheme)
          const snapshot = scope.getSnapshot()
          // 宿主不可写（memory 模式 / 命名空间未暴露）时 `scope.set` 是**静默空操作**，
          // 点下去屏幕不会有任何反应。此时写进程内兜底值并立刻重绘，
          // 让选择在**本次会话内**照常生效（只是不持久化），并记一条告警说明原因。
          if (snapshot.status !== 'ready' || !snapshot.writable) {
            localSettings = { ...localSettings, [field]: id }
            warnIfNotPersistable()
            repaint()
            return
          }
          void scope.set(field, id)
        },
      }
    },
  }, ThemeToneRow as unknown as (props: object) => ReactNode))
}
