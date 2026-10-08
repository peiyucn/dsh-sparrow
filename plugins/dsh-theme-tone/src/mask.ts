/** 弹窗遮罩的模糊 —— 恢复官方 0.1.5 观感（rc.2 是有意去掉的，证据见 docs/upstream/0.1.7-rc.2-mask-blur.md）。
 * 与 glass.ts 的两条纪律冲突（两档都生效、任何相位都可能出现遮罩），故独立成模块。
 * ⚠️ 只在**遮罩元素自身**重设变量：全局改会波及 `DesktopOnboarding` 的 `.blurred`（`filter:` 滤自身内容）；
 * 刻意**不带**官方默认门（属刻意动官方默认外观，见 `docs/private-seams.md`）；
 * `[class*='_mask']` 是哈希类名后缀依赖，官方改名即**静默失效**，测试逐条钉住产物。 */

/** 恢复弹窗遮罩模糊所用的值 = 官方 `0.1.7-rc.1` 及更早的 `--dsw-mask-blur` 取值（单独命名便于一处改、便于测试断言）。 */
export const MASK_BLUR_RESTORED = 'blur(2px)'

/**
 * 遮罩元素的选择器 —— 覆盖官方哈希类名 `*_mask` **与**自家插件曾经的 `role="presentation"` + 内联 `backdrop-filter`。
 * ⚠️ 两条都限定「自己声明了 `backdrop-filter: var(--dsw-mask-blur)`」才安全；后一条当前不命中（自家插件已改用官方 `Modal`），保留是**防御性**的。
 */
export const MASK_SELECTOR = "[class*='_mask'], [role='presentation'][style*='--dsw-mask-blur']"

/** 弹窗遮罩模糊的样式表文本。刻意**不带** `PLAIN_ATTR` 门（两档都恢复）；只设一个 CSS 变量、不依赖插件 token，故无「变量缺失」风险。 */
export function buildMaskCss(): string {
  return `/* dsh-theme-tone 弹窗遮罩模糊：恢复官方 0.1.5 观感；有意不带官方默认门（两档都恢复），只在遮罩元素自身重设变量。 */
${MASK_SELECTOR} {
  --dsw-mask-blur: ${MASK_BLUR_RESTORED};
}
`
}
