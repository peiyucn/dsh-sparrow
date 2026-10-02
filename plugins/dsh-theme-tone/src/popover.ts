/**
 * 顶栏弹出层的**列内夹取**（dsh-theme-tone · 布局修复，与色调无关）。
 *
 * ## 修的是什么
 *
 * owner 2026-10-02：「后台任务弹出框被右边栏遮挡的问题还是没有修好」，并附了截图 ——
 * 顶栏那枚「N 个后台任务运行中」弹出的列表，右半边整块消失、左半边被右栏面板压住。
 *
 * ## 两个**各自独立**的成因（都逐项实测过，缺一不可）
 *
 * ### ① 被裁：它向右伸出了会话列，而列是 `overflow: hidden`
 *
 * 官方 `JobListAction.module.css` 的 `.menu { position: absolute; left: 0; width: 500px }`
 * 锚在**触发器**上（`.root { position: relative }`，实测只有 152px 宽）。
 * 于是弹框盒子 = 587..1087，而会话根 `[data-phase='active']`（= `.root`）是
 * `overflow: hidden`、盒子 280..880 ⇒ **向右伸出的 207px 整块被裁掉**。
 * 实测（用 `elementFromPoint` 逐点判可见性）：弹框右半两点落在**右栏面板**上，
 * 不是「被盖」而是**根本不在那里**（真机上读到的 `elementsFromPoint` 顶层是面板，
 * 因为裁切后那块区域只有面板）。
 *
 * ⚠️ 这**不是**本插件引入的：官方默认档（`PLAIN_ATTR` 打上、本插件整表让路）下
 * 裁切右缘**同样是 880**、弹框**同样**被切。此前 `d133f2c` 查证过同样的事实，
 * 当时的结论是「可修但要动官方列几何，收益 < 风险，不修」。本轮改判：
 * **有一个既不动列几何、也不动层序的修法**（见下），所以修。
 *
 * ### ② 被盖：它的 `z-index: 100` 关在**顶栏那个层叠上下文**里
 *
 * 弹框长在顶栏子树里，而在本插件里顶栏被抬成 `position: absolute` + `z-index: 82`
 * （见 `constants.ts` 的 `ABOVE_CONTENT_Z_INDEX`）⇒ **自成层叠上下文**，
 * 弹框那个 `100` 被**关在里面**、对外只算 82。右栏面板也正好是 82，
 * 两者同号时按**绘制次序**决胜 —— 面板在 DOM 里更靠后 ⇒ 面板赢。
 *
 * ⚠️ 所以「把弹框 `z-index` 调大」是**无效**的（它出不了顶栏那层）；
 * 而「把顶栏抬到 83」会违反官方次序（全屏面板 40 / dockkit 浮窗 60 都必须能压住顶栏，
 * 理由与实测见 `test/glass.test.mjs` 那条「顶栏不得抬到右栏面板之上」）。
 *
 * ## 修法：把弹框的**包含块**从触发器换成顶栏/会话根，并夹在列内
 *
 * 绝对定位的包含块 = 最近的**定位**祖先的**内边距盒**。把触发器那个 wrapper 改成
 * `position: static` 之后，包含块上移到：
 *
 * | 档位 | 新的包含块 | 内边距盒 |
 * | :--- | :--- | :--- |
 * | 选了色调 | 顶栏 `[data-slot='conversation.header'] > header`（本插件抬成 absolute） | 280..880，顶边 y=0 |
 * | 官方默认 | 会话根 `[data-phase='active']`（官方 relative） | 280..880，顶边 y=0 |
 *
 * 两者**右缘与顶边完全相同**（都是「会话列的内边距盒」）⇒ 同一条规则在两档下都成立，
 * 且**无魔术数字**（不依赖列宽 / 窗口宽 / 触发器位置）。
 *
 * 于是：
 * * `left: 0` ⇒ 落在列左缘。⚠️ 官方 `fit()` 在窄窗口会写**负数**内联 `left`
 *   （实测 900px 宽时 `-57.77px`），内联优先级高于选择器 ⇒ 必须 `!important` 压回。
 * * `top: HEADER_HEIGHT_PX` ⇒ 落在玻璃带（76px）**下缘**，不与顶栏重叠。
 *   （官方原值是 `calc(100% + 5px)`，其 `100%` 是**包含块**高度 —— 换了包含块之后
 *   它会随档位乱跑：tone 档落 80、官方档落 905，实测。）
 * * `max-width: 100%` ⇒ 列比 500px 窄时（实测 1100px 宽下 400px）跟着列收窄，不再越界。
 *
 * ## 为什么不吃「官方默认」门
 *
 * 本缺陷在**官方档下同样存在**（见 ① 的实测），所以这是「**修官方无意的 bug**」那一类
 * ⇒ 两个档都修，不带 `PLAIN_ATTR` 门。判据表见 `docs/spec/09-nav-pin-merge.md` §3.1；
 * 全插件此前有三条同类规则（`mask.ts` / `handle-glow.ts` / `surface.ts` 的悬停卡），
 * 本模块是**第四条** —— `test/popover.test.mjs` 钉住这件事，别顺手把门加上去。
 *
 * ## 门与爆照半径
 *
 * * 门只挂在**右栏面板已打开**上（`:has([${RIGHT_PANEL_ATTR}][data-sidebar-right-open])`）：
 *   面板关着时列右缘就是视口，弹框伸出去本来也看得见 —— **不许无谓地改官方布局**
 *   （实测：面板关闭 + 本规则 ⇒ 逐项与基准相同，中性）。
 * * `:has()` 只用在**这一条**上（不在玻璃表里，那条守卫不受影响）。
 *   实测开销：流式 DOM 抖动下 300 帧的帧间隔，带门 vs 不带门 **差 0.00ms**
 *   （`TEMP/costgate.mjs`），与 `surface.ts` 里「开销集中在 `:has()`」的观察不冲突 ——
 *   那条讲的是**全表批量**用 `:has()`，单条无感。
 * * 选择器只锚**官方槽位属性** `data-slot='conversation.session.header.actions'`
 *   （与 `surface.ts` 那条后台任务列表锚点同一处），不碰 hashed 类名。
 *   `ul` 收在槽位内 —— 实测该槽位下**只有**这一个 `ul`（子代理 / 智能体团队两个按钮
 *   弹的是别的东西）。
 */

