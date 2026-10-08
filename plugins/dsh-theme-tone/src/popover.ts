/**
 * 顶栏弹出层的**列内夹取**（dsh-theme-tone · 布局修复，与色调无关）：弹框 `position: absolute; width: 500px` 锚在触发器上会被 `overflow: hidden` 的会话列（`[data-phase='active']`）裁掉，且它的 `z-index: 100` 关在顶栏（本插件抬成 `absolute` + 82）的层叠上下文里、对外只算 82。
 * 修法：把**包含块**从触发器换成顶栏 / 会话根（两者内边距盒都是「会话列」，右缘与顶边相同），只挪弹框自己的定位。
 * ⚠️ 不许调弹框 z-index（出不了那层）、不许抬顶栏、也不许动会话列 overflow。
 */

import { HEADER_HEIGHT_PX } from './glass.js'
import { PLAIN_ATTR } from './constants.js'
import { ANCHOR, anchorSelector } from './anchors.js'

/** 顶栏动作槽位里那个弹出列表的宿主选择器（官方公开槽位属性，非 hashed 类名）——
 *  官方 `JobListAction` 渲染进该槽位，那个没有 role 的 `<ul>` 就长在它里面。 */
export const HEADER_ACTION_SCOPE = "body [data-slot='conversation.session.header.actions']"

/** 官方槽位属性名（`HEADER_ACTION_SCOPE` 的单一真值来源）。 */
export const HEADER_ACTION_SLOT = 'conversation.session.header.actions'

/** 「右栏面板已打开」的祖先门，走**锚点属性**而非 `:has()`（原写法锚在 `body` 上，是 `:has()`
 *  里最贵的一类，实测见 docs/spec/11）；属性由 client half 的 `ANCHOR.rightPanelOpen` 维护。 */
export const RIGHT_PANEL_OPEN_GATE = `body${anchorSelector(ANCHOR.rightPanelOpen)}`

/** 弹出层列内夹取的样式表文本。⚠️ 刻意**不带** `PLAIN_ATTR` 门 —— 这是「修官方无意的 bug」
 *  那一类，两个档都修（全插件第四条同类规则；`PLAIN_ATTR` 仍从 constants 引入，供守卫断言用）。 */
export function buildPopoverCss(): string {
  /* 门在前，故槽位那条去掉自带的 body 前缀（否则拼出 body… body…，永不命中）。
     ⚠️ 槽位选择器**只此一处**由 HEADER_ACTION_SCOPE 提供：另写一份同值字面量会让常量只剩测试在用。 */
  const scope = `${RIGHT_PANEL_OPEN_GATE} ${HEADER_ACTION_SCOPE.replace(/^body\s+/u, '')}`
  return `/* ===== dsh-theme-tone 顶栏弹出层的列内夹取（不带 ${PLAIN_ATTR} 门：修的是官方无意的裁切 / 层序缺陷，两档都修）===== */

/* ① 把弹框的**包含块**从触发器换成顶栏 / 会话根（两者内边距盒都是「会话列」，右缘与顶边相同）：
   触发器 wrapper 改 static 即可；判据走**锚点属性**（官方那个类名是 CSS-module 哈希，禁止依赖）。 */
${scope} ${anchorSelector(ANCHOR.panelActionsUl)} {
  position: static;
}
/* ② 夹进列内：
   * left: 0 —— ⚠️ 必须 !important：官方 fit() 在窄窗口写**负数内联 left**，内联优先于选择器。
   * top: HEADER_HEIGHT_PX —— 官方原值 calc(100% + 5px) 的 100% 是**包含块**高度，换了块会乱跑。
   * max-width: 100% —— 列比 500px 窄时跟着列收窄。 */
${scope} ul {
  left: 0 !important;
  top: ${HEADER_HEIGHT_PX}px;
  max-width: 100%;
}
`
}
