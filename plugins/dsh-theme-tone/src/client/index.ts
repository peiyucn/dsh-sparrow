/**
 * dsh-theme-tone client half：底色 + 左栏填充经官方 `ctx.theme.overrideTokens` 公开 seam 落地（token 覆盖层，两个模式一次给全）；两个径向染色 + 颗粒纹理由插件自有的固定背景层承载（token 装不下渐变与纹理），见 `../backdrop.ts`。
 * 「设置 → 常规」外观区挂一条「色调」行（`ROW_ORDER`，紧随官方外观与字号之间）。
 * 无 slots 之外的服务写操作、不碰官方 DOM 结构、不 import Node 模块；卸载即回收全部资源与监听。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { BoundActions } from '@deepseek-ai/dsh-client-store'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only：拉入 ui-renderer 的 SlotRegistry 服务合并（ctx.slots）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { cssSupports, hasCapability, warnMissingCapabilities, warnUser } from '../compat.js'
import { ANCHOR, ANCHOR_ATTR, anchorValue, type AnchorToken } from '../anchors.js'
import {
  BACKDROP_CLASS,
  BOTTOM_VARIABLE,
  CONTENT_ATTR,
  GRAIN_ATTR,
  LOCALE_NAMESPACE,
  LEFT_VARIABLE,
  MARKER_ATTR,
  PACKAGE_NAME,
  PHASE_BAND_ATTR,
  PHASE_BAND_TOP_VARIABLE,
  PHASE_BAND_VARIABLE,
  PHASE_NOTCH_ATTR,
  PHASE_NOTCH_TOP_VARIABLE,
  PHASE_NOTCH_VARIABLE,
  PHASE_SETTLE_FRAMES,
  RIGHT_PANEL_ATTR,
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
import { buildCaptionCss } from '../caption.js'
import { buildGlassCss, buildSeamCss } from '../glass.js'
import { NAV_ARIA_LABELS } from '../nav-pin.js'
import { HEADER_ACTION_SLOT } from '../popover.js'
import { buildMaskCss } from '../mask.js'
import { buildNavPinCss } from '../nav-pin.js'
import { HANDLE_SELECTOR, applyGlow } from '../handle-glow.js'
import { buildPopoverCss } from '../popover.js'
import { buildSurfaceCss } from '../surface.js'
import { buildSweepCss } from '../sweep.js'
import { isWorkstartProbe } from '../workstart.js'
import { pseudoOrigin, solvePhaseOrigin } from '../phase.js'
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
import { createPendingToneTracker, type PendingToneWrite } from './pending.js'
import { buildRowCss } from './styles.js'
import { createThemeToneRowStore } from './store.js'

/**
 * 客户端硬依赖：主题、槽位、文案 —— **只放跨版本稳定存在的服务**。⚠️ 设置的读取面（`configForms`）**绝不能**
 * 写进这里：`inject` 里缺服务时 fiber 会**永远 pending**，而客户端 boot 审计把 pending 当致命失败
 * （`assertEntriesActive`）⇒ 宿主整个 Web UI 停在 "Failed to load plugins"。它走 `ctx.inject` 起的**可选依赖
 * fork**（见 {@link apply}）：缺设置面只是本插件不画，宿主照常启动。
 */
export const inject = ['theme', 'slots', 'locale']

/**
 * 注入样式表（背景层 + 设置行 + 玻璃 + 缝挡板 + 抬升面 + 遮罩模糊 + 扫光带 + 轮次导航/宽度钳制合成一张；
 * 按标记属性去重，HMR / 重载不叠加）。⚠️ nav-pin 那两段并入**本表**、不再单开 `style[data-dsh-nav-pin]`。
 */
