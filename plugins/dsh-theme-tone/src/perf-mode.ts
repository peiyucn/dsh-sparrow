/**
 * **嵌入式渲染环境的性能模式判定**（纯逻辑，无宿主依赖，便于单测）。
 *
 * 为什么需要：VS Code 内置浏览器（Simple Browser）把页面嵌在 webview 的 iframe 里，合成路径与独立浏览器不同；
 * 本插件的重特效（全屏渐变 + 颗粒的混合背景层、玻璃的 `backdrop-filter`、抬升面的颗粒/光）在流式重绘下成本
 * 明显更高。owner 实测：同一台机器、同一个会话，在 VS Code 内置浏览器里切到「官方默认」（本插件整表让路）
 * 立刻变顺 —— 即这些特效就是该环境下的掉帧来源。
 *
 * 取舍：嵌入环境默认走**性能模式** —— 保留色调颜色（token 叠加），关掉重特效。视觉上等于「官方默认 + 色调」。
 * 独立浏览器（顶层窗口）不受影响，仍是完整效果。
 *
 * 判定只用 `self !== top`：跨源 iframe 的身份比较是允许的（不抛错），且不嗅探 UA / 宿主机型 —— 任何把页面嵌进
 * iframe / webview 的宿主都属于同一类受限合成环境，按同一档降级。
 */

/** 判定当前窗口是否被嵌入（iframe / webview）。 */
export function isEmbeddedWindow(win: { readonly self: unknown; readonly top: unknown }): boolean {
  return win.self !== win.top
}
