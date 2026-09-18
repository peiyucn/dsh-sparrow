/**
 * dsh-theme-tone client half：
 * - 底色 + 左栏填充经官方 `ctx.theme.overrideTokens` 公开 seam 落地（token 覆盖层，
 *   两个模式一次给全，故明暗轴切换无需重写）。
 * - 两个径向染色 + 颗粒纹理由插件自有的固定背景层承载（token 装不下渐变与纹理），
 *   深色轴走 `mix-blend-mode: screen`、浅色轴走正常合成，见 src/backdrop.ts。
 * - 「设置 → 常规」外观区挂一条「色调」行（order 12，紧随官方外观 10 / 字号 11）。
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
import { assertCapabilities, cssSupports, hasCapability } from '../compat.js'
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

/** 客户端硬依赖：主题服务、槽位、文案、settings 读取面。 */
export const inject = ['theme', 'slots', 'locale', 'settingsScope']

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
  ;(document.body ?? document.documentElement).appendChild(layer)
  return layer
}

/**
 * client half 入口。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》）：任一能力缺失即抛错自停用，
  // 绝不带上不认识的契约跑。
  assertCapabilities(ctx, name, [
    { name: 'ctx.theme.getTheme', ok: hasCapability(() => ctx.theme?.getTheme) },
    { name: 'ctx.theme.overrideTokens', ok: hasCapability(() => ctx.theme?.overrideTokens) },
    { name: 'ctx.settingsScope.bind', ok: hasCapability(() => ctx.settingsScope?.bind) },
    { name: 'ctx.slots.inject', ok: hasCapability(() => ctx.slots?.inject) },
    { name: 'ctx.slots.register', ok: hasCapability(() => ctx.slots?.register) },
    { name: 'ctx.locale.register', ok: hasCapability(() => ctx.locale?.register) },
    ...REQUIRED_CSS_FEATURES.map(feature => ({
      name: `CSS ${feature.name}`,
      ok: cssSupports(feature.probe),
    })),
  ])

  const style = ensureStyles()
  const layer = ensureLayer()
  const scope: SettingsScope<ThemeToneSettings> = ctx.settingsScope.bind<ThemeToneSettings>({
    namespace: SETTINGS_NAMESPACE,
  })
  const rowStore = createThemeToneRowStore()

  let disposeTokens: (() => void) | undefined
  let boundRow: BoundActions<typeof rowStore> | undefined
  let lastTokenKey = ''
  let revision = 0

  const readSettings = (): ThemeToneSettings => scope.getSnapshot().value ?? DEFAULT_SETTINGS

  /**
   * 把「这一轴是官方默认」挂到 body 上 / 摘掉。
   *
   * 玻璃与抬升面两张表的 CSS 仍然静态注入（可测、不重解析），靠 `body:not([PLAIN_ATTR])`
   * 这个门决定命不命中 —— 官方默认下两张表整表让路，外观与没装插件逐像素一致。
   * 挂在 `document.body` 上而不是 `documentElement`：presenter 的 token 也写在 body 上，同一处好回收。
   * @param plain - 当前轴是否为官方默认（= 整层隐藏）。
   */
  const paintPlain = (plain: boolean): void => {
    const target = document.body ?? document.documentElement
    if (plain) target.setAttribute(PLAIN_ATTR, '')
    else target.removeAttribute(PLAIN_ATTR)
  }

  /**
   * 写 token 覆盖层。色值与明暗轴无关（两个模式一次给全），故只在设置真的变了才重写 ——
   * `overrideTokens` 会 emit `theme/change`，条件跳过同时也是防自激环的闸门。
   * 同一 source 再调即整层替换并重排到顶，旧 disposer 随之变 no-op，故只留最新一个。
   */
  const paintTokens = (settings: ThemeToneSettings): void => {
    const key = `${settings.lightTone}|${settings.darkTone}`
    if (key === lastTokenKey) return
    lastTokenKey = key
    disposeTokens = ctx.theme.overrideTokens(PACKAGE_NAME, tokenOverrides(settings))
  }

  /** 写背景层与行状态：依赖当前解析出的明暗轴。 */
  const paintLayer = (snapshot: ThemeSnapshot): void => {
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
    const settings = readSettings()
    paintTokens(settings)
    paintLayer(ctx.theme.getTheme())
  }

  repaint()
  ctx.effect(() => scope.subscribe(() => { repaint() }), 'dsh-theme-tone: settings scope')

  // 明暗轴切换：token 层已按模式给全，presenter 会自己取用，故只需重算层与行。
  // `ctx.on` 的监听器本身就以 effect 记在当前 fiber 上，卸载自动摘除，无需再包一层。
  ctx.on('theme/change', snapshot => { paintLayer(snapshot) })

  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), 'dsh-theme-tone: locale dictionaries')
  ctx.effect(() => () => {
    layer.remove()
    style.remove()
    disposeTokens?.()
    // 门也要摘掉：留着它，卸载后玻璃与抬升面两张表的规则会继续被挡（表本身也随 style 没了，
    // 但属性不该残留在 body 上）。
    paintPlain(false)
  }, 'dsh-theme-tone: backdrop + token overrides')

  ctx.slots.inject(ROW_SLOT, () => ctx.slots.register({
    name: ROW_SLOT,
    id: ROW_ID,
    order: ROW_ORDER,
    locale: LOCALE_NAMESPACE,
    store: rowStore,
    inject: (actions: BoundActions<typeof rowStore>): ThemeToneRowInjected => {
      boundRow = actions
      // 注册后立刻补一次同步，避免丢掉「注册」与「首次事件」之间的变化。
      paintLayer(ctx.theme.getTheme())
      return {
        setTone: (id: ToneId) => {
          void scope.set(toneFieldFor(ctx.theme.getTheme().active.colorScheme), id)
        },
      }
    },
  }, ThemeToneRow as unknown as (props: object) => ReactNode))
}