function ensureStyles(): HTMLStyleElement {
  const css = `${buildBackdropCss()}${buildRowCss()}${buildGlassCss()}${buildSeamCss()}${buildSurfaceCss()}${buildMaskCss()}${buildSweepCss()}${buildNavPinCss()}${buildCaptionCss()}${buildPopoverCss()}`
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

/** 插入背景层（按标记属性去重，避免重载后叠层）。初始 `hidden`，由渲染计划接管。 */
function ensureLayer(): HTMLDivElement {
  const existing = document.querySelector<HTMLDivElement>(LAYER_SELECTOR)
  if (existing !== null) return existing
  const layer = document.createElement('div')
  layer.setAttribute(MARKER_ATTR, '')
  layer.setAttribute('aria-hidden', 'true')
  layer.className = BACKDROP_CLASS
  layer.hidden = true
  // 固定定位层挂 body 即可；极端早期（body 未就绪）退到 documentElement。
  // ⚠️ 本插件加的**标记属性**没有这个余地 —— 消费侧写的是 `body:not([…])`，挂在 `<html>` 上会 fail-open。
  ;(document.body ?? document.documentElement).appendChild(layer)
  return layer
}

/**
 * 让官方宽度拖拽条的**悬停光带**跟随指针（修官方 bug，理由见 `../handle-glow.ts`）。接线只取事件与元素，
 * 判定全在纯函数里；帧合并（`requestAnimationFrame`）不可省 —— `getBoundingClientRect` 强制布局，高频移动
 * 不合并会拖满主线程。⚠️ 刻意只降级、不停用：不加能力门（`pointermove` 缺失时监听自然收不到事件 = 回到官方
 * 现状，而加门会把整张样式表一起停掉）；取几何包 try/catch 不冒泡；本条**不带色调门**，两档都生效。
 */
function followHandleGlow(ctx: Context): void {
  /** 同帧待处理的一次移动（只留最后一次 —— 光带只需要最新位置）。 */
  let pending: { readonly handle: HTMLElement; readonly clientY: number } | null = null
  let frame: number | null = null

  const flush = (): void => {
    frame = null
    const job = pending
    pending = null
    if (job === null) return
    try {
      applyGlow(job.handle, job.clientY)
    } catch {
      // 元素已从文档摘除 / 取不到几何 —— 跳过这一帧，下一次移动会重新解析。
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    const target = event.target
    // 事件目标未必是 Element（如文本节点）；`closest` 前先收窄。
    if (!(target instanceof Element)) return
    const handle = target.closest(HANDLE_SELECTOR)
    // 页面里绝大多数移动都不落在拖拽条上，这里就是热路径的早退。
    if (!(handle instanceof HTMLElement)) return
    pending = { handle, clientY: event.clientY }
    frame ??= requestAnimationFrame(flush)
  }

  document.addEventListener('pointermove', onPointerMove, { passive: true })
  ctx.effect(() => () => {
    document.removeEventListener('pointermove', onPointerMove)
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    pending = null
  }, 'dsh-theme-tone: handle glow follows pointer')
}

/** client half 入口：稳定面能力门 → 等设置面就绪后装插件（见 {@link install}）。 */
export function apply(ctx: Context): void {
  // 宿主兼容自检：稳定面缺失即**惰性停用** —— 告警后直接返回，不注册任何槽位 / 样式 / 监听。
  // ⚠️ 客户端这半边**不能抛错**（故用 `warnMissingCapabilities` 而不是抛错版能力门）：boot 审计把任何
  // 非 active 的 entry 当致命失败，`apply` 抛错 = 宿主整页停在 "Failed to load plugins"。
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
   * 设置读取面（`configForms`）走**可选依赖 fork**：服务出现才装，这条宿主线没有就什么都不做。
   * ⚠️ 既**不能**写进本模块的 `inject`（缺服务 → fiber 永远 pending → boot 审计判致命失败），也**不能**在这里
   * 当场一次性探测（ui-settings 可能晚于本 entry 提供该服务，当场探必空 ⇒ 插件在受支持的那条线上白停用）。
   * fork 是本 entry 的**子 fiber**，不进 boot 审计的 entry 列表，故它 pending 不会拖垮宿主启动。
   */
  ctx.inject(['configForms'], (settingsCtx) => { install(settingsCtx) })
}

/**
 * 装上插件：色调 token 覆盖 + 背景层 + 玻璃 / 缝隙 / 抬升面 / 扫光样式表 + 设置行 + 订阅。
 * 由 {@link apply} 在 `configForms` 就绪后调用；入参是该 fork 的上下文，所有 `ctx.effect` / `ctx.on` /
 * 槽位注册都记在 fork 上 —— entry 卸载（或设置服务消失）时随 fork 一起回收，不留 style / 背景层 / 监听。
 */
function install(ctx: Context): void {

  /**
   * 标记属性的**唯一宿主** —— 所有 `PLAIN_ATTR` / `WORKSTART_ATTR` 的读写都用它，避免 set 与 remove 目标漂移
   * 把属性残留下来。⚠️ **不能退到 `documentElement`**：消费侧选择器全是 `body:not([PLAIN_ATTR])`，属性挂在
   * `<html>` 上时 `body:not([...])` 恒真、三张表的门全部 **fail-open**。`body` 为 null 时就**不打标记**。
   */
  const markerHost = document.body

  /**
   * 把「这一轴是官方默认」挂到 body 上 / 摘掉：两张表的 CSS 静态注入（可测、不重解析），靠
   * `body:not([PLAIN_ATTR])` 决定命不命中 —— 官方默认下整表让路，外观与没装插件逐像素一致。
   * ⚠️ **必须声明在清理 effect 之前**：清理体要调它，声明在后则「注册」与「声明」之间抛错时 cordis 跑清理
   * 会撞上 TDZ，抛 `ReferenceError` 把真正的失败原因盖掉。
   */
  const paintPlain = (plain: boolean): void => {
    const target = markerHost
    if (target === null) return
    if (plain) target.setAttribute(PLAIN_ATTR, '')
    else target.removeAttribute(PLAIN_ATTR)
  }

  /**
   * 维护 {@link ANCHOR_ATTR}——把原本写在 CSS 里的 `:has()` 判据搬到运行期（成本来自 `:has()` 的失效跟踪，换成同命中集的属性选择器可拿回几乎全部收益，效果一字不变）。由 `scheduleProbe` 同帧合并后调用。
   * 三条开销纪律：① JS 里**绝不用 `:has()` 反查**，全用标签 / 属性选择器 + 父子关系表达；② **只在值变化时写属性**（写一次引一次样式失效，靠 {@link anchored} 做集合差）；③ **扫描量有界**（先查一批便宜锚点，再看它们的父子关系，不做全树遍历）。
   */
  const maintainAnchors = (): void => {
    const root = markerHost
    if (root === null) return
    /** 本轮「希望」的锚点：元素 → token 列表。 */
    const want = new Map<Element, AnchorToken[]>()
    const add = (el: Element | null, token: AnchorToken): void => {
      if (el === null) return
      const list = want.get(el)
      if (list === undefined) want.set(el, [token])
      else if (!list.includes(token)) list.push(token)
    }
    /** 把「直接子元素满足 childSelector」的父元素统统打上 token。 */
    const tagParentsOf = (childSelector: string, token: AnchorToken): void => {
      for (const child of document.querySelectorAll(childSelector)) add(child.parentElement, token)
    }
    /** 元素是否有直接子元素满足 childSelector（**不用 `:has()`**，只走 children）。 */
    const hasDirectChild = (el: Element, childSelector: string): boolean => {
      for (const child of el.children) if (child.matches(childSelector)) return true
      return false
    }

    try {
      tagParentsOf('[data-composer-card]', ANCHOR.composerHost)

      for (const seat of document.querySelectorAll('[data-composer-seat]')) {
        const docked = seat.querySelector("[data-testid='todo-panel'], [data-goal-bar]") !== null
        if (docked && seat.querySelector('[data-queue-dock]') === null) add(seat, ANCHOR.seatDocked)
      }

      // ③ 命令面板卡片：背景长在祖元素上、role 在内层视口上。
      tagParentsOf("[role='listbox']", ANCHOR.listboxHost)

      // ④ 实色模态弹窗：`role='dialog'` 且直接子里没有 `img`（图片灯箱除外）。
      for (const dialog of document.querySelectorAll("[role='dialog']")) {
        if (!hasDirectChild(dialog, 'img')) add(dialog, ANCHOR.dialog)
      }

      // ⑤ 子代理血缘弹层的外层盒子：`body` 的直接子元素、且直接子里有 `[role='tree']`。
      for (const child of root.children) {
        if (hasDirectChild(child, "[role='tree']")) add(child, ANCHOR.treeHost)
      }

      // ⑥⑦⑧ 分组菜单三条腿（**判据各不相同，别合并**）：菜单本体 / 直接子里的滚动容器 / 含分组的直接子元素。
      // 前两条必须分开 —— 实测 codebuddy 菜单是 `groupsDirect: 0 / groupsAny: 2`，合并会让那个菜单静默失去质感。
      for (const menu of document.querySelectorAll("[role='menu']")) {
        if (menu.querySelector("[role='group']") !== null) add(menu, ANCHOR.menuGrouped)
        if (hasDirectChild(menu, "[role='group']")) add(menu, ANCHOR.menuSelfScroller)
        for (const child of menu.children) {
          if (child.querySelector("[role='group']") !== null) add(child, ANCHOR.menuChild)
        }
      }

      const scroller = document.querySelector(`[${CONTENT_ATTR}]`)
      if (scroller !== null) {
        // ⑧ 轮次导航 nav 的直接父元素（只认官方那两个 aria-label，避免误标别的 nav）。
        for (const nav of scroller.querySelectorAll('nav[aria-label]')) {
          if (NAV_ARIA_LABELS.includes(nav.getAttribute('aria-label') ?? '')) add(nav.parentElement, ANCHOR.turnNavHost)
        }
        // ⑨ 对话滚动体的直接父元素（宽度钳制就捕获在它身上）。
        if (scroller.parentElement?.parentElement?.hasAttribute('data-phase') === true) {
          add(scroller.parentElement, ANCHOR.scrollWrap)
        }
      }

      // ⑩ 头部操作区里、直接子元素是 ul 的那个容器。
      for (const ul of document.querySelectorAll(`[data-slot='${HEADER_ACTION_SLOT}'] ul`)) {
        add(ul.parentElement, ANCHOR.panelActionsUl)
      }

      // ⑪ 右栏面板已打开（状态标在 body 上）。
      if (document.querySelector(`[${RIGHT_PANEL_ATTR}][data-sidebar-right-open]`) !== null) {
        add(root, ANCHOR.rightPanelOpen)
      }
      for (const [el, tokens] of want) {
        const value = anchorValue(tokens)
        if (anchored.get(el) === value) continue
        el.setAttribute(ANCHOR_ATTR, value)
        anchored.set(el, value)
      }
      for (const [el] of [...anchored]) {
        if (want.has(el)) continue
        el.removeAttribute(ANCHOR_ATTR)
        anchored.delete(el)
      }
    } catch {
      // 运行期不冒泡：标不上只是少了质感，绝不打扰宿主。
    }
  }

  /** 上一轮写过的锚点（元素 → 已写入的值），用于「只在变化时写」。 */
  const anchored = new Map<Element, string>()

  /**
   * 摘掉两道相位门与四个几何变量（卸载 / 降级共用一处，避免漏摘）。
   * ⚠️ **必须声明在清理 effect 之前**：声明在 effect 之后的话，两者之间抛错时 cordis 跑清理会撞上 TDZ，
   * 抛 `ReferenceError` 把真正的失败原因盖掉（与 {@link paintPlain} 同一理由）。
   */
  const clearPhase = (): void => {
    const target = markerHost
    if (target === null) return
    for (const [attr, ...vars] of [
      [PHASE_BAND_ATTR, PHASE_BAND_VARIABLE, PHASE_BAND_TOP_VARIABLE],
      [PHASE_NOTCH_ATTR, PHASE_NOTCH_VARIABLE, PHASE_NOTCH_TOP_VARIABLE],
    ] as const) {
      target.removeAttribute(attr)
      for (const v of vars) target.style.removeProperty(v)
    }
  }

  /** 摘掉全部锚点属性（卸载用）：只摘 {@link anchored} 里记过的元素 —— 那是本插件写过的**全部**元素。 */
  const clearAnchors = (): void => {
    for (const [el] of anchored) el.removeAttribute(ANCHOR_ATTR)
    anchored.clear()
  }

  /**
   * 先武装清理，再创建资源。⚠️ **顺序不能反**：cordis 只跑**已注册**的 disposer —— 若抛错发生在创建资源与
   * 注册清理之间（`configForms.get`、首次 `repaint` 的 `overrideTokens` 校验、`locale.register` 重名…），
   * `<style>` 与背景层会**永久留在 DOM 里**，而 `PLAIN_ATTR` 从未置上 ⇒ 三张表的门全部 fail-open。
   * holder 保证：`ensureStyles` 抛错时清理是空操作、`ensureLayer` 抛错时已建的 style 仍收得掉。
   */
  const resources: { style?: HTMLStyleElement; layer?: HTMLDivElement } = {}
  ctx.effect(() => () => {
    resources.layer?.remove()
    resources.style?.remove()
    disposeTokens?.()
    // 门也要摘掉（否则卸载后玻璃与抬升面两张表的规则会继续被挡）；待启动态标记同理 —— 它是本插件加的。
    // 相位门与那四个几何变量写在 body 的**行内 style** 上，锚点写在任意元素上，摘不干净都会残留在用户 DOM 里。
    paintPlain(false)
    markerHost?.removeAttribute(WORKSTART_ATTR)
    clearPhase()
    clearAnchors()
  }, 'dsh-theme-tone: backdrop + token overrides')

  /**
   * ⚠️ **先把门关成「官方默认」，再注入样式表**：门属性是 `body:not([PLAIN_ATTR])` 的**唯一开关**、此前只在 `paintLayer` 里写，而样式表是无条件注入、首次 `repaint()` 又被 `shouldPaint()` 挡住（`status === 'loading'` 时直接 return）⇒ 从「注入」到「宿主回值」之间门属性不存在、带门规则当场命中，选了「官方默认」的用户会先看到玻璃与染色、等宿主回值再被抹掉。
   * 修法：初值取**最保守**的一侧（`plain = true` = 整层让路），宁可少画（官方外观），也绝不先画错。
   */
  paintPlain(true)
  resources.style = ensureStyles()
  resources.layer = ensureLayer()
  // 只留 layer 的局部别名（渲染计划要写它的 style）；style 仅由清理 effect 经 holder 回收，故不取名。
  const layer = resources.layer
  // 官方悬停光带修复：**不带色调门**，两档都生效。注册在 fork 的 ctx 上，卸载时随 fork 一起回收监听。
  followHandleGlow(ctx)
  // 设置读取面：命名空间 = 本插件在 profile 里的**条目 id**（= SETTINGS_NAMESPACE）。
  const scope: ConfigForm<ThemeToneSettings> = ctx.configForms.get<ThemeToneSettings>(SETTINGS_NAMESPACE)
  // 行 store 的**初值取实时主题轴**（不写死 dark）：浅色页面首帧就该渲染浅色轴卡片，否则用户可能在行还没
  // 同步时点到深色轴卡片 → 写入被 schema 拒（见 store.ts 的 ⚠️）。
  const rowStore = createThemeToneRowStore(ctx.theme.getTheme().active.colorScheme)

  let disposeTokens: (() => void) | undefined
  let boundRow: BoundActions<typeof rowStore> | undefined
  let lastTokenKey = ''
  let revision = 0

  /**
   * 进程内兜底值 —— 宿主侧设置**不可用**时（非 loopback 的 memory 模式，或命名空间未暴露）用它承载本次
   * 会话的选择。为什么必须有：`mode: 'memory'` 时 `writable` 恒为 false，`set()` 是**静默空操作**、
   * `subscribe` 也不会因宿主推送而触发 —— 不做兜底则用户点色调屏幕毫无反应、也无任何日志。
   */
  let localSettings: ThemeToneSettings = DEFAULT_SETTINGS
  let warnedNoPersistence = false

  /** 在途乐观值的记账器（见 `./pending.ts`）。⚠️ 按**字段**分别记账 —— 两轴各写各的字段，切轴选色不该顶掉另一轴在途的那一笔。 */
  const pendingTones = createPendingToneTracker()

  /**
   * 当前该用哪份设置。⚠️ **不能**写成 `value ?? DEFAULT_SETTINGS`：`status === 'loading'` 时 `value` 也是 `undefined` ⇒ 会在宿主回第一帧之前先按默认值上色、等真值到达再纠正（改过色调的用户每次冷加载都会看到一次可见跳变）；就绪前一律用进程内兜底值，并由 {@link shouldPaint} 决定先不上色。
   * **乐观更新**：{@link pendingTones} 里那一笔（用户刚点、还在跨宿主往返中）优先于宿主快照 —— 否则点下去要等一个 RTT 才变色；该笔由**它自己那次写入的结算**收回，见 {@link settlePending}。
   */
  const readSettings = (): ThemeToneSettings => {
    const snapshot = scope.getSnapshot()
    const base = snapshot.status === 'ready' && snapshot.value !== undefined ? snapshot.value : localSettings
    return pendingTones.over(base)
  }

  /**
   * 一笔写入**结算**时收掉它自己的乐观值。⚠️ **必须按「是哪一笔」判，不能按「快照 revision 前进过」判**：一次 `settings/mutate` 要 1.5–4s，期间用户会再点第二张卡，先发那笔的结算同样让 revision 前进 ⇒ **后发那笔**的乐观值被误当作废（画面在两张卡之间来回跳）。
   * 也不能按「值与乐观值是否相等」判：写入刚发出时快照还是旧值（判不等会当场抹掉乐观值），宿主拒绝时值同样不等（判相等则 pending 永远留着）—— 宿主接受与拒绝都会 resolve，两条路都由那次调用自己收。
   */
  const settlePending = (write: PendingToneWrite): void => {
    if (!pendingTones.settle(write)) return
    // 收掉之后宿主快照才是权威值 —— 立刻重绘一次，让被拒的那一笔当场纠正回来（接受的那笔重绘是幂等的）。
    repaint()
  }

  /** 现在能不能上色：`loading`（宿主还没回第一帧，没有任何权威值）→ 不上色；`unavailable` → 用进程内兜底值上色（选择仍生效，只是不持久化）。 */
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
   * ⚠️ `lastTokenKey` **必须在成功后**才前进：先置 key 再调用的话，万一 `overrideTokens` 抛错，
   * 下次同样的设置会被判为「没变」而**永不重试**，色调就永久停在旧值上。
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
   * 写背景层与行状态：依赖当前解析出的明暗轴。⚠️ **这里也要过 `shouldPaint()` 那道门** —— `theme/change`
   * 是**另一条**直达本函数的路径、**不经过 `repaint()`**，而官方 `theme/change` 由 ui-theme 自己的 settings
   * scope 驱动，与本插件 settings 的就绪**没有先后保证**。不过门就会用进程内兜底值算出 `hidden = false`
   * → `paintPlain(false)` **把门打开**，让实际选了「官方默认」的用户照样吃到玻璃与染色。
   */
  const paintLayer = (snapshot: ThemeSnapshot): void => {
    // ⚠️ **行同步必须排在 `shouldPaint()` 那道门之前**：门是给**上色**用的（未就绪不上色，避免闪变），
    // 而**行渲染哪一轴的卡片**纯由当前主题决定，与设置是否就绪无关 —— 排在门后会让浅色页面显示深色轴
    // 卡片，此时点卡片会把浅色 id 写进深色字段（被 schema 拒）。
    syncRow(snapshot.active.colorScheme)
    if (!shouldPaint()) return
    const settings = readSettings()
    const scheme: ColorScheme = snapshot.active.colorScheme
    const plan = backdropPlan(scheme, settings)
    layer.hidden = plan.hidden
    // 「这一轴选了官方默认」= 没有染色 = 整层隐藏；把这个事实挂到 body 上，让玻璃与抬升面两张表整表让路。
    paintPlain(plan.hidden)
    if (!plan.hidden) {
      layer.style.setProperty(TOP_VARIABLE, plan.top)
      layer.style.setProperty(BOTTOM_VARIABLE, plan.bottom)
      // 左侧金晕是可选层；纯色色调不给就移除变量，让样式表里的 transparent 兜底生效。
      if (plan.left === '') layer.style.removeProperty(LEFT_VARIABLE)
      else layer.style.setProperty(LEFT_VARIABLE, plan.left)
    }
    layer.setAttribute(GRAIN_ATTR, plan.grain ? 'on' : 'off')
  }

  /**
   * 把「当前明暗轴 + 该轴选中的色调」推给设置行。⚠️ **不走上色那道门**（理由见 {@link paintLayer}）：
   * 行渲染哪一轴只取决于主题，设置未就绪时用进程内兜底值算选中态即可。
   */
  const syncRow = (scheme: ColorScheme): void => {
    revision += 1
    boundRow?.sync(scheme, toneIdOf(readSettings(), scheme), revision)
  }

  /** 设置变更：token、层、行全都要重算。 */
  const repaint = (): void => {
    // ⚠️ 乐观值**不在这里收**：写设置是跨宿主的一趟往返（真机 1.5–4s），期间 `subscribe` 会因别的推进
    // （另一笔写入的结算、它触发的 describe 回读）多次触发本函数 —— 在这里按「revision 变了」收，就会把
    // **更新的那一笔**乐观值误当作废，画面来回跳。改为由**那一笔写入自己的结算**收，见 settlePending。
    //
    // ⚠️ 行同步**不设门**（理由见 `paintLayer` 的 ⚠️）：它只依赖当前主题，必须在 `shouldPaint()` 返回之前
    // 就更新 —— 否则设置未就绪时行不刷新，浅色页面会显示深色轴卡片，点下去就把浅色 id 写进深色字段。
    syncRow(ctx.theme.getTheme().active.colorScheme)
    // 宿主还没回第一帧（`loading`）就不上色 —— 此刻没有权威值，按默认画一遍再纠正就是一次可避免的闪变。
    if (!shouldPaint()) return
    warnIfNotPersistable()
    const settings = readSettings()
    paintTokens(settings)
    paintLayer(ctx.theme.getTheme())
  }

  /**
   * 「未选工作区」待启动态的观测 —— 给 body 打 {@link WORKSTART_ATTR}，让玻璃把边界让回官方。判据只能是那条**虚线伪元素自己的签名**（见 `../workstart.ts`）：官方那个状态只体现为一个 **CSS-module 哈希类名**（不能写，仓库红线），它同时写入的语义属性又全被本插件与官方其它控件污染。
   * 代价有界：只读 `[data-composer-card]` 一个元素的两个计算值，`getComputedStyle` 强制样式解析 ⇒ **同帧合并**、只在 DOM 变动时跑；observer 挂在 body 上，随 `ctx.effect` 断开。
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
   * 同一帧内合并多次 DOM 变动，避免连续写属性触发无谓重排。⚠️ rAF 句柄**必须存下来并在卸载时取消**：
   * `ctx.effect` 只管它收集到的 disposer，不会替你取消已入队的帧 —— 否则「变动入队 → 卸载 → 帧才到」会把
   * 刚摘掉的 {@link WORKSTART_ATTR} 重新写回 body，属性就永久残留了。
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
      // 锚点与相位都在同帧合并后维护：连续 DOM 变动只算一次。
      maintainAnchors()
      // 相位走**收敛式**重测：布局若还在动（右栏开合是动画）就继续测，直到稳定。
      startPhaseSettle()
    })
  }

  /**
   * 收敛式重测：只要上一次测出的相位**还在变**，就继续在后续帧里重测。相位量必须在**布局稳定后**取，而右栏
   * 开合是**动画**改 `grid-template-columns` 内联样式 —— 既不改 class（MutationObserver 看不到）、也不触发
   * `window.resize`（视口没变），`ResizeObserver` 也可能落在动画中途那一帧 ⇒ 采到中间值后再无事件，变量
   * **永久停在错的相位**。自终止轮询：每次测量后比较四个量，**连续两次相同即停**（最多 {@link PHASE_SETTLE_FRAMES} 帧）。
   */
  let settleFrames = 0
  let settlePrev = ''
  /**
   * 收敛循环**自己**的帧句柄 —— ⚠️ **不能与 {@link scheduleProbe} 的 `probeFrame` 共用**：`startPhaseSettle`
   * 一进来就要取消上一个待跑的帧，若取消的是 `scheduleProbe` 排的那一帧，`probeScheduled` 就永远停在 `true`，
   * 之后所有探测都被「同帧合并」静默吞掉 —— 观测彻底停摆。
   */
  let settleFrame = 0
  /**
   * 起一轮收敛重测（可被任何触发源调用）。⚠️ 用 `requestAnimationFrame` **自己排队**，不借 `scheduleProbe` ——
   * 后者有「同帧只跑一次」的合并语义，而收敛需要**连续多帧**各测一次；共用会互相压制。
   */
  const startPhaseSettle = (): void => {
    settleFrames = 0
    settlePrev = ''
    if (settleFrame !== 0) cancelAnimationFrame(settleFrame)
    const step = (): void => {
      settleFrame = 0
      const signature = publishPhase()
      if (signature === null) { settleFrames = 0; settlePrev = ''; return }
      // 连续两次一致 ⇒ 布局已稳定，收敛结束。
      if (signature === settlePrev) { settleFrames = 0; settlePrev = ''; return }
      settlePrev = signature
      if (settleFrames >= PHASE_SETTLE_FRAMES) { settleFrames = 0; settlePrev = ''; return }
      settleFrames += 1
      settleFrame = requestAnimationFrame(step)
    }
    settleFrame = requestAnimationFrame(step)
  }

  /**
   * 实测两个相载体的定位区原点，发布成 CSS 变量 + **两道**门属性。必须实测：相位要的是「定位区左上角在视口里的坐标」，右栏一开左栏偏移与右栏宽同时变、官方又没把右栏宽发布成变量 ⇒ 纯 CSS 推不出（详见 `../phase.ts`）。
   * 两个载体都走 {@link pseudoOrigin}（不依赖任何实测不变量），可见性各自独立 ⇒ **各测各的、各挂各的门**（合成一道门会让一个载体暂不可用连带拖回慢档）；取不到元素或几何不合理（见 {@link solvePhaseOrigin}）就**摘掉那道门** ⇒ 该规则落回 `fixed` 档（慢但一定正确）。
   */
  const publishPhase = (): string | null => {
    const target = markerHost
    if (target === null) return null
    /**
     * 本次实测到的四个量拼成的签名。用**实测几何**（而不是写入的 CSS 值）拼签名：只有几何真的不动了才算收敛。
     */
    const parts: string[] = []
    /** 摘掉一道门连同它的几何变量（绝不留下「门开着但变量是旧的」这种组合）。 */
    const clearOne = (attr: string, ...vars: readonly string[]): void => {
      target.removeAttribute(attr)
      for (const v of vars) target.style.removeProperty(v)
    }
    /** 一个载体的通用处理：求伪元素原点 → 解算 → 写变量并挂门（或摘门）。 */
    const applyOne = (host: Element | null, attr: string, leftVar: string, topVar: string): void => {
      if (host === null) { clearOne(attr, leftVar, topVar); parts.push(`${attr}:none`); return }
      const r = host.getBoundingClientRect()
      const s = getComputedStyle(host)
      const after = getComputedStyle(host, '::after')
      const borderLeft = Number.parseFloat(s.borderLeftWidth) || 0
      const borderTop = Number.parseFloat(s.borderTopWidth) || 0
      const pseudoLeft = Number.parseFloat(after.left) || 0
      const pseudoTop = Number.parseFloat(after.top) || 0
      // 签名用**原始几何输入**：它变了说明布局还在动 ⇒ 需要再测一帧。
      parts.push(`${attr}:${r.left},${r.top},${borderLeft},${borderTop},${pseudoLeft},${pseudoTop}`)
      const origin = pseudoOrigin(r.left, r.top, borderLeft, borderTop, pseudoLeft, pseudoTop)
      const solved = solvePhaseOrigin(origin, { width: window.innerWidth, height: window.innerHeight })
      if (solved === null) { clearOne(attr, leftVar, topVar); return }
      target.style.setProperty(leftVar, solved.left)
      target.style.setProperty(topVar, solved.top)
      // 门**最后**挂：两个变量都已就位，消费侧才是「开即有效」。
      target.setAttribute(attr, '')
    }

    try {
      /**
       * ① 座底不透带：宿主 = 座位自身（sticky 定位元素，正是 ::after 的包含块）。
       * ⚠️ 座位只在 `[data-phase='active']` 下才是 sticky；hero 下取不到就摘门。
       */
      applyOne(document.querySelector('[data-composer-seat]'),
        PHASE_BAND_ATTR, PHASE_BAND_VARIABLE, PHASE_BAND_TOP_VARIABLE)

      /**
       * ② 卡片缺口：宿主 = **卡片的父元素**（伪元素挂在它上面，且它比卡片宽一个大内边距）——
       * 故必须按伪元素自身算，不能拿卡片或宿主顶替（见 {@link pseudoOrigin}）。
       */
      applyOne(document.querySelector('[data-composer-card]')?.parentElement ?? null,
        PHASE_NOTCH_ATTR, PHASE_NOTCH_VARIABLE, PHASE_NOTCH_TOP_VARIABLE)
    } catch {
      // 运行期不冒泡：测量失败只是退回慢档，绝不打扰宿主。
      clearOne(PHASE_BAND_ATTR, PHASE_BAND_VARIABLE, PHASE_BAND_TOP_VARIABLE)
      clearOne(PHASE_NOTCH_ATTR, PHASE_NOTCH_VARIABLE, PHASE_NOTCH_TOP_VARIABLE)
      return null
    }
    return parts.join('|')
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

  /**
   * 相位几何：初跑一次 + 监听 `resize`。`resize` **不可省** —— 窗口宽度变化必然改变相位，而官方改的是内联
   * `gridTemplateColumns`（`style` 属性，上面的 observer 只过滤 `class`，观察不到）。
   * 右栏开合 / 左栏折叠会改 class，由上面的 MutationObserver 覆盖；即便漏掉一次，门在测到之前不挂，
   * 最坏情况只是暂时用慢档（正确）。
   */
  publishPhase()
  ctx.effect(() => {
    const onResize = (): void => { startPhaseSettle() }
    window.addEventListener('resize', onResize, { passive: true })

    /**
     * ⚠️ **`ResizeObserver` 不可省**：右栏开合是**动画**改 `grid-template-columns` 内联样式 —— 既不改 class
     * （MutationObserver 只看 class），也不触发 `window.resize`（视口没变）。观察两个**载体**（座位与缺口
     * 宿主）—— 它们的尺寸正是随左右栏开合而变的量；配合 {@link startPhaseSettle} 的收敛重测，保证动画停下时
     * 采到**稳定值**。元素不存在时不装（初跑与后续 MutationObserver 会处理它们的出现）。
     */
    const targets = [
      document.querySelector('[data-composer-seat]'),
      document.querySelector('[data-composer-card]')?.parentElement ?? null,
    ].filter((el): el is Element => el !== null)
    const resizeObserver = targets.length === 0
      ? null
      : new ResizeObserver(() => { startPhaseSettle() })
    for (const el of targets) resizeObserver?.observe(el)

    return () => {
      window.removeEventListener('resize', onResize)
      resizeObserver?.disconnect()
      // 取消尚未触发的收敛帧：否则回调会在清理**之后**把刚摘掉的变量与门重新写回 body（同 scheduleProbe 那条 ⚠️）。
      if (settleFrame !== 0) cancelAnimationFrame(settleFrame)
      settleFrame = 0
      settleFrames = 0
      settlePrev = ''
      // 卸载时把两道门与四个变量一起摘干净（本插件加的属性不留残余）。
      clearPhase()
    }
  }, 'dsh-theme-tone: phase geometry')

  // 明暗轴切换：token 层已按模式给全、presenter 自己取用，故只需重算层与行。
  // `ctx.on` 的监听器以 effect 记在当前 fiber 上，卸载自动摘除，无需再包一层。
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
      // 注册后立刻补一次同步，避免丢掉「注册」与「首次事件」之间的变化（仍走 repaint 那道未就绪不上色的门）。
      repaint()
      return {
        setTone: (id: ToneId, scheme: ColorScheme) => {
          /**
           * ⚠️ **轴由行传入，不在这里重新查询 `ctx.theme.getTheme()`**：行渲染哪一轴取决于 store 里的
           * `colorScheme`（由上一次 `paintLayer` 同步），写入时重新查询两者会在切换模式的时间窗内错开 ——
           * 于是把**浅色轴的 id 写进深色轴字段**，而两轴合法集合**不重叠**（浅 official/blue/sakura/green、
           * 深 official/violet/crimson/forest），宿主 schema 直接拒绝 ⇒ 选择不生效、观感是「选完很快回到官方」。
           */
          const field = toneFieldFor(scheme)
          const snapshot = scope.getSnapshot()
          /**
           * ⚠️ **先本地落值 + 立刻重绘，再发写入**：`scope.set()` 是跨宿主的一趟往返，回来之前 `readSettings()` 读到的仍是旧值 ⇒ 画面要等一个 RTT 才变（色卡双击率高，这一等很显眼）；把选择记成在途乐观值并立刻重绘，该笔由**它自己那次写入的结算**收回（见 {@link settlePending}）。
           * 宿主不可写（memory 模式 / 命名空间未暴露）时这是**唯一**的落值途径，故同一条路同时承担「不可持久化时也要在本次会话内生效」—— 那种情形没有写入可结算，由 `localSettings` 兜底。
           */
          localSettings = { ...localSettings, [field]: id }
          const pending = pendingTones.begin(field, id)
          repaint()
          if (snapshot.status !== 'ready' || !snapshot.writable) {
            warnIfNotPersistable()
            return
          }
          /**
           * 结算这一笔：⚠️ **必须挂 `.then` 收自己那一笔，不能靠 `repaint` 里的 revision 判定**
           * （见 {@link settlePending}）。宿主接受与拒绝都 resolve（拒绝走 recovery 读），只有传输失败才
           * reject —— 那种情形也从账上收掉，否则乐观值永久留着、画面停在一个刷新就消失的颜色上。
           */
          void scope.set(field, id).then(
            () => { settlePending(pending) },
            () => { settlePending(pending) },
          )
        },
      }
    },
  }, ThemeToneRow as unknown as (props: object) => ReactNode))
}
