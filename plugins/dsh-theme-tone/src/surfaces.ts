/**
 * 官方**写死了面与字**的少数浮层：左边栏 Workspace 行 hover 卡（HoverCard 的 compact/copyable 变体）。
 * 官方给它固定的深底 #2C2C2E 与白系字色（两轴同值），不跟随主题；这里把面换成官方自己的抬升面 token、
 * 把字换成官方 label token —— 面用 `--dsw-alias-bg-layer-3`（已被本插件色调覆盖），字保持官方层次
 * （标题最亮 → 路径/时间次之 → 状态最暗）。
 *
 * 锚点：HoverCard 用 createPortal 挂到 body，卡根是 `body > [role="button"][aria-label]`；
 * 字色只能按官方 CSS-module 类名的**稳定后缀**命中（`[class*='_hoverTitle']` 等）—— 已登记为
 * docs/private-seams.md 的静默失效风险。**不带「官方默认」门**：这是修官方写死的牌面（与色调偏好无关）。
 */
const CARD = "body > [role='button'][aria-label]"
const TITLE = "body > [role='button'][aria-label] [class*='_hoverTitle']"
const SECONDARY = "body > [role='button'][aria-label] [class*='_hoverPath'],\nbody > [role='button'][aria-label] [class*='_hoverTime']"
const TERTIARY = "body > [role='button'][aria-label] [class*='_hoverStatus']"
const COPIED = "body > [role='button'][aria-label] [class*='_copied']"

export function buildSurfaceCss(): string {
  return `/* 面包：官方深底 → 主题抬升面 */
${CARD} {
  --dsw-hovercard-bg: var(--dsw-alias-bg-layer-3);
}
/* 字色：官方写死的白系 → 官方 label token（层次不变） */
${TITLE},
${COPIED} {
  color: var(--dsw-alias-label-primary);
}
${SECONDARY} {
  color: var(--dsw-alias-label-secondary);
}
${TERTIARY} {
  color: var(--dsw-alias-label-tertiary);
}
`
}