import { HEADER_HEIGHT_PX } from './glass.js'
import { PLAIN_ATTR, RIGHT_PANEL_ATTR } from './constants.js'

/**
 * 顶栏动作槽位里那个弹出列表的宿主选择器（官方公开槽位属性，非 hashed 类名）。
 *
 * ⚠️ 官方 `JobListAction.tsx` 声明自己渲染进 `conversation.session.header.actions`，
 * 那个没有 role 的 `<ul>` 就长在它里面（同一条口径见 `surface.ts` 的锚点表）。
 */
export const HEADER_ACTION_SCOPE = "body [data-slot='conversation.session.header.actions']"

/**
 * 「右栏面板已打开」的祖先门。
 *
 * 面板是顶栏的**兄弟**子树，故只能用 `:has()` 从 `body` 向下找；开销实测 0.00ms。
 */
export const RIGHT_PANEL_OPEN_GATE = `body:has([${RIGHT_PANEL_ATTR}][data-sidebar-right-open])`

/**
 * 弹出层列内夹取的样式表文本。
 *
 * ⚠️ 刻意**不带** `PLAIN_ATTR` 门 —— 这是「修官方无意的 bug」那一类，两档都修
 * （缘由见本模块头注释）。`PLAIN_ATTR` 仍从 constants 引入，供守卫断言用。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildPopoverCss(): string {
  /* 门在前，故槽位那条去掉自带的 body 前缀（否则拼出 body… body…，永不命中 ——
     同款坑见 surface.ts 的 gatedAnchor）。 */
  const scope = `${RIGHT_PANEL_OPEN_GATE} [data-slot='conversation.session.header.actions']`
  return `/* ===== dsh-theme-tone 顶栏弹出层的列内夹取（详见本函数注释） =====
   ⚠️ 本表**故意不带官方默认门**（${PLAIN_ATTR}）：它修的是官方无意的裁切 / 层序缺陷，
   两个档都修。全插件第四条同类规则，判据见 docs/spec/09-nav-pin-merge.md §3.1。
   ⚠️ 别给顶栏加 z-index（会违反官方次序：全屏面板 40 / dockkit 浮窗 60 都要能压住顶栏），
   也别去动会话列的 overflow（那会破坏列自身的裁切契约）。本表只挪**弹框自己**的包含块。 */

/* ① 把弹框的**包含块**从触发器换成顶栏 / 会话根（两者内边距盒都是「会话列」，右缘与顶边相同）。
   触发器那个 wrapper 是官方 \`.root { position: relative }\`；改成 static 后它不再定位，
   绝对定位的包含块于是上移一层。触发器**按钮自身**的盒子逐像素不变（实测）。
   ⚠️ 不用 [class*=...] 匹配 —— 官方那个类名是 CSS-module 哈希，本仓库禁止依赖它；
   :has(> ul) 按**结构**命中，稳定。 */
${scope} :has(> ul) {
  position: static;
}
/* ② 夹进列内：
   * left: 0 —— 落列左缘。⚠️ !important 必须有：官方 fit() 在窄窗口写**负数内联 left**
     （实测 900px 宽时 -57.77px），内联样式优先级高于选择器。
   * top: HEADER_HEIGHT_PX —— 落玻璃带下缘，不与顶栏重叠（官方原值 calc(100% + 5px) 的
     100% 是包含块高度，换包含块后会随档位乱跑：实测 tone 档 80 / 官方档 905）。
   * max-width: 100% —— 列比 500px 窄时跟着列收窄（实测 1100px 窗口下列只有 400px）。 */
${scope} ul {
  left: 0 !important;
  top: ${HEADER_HEIGHT_PX}px;
  max-width: 100%;
}
`
}
