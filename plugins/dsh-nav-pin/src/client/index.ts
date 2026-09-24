/**
 * dsh-nav-pin client half：注入一条样式表，让官方「轮次导航」在窄对话列不消失：
 * 官方 900px 断点提到 700px；≤700px 时默认隐身，hover 右侧轨道（或键盘 focus 进入）浮现为浮层。
 * 另外补一个指针跟随，修官方宽度拖拽条**悬停光带位置不对**的 bug（见 `src/handle-glow.ts`）。
 * 样式与监听都随插件卸载移除，恢复官方行为。
 * 不 import Node 模块。
 */

import type { Context } from '@deepseek-ai/cordis'
import { buildNavPinCss, REQUIRED_CSS_FEATURES } from '../nav-pin.js'
import { HANDLE_SELECTOR, applyGlow } from '../handle-glow.js'
import { cssSupports, warnMissingCapabilities } from '../compat.js'
import { name } from '../host.js'

/** 客户端不依赖任何 cordis 服务（DOM 样式注入 + 一个指针监听）。 */
export const inject: string[] = []

/** 注入样式表（按 data 属性去重，HMR / 重载不叠加）；返回 style 元素供卸载清理。 */
function ensureNavPinStyles(): HTMLStyleElement {
  const css = buildNavPinCss()
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-nav-pin]')
  if (existing !== null) {
    // 同名去重命中时校验内容：HMR 升级后旧 style 可能残留过期规则，刷新之。
    if (existing.textContent !== css) existing.textContent = css
    return existing
  }
  const style = document.createElement('style')
  style.dataset.dshNavPin = ''
  style.textContent = css
  document.head.appendChild(style)
  return style
}

/**
 * 让官方宽度拖拽条的**悬停光带**跟随指针（修官方 bug，理由见 `src/handle-glow.ts` 模块头）。
 *
 * 接线只负责取事件与元素，判定全在纯函数里。用**一个** `pointermove`（passive，不
 * `preventDefault`），且只在指针真的落在拖拽条上时才干活；用 `requestAnimationFrame`
 * **合并同帧多次移动** —— `getBoundingClientRect` 会强制布局，不合并的话高频移动会把
 * 主线程拖满（本仓库栽过一次：`getComputedStyle` 未合并导致卡顿）。
 *
 * ⚠️ **不给它加能力门**：`pointermove` / `requestAnimationFrame` 缺失时监听自然收不到事件，
 * 效果只是「回到官方现状」（光带固定居中），属可接受降级；而**加门会把整张样式表一起停掉**
 * —— 那才是真倒退（轮次导航会在窄列消失）。故这里刻意只降级、不停用。
 *
 * ⚠️ **失败不冒泡**（根 AGENTS《运行期不冒泡》）：取几何那一步包了 try/catch，
 * 任一环节异常都只是这一步不生效，绝不抛进宿主管线。
 * @param ctx - 浏览器侧 Cordis 上下文（用于注册卸载清理）。
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
    // 不是拖拽条就立刻返回 —— 页面里绝大多数移动都走这条路径。
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
  }, 'dsh-nav-pin: handle glow follows pointer')
}

/**
 * client half 入口：注入样式 + 指针跟随，卸载时全部移除（回到官方行为）。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  // 宿主兼容自检（根 AGENTS《插件与宿主兼容》）：样式依赖的浏览器特性缺失时注入的是无效
  // 规则 —— 按统一能力门**惰性停用**（告警 + 直接返回），而不是假装在工作。
  //
  // ⚠️ 客户端这半边**不能抛错**（故用 `warnMissingCapabilities` 而不是抛错版能力门）：
  // 客户端 boot 审计把任何非 active 的 entry 当致命失败，`apply` 抛错 = 宿主整页停在
  // "Failed to load plugins"（dsh 0.1.7-alpha.1：packages/client/web/src/boot-client.ts:63-82）。
  if (!warnMissingCapabilities(ctx, name, REQUIRED_CSS_FEATURES.map(feature => ({
    name: feature.name,
    ok: cssSupports(feature.probe),
  })))) return
  const style = ensureNavPinStyles()
  ctx.effect(() => () => { style.remove() }, 'dsh-nav-pin: styles')
  followHandleGlow(ctx)
}
