/**
 * 顶栏后台任务弹框的**对齐方向**修正（与色调无关）。
 *
 * 官方 `.menu { position: absolute; left: 0; width: 500px }` 锚在**只有 ~150px 宽**的触发器容器上
 * （`JobListAction.module.css` 的 `.root` / `.menu`）⇒ 弹框**向右**伸 500px，伸出会话列的部分
 * 被列自身的 `overflow: hidden` 整块裁掉；右栏打开时列变窄，尤其明显。
 * 改成**右对齐**（右缘贴触发器右缘）⇒ 弹框**向左**伸，整块落在列内。
 *
 * ⚠️ 只动对齐方向：**不动包含块、不动 z-index、不动 overflow**。
 * 「换包含块逃裁切」与「抬顶栏过层序」都试过且都不成立（`docs/spec/12` 有受控实验与失败记录）。
 */

import { ANCHOR, anchorSelector } from './anchors.js'

/** 顶栏动作槽位里那个弹出列表的宿主选择器（官方公开槽位属性，非 hashed 类名）——
 *  官方 `JobListAction` 渲染进该槽位，那个没有 role 的 `<ul>` 就长在它里面。 */
export const HEADER_ACTION_SCOPE = "body [data-slot='conversation.session.header.actions']"

/** 官方槽位属性名（`HEADER_ACTION_SCOPE` 的单一真值来源）。 */
export const HEADER_ACTION_SLOT = 'conversation.session.header.actions'

/** 「右栏面板已打开」的祖先门，走**锚点属性**而非 `:has()`。属性由 client half 维护。 */
export const RIGHT_PANEL_OPEN_GATE = `body${anchorSelector(ANCHOR.rightPanelOpen)}`

/** 弹框改右对齐的样式表文本。 */
export function buildPopoverCss(): string {
  /* 门在前，故槽位那条去掉自带的 body 前缀（否则拼出 body… body…，永不命中）。 */
  const scope = `${RIGHT_PANEL_OPEN_GATE} ${HEADER_ACTION_SCOPE.replace(/^body\s+/u, '')}`
  return `/* ===== dsh-theme-tone 顶栏后台任务弹框：对齐方向改右（官方左对齐 ⇒ 向右伸出列被裁）===== */
${scope} ul {
  /* ⚠️ 必须 !important：官方在**样式表与内联两处**都写了 left（样式表 left: 0；
     内联是 fit() 按**视口**算的收边值 —— 它不知道列被右栏压窄了，所以在这里也没用）。 */
  left: auto !important;
  /* 右缘贴触发器右缘 ⇒ 弹框向左伸，整块留在会话列内（宽度仍是官方的 500px 与其 max-width）。 */
  right: 0;
}
`
}