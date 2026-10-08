/** 桌面端（Windows）窗口标题栏 overlay：把官方探针元素的底色改成 `transparent`，让本插件的装饰层透上来。
 * 官方 preload 探针读 `--dsw-specific-sidebar-fill` + `--dsw-alias-label-primary` 送出不透明纯色（WCO 画在网页之上）
 * ⇒ 标题栏平色、紧邻的侧栏有质感 = 那条缝；官方 `.frame::before` 读同一个 token，故「不透明 → 透明」在颜色上恒等。
 * ⚠️ 刻意**不带**门（官方观察者不 observe 本插件的门属性，带门则门翻开时不一定重发 ⇒ 静默失效）；值写字面量、不用 `var()`。
 * ⚠️ 只改**探针那一个元素**（全局置透明会连侧栏底色一起抹掉）。私有 seam：要求两个 token 同现且限定 `body` 直接子 `span`，官方改写即不命中（良性降级）。
 */

/** 官方 preload 探针 inline style 里写着的背景 token（overlay 底色）。 */
export const CAPTION_PROBE_TOKEN = '--dsw-specific-sidebar-fill'

/** 官方 preload 探针 inline style 里写着的字色 token（与上者同现，仅用于收窄选择器）。 */
export const CAPTION_PROBE_SYMBOL_TOKEN = '--dsw-alias-label-primary'

/** 桌面端标题栏 overlay 的样式表文本。 */
export function buildCaptionCss(): string {
  return `/* dsh-theme-tone 桌面端标题栏 overlay：把探针那个 token 设成 transparent，让本插件铺满视口的装饰层透上来（官方 .frame::before 读同一个 token，故颜色恒等）；刻意不带官方默认门，值必须是字面量。 */
body > span[style*='${CAPTION_PROBE_TOKEN}'][style*='${CAPTION_PROBE_SYMBOL_TOKEN}'] {
  ${CAPTION_PROBE_TOKEN}: transparent;
}`
}
