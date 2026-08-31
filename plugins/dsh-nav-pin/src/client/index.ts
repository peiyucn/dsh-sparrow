/**
 * dsh-nav-pin client half：注入一条样式表，让官方「轮次导航」在窄对话列不消失：
 * 官方 900px 断点提到 700px；≤700px 时默认隐身，hover 右侧轨道（或键盘 focus 进入）浮现为浮层。
 * 无 slots / 无 locale / 无按钮 / 无持久化状态；样式随插件卸载移除，恢复官方行为。
 * 不 import Node 模块。
 */

import type { Context } from '@deepseek-ai/cordis'
import { buildNavPinCss } from '../nav-pin.js'

/** 客户端不依赖任何 cordis 服务（纯 DOM 样式注入）。 */
export const inject: string[] = []

/** 注入样式表（按 data 属性去重，HMR / 重载不叠加）；返回 style 元素供卸载清理。 */
function ensureNavPinStyles(): HTMLStyleElement {
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-nav-pin]')
  if (existing !== null) return existing
  const style = document.createElement('style')
  style.dataset.dshNavPin = ''
  style.textContent = buildNavPinCss()
  document.head.appendChild(style)
  return style
}

/**
 * client half 入口：注入样式，卸载时移除（回到官方 900px 行为）。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: Context): void {
  const style = ensureNavPinStyles()
  ctx.effect(() => () => { style.remove() }, 'dsh-nav-pin: styles')
}
