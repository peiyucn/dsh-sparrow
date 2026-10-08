/**
 * **锚点属性**：把昂贵的选择器从 CSS 挪到运行期。
 *
 * ## 为什么要有这个模块（有实测依据）
 *
 * 主表里原本有 19 条含 `:has()` 的规则。受控实测（有头浏览器 + 真实合成 +
 * 模拟流式，100~120 帧/次、交错多轮、带噪声底臂，详见 `docs/spec/11`）：
 *
 * | 臂 | 样式重算耗时 |
 * | :--- | ---: |
 * | 现状（19 条 `:has()`） | 4622.8 ms |
 * | 删掉全部 19 条 | 1559.4 ms |
 * | **换成同命中集的属性选择器** | **1513.8 ms** |
 *
 * 即：**成本来自 `:has()` 的失效跟踪，与命中后画什么都不相关** ——
 * 换成属性选择器能拿回约 100% 的收益，而效果一个字不变
 *（PoC 里两者命中同一批元素、规则条数不变）。
 *
 * ⚠️ 代价是这些选择器必须在**运行期**由本插件自己算出来写进属性。
 * 所以本模块的规矩是：
 * * **只标必要的元素**（每个角色通常 0~2 个），且**只在值变化时写**；
 * * 扫描用**便宜的选择器**（属性 / 标签），**绝不在 JS 里用 `:has()` 反查**
 *   —— 那等于把省下的钱又花回去；
 * * 角色集合宁可小：每多一个 token 就多一分误标的可能。
 *
 * ## 与其它门属性的关系
 * 本属性是**内容锚点**，与 `PLAIN_ATTR`（官方默认档）/ `WORKSTART_ATTR`（待启动态）/
 * `PHASE_*_ATTR`（相位就绪）**正交**：那些是「要不要生效」的开关，
 * 本属性是「该给谁上料」的定位。两者在规则里以**并列**形式出现。
 */

/**
 * 锚点属性名。值是**空格分隔的 token 列表**（用 `~=` 匹配）。
 *
 * 用「一个属性 + 多 token」而不是「一个角色一个属性」：元素数量少、属性总数固定，
 * 且一次 `setAttribute` 就能把该元素的角色写全，便于「只在变化时写」这条优化。
 */
export const ANCHOR_ATTR = 'data-tone-anchor'

/**
 * 锚点角色。
 *
 * ## ⚠️ 一条铁律：**原选择器语义不同，就必须是不同的 token**
 * 本轮真犯过：把「分组在**任意深度**」与「分组是**直接子**」两条判据合并到同一个 token，
 * 于是本仓库 codebuddy 菜单（实测 `groupsDirect: 0 / groupsAny: 2`）**静默失去质感** ——
 * 不报错、不崩，只是某个菜单不再有颗粒与光。
 * 抓到它的是 `TEMP/verify-anchor-menu.mjs` 的**等价性对拍**（拿原选择器当基准逐个比命中集），
 * 不是任何一条断言 —— 所以那个脚本是这类改动的**必跑项**。
 *
 * 命名是**「被标记的元素是什么」**，不是「它包含了什么」——后者会在重写时把主客搞反。
 */
export const ANCHOR = Object.freeze({
  /**
   * **输入框卡片的父元素**（缺口补丁的宿主）。
   * 原选择器：`:has(> [data-composer-card])`。
   */
  composerHost: 'composer-host',
  /**
   * **含停靠卡的会话座**（todo 面板 / 目标栏，且**不含**队列坞）。
   * 原选择器：`[data-composer-seat]:has([data-testid='todo-panel'], [data-goal-bar]):not(:has([data-queue-dock]))`。
   */
  seatDocked: 'seat-docked',
  /**
   * **命令面板卡片的祖元素**（背景长在祖先上、`role` 在内层视口上）。
   * 原选择器：`body :has(> [role='listbox'])`。
   */
  listboxHost: 'listbox-host',
  /**
   * **实色模态弹窗**（`role='dialog'` 且**不是**图片灯箱）。
   * 原选择器：`[role='dialog']:not(:has(> img))`。
   */
  dialog: 'dialog',
  /**
   * **子代理血缘弹层的外层盒子**（`body` 直接子元素，内含 `[role='tree']`）。
   * 原选择器：`body > :has(> [role='tree'])`。
   */
  treeHost: 'tree-host',
  /**
   * **含分组子元素的菜单本体**（分组在**任意深度**）。
   * 原选择器：`[role='menu']:has([role='group'])`。
   *
   * ⚠️ **不能与 {@link ANCHOR.menuSelfScroller} 合并** —— 两者语义不同：
   * 这条是「**后代里有**分组」（官方菜单的分组可能在更深一层），
   * 那条是「**直接子**就是分组」。实测本仓库 codebuddy 菜单的分组是 `groupsDirect: 0 / groupsAny: 2`
   * —— 合并到「直接子」判据上会让那个菜单**静默失去质感**（本轮真犯过，靠等价性对拍抓到）。
   */
  menuGrouped: 'menu-grouped',
  /**
   * **带分组菜单里、直接子元素就是分组的那个元素**（rc.2 的滚动容器就是它自己）。
   * 原选择器：`[role='menu']:has(> [role='group'])`。
   */
  menuSelfScroller: 'menu-self-scroller',
  /**
   * **带分组菜单里、含分组的那个直接子元素**（rc.1 的滚动容器）。
   * 原选择器：`[role='menu'] > :has([role='group'])`。
   */
  menuChild: 'menu-child',
  /**
   * **轮次导航 nav 的直接父元素**（官方隐藏规则作用的目标）。
   * 原选择器：`[data-conversation-scroll] div:has(> nav[aria-label="…"])`。
   */
  turnNavHost: 'turn-nav-host',
  /**
   * **对话滚动体的直接父元素**（官方那个 wrapper）。
   * 原选择器：`[data-phase] > div:has(> [data-conversation-scroll])`。
   */
  scrollWrap: 'scroll-wrap',
  /**
   * **头部操作区里、直接子元素是 `<ul>` 的那个容器**。
   * 原选择器：`[data-slot='conversation.session.header.actions'] :has(> ul)`。
   */
  panelActionsUl: 'panel-actions-ul',
  /**
   * **右栏面板已打开**（标记在 `document.body` 上，不是某个面板）。
   *
   * 原选择器：`body:has([data-sidebar-right-panel][data-sidebar-right-open])` ——
   * 这是 `:has()` 里最贵的一类（锚在 `body` 上，任何 DOM 变动都要重算整个子树）。
   */
  rightPanelOpen: 'right-panel-open',
} as const)

/** 锚点 token 的联合类型。 */
export type AnchorToken = (typeof ANCHOR)[keyof typeof ANCHOR]

/** 全部合法 token（用于清理与校验）。 */
export const ANCHOR_TOKENS: readonly AnchorToken[] = Object.freeze(Object.values(ANCHOR))

/**
 * 生成匹配某锚点的 CSS 片段。
 *
 * 用 `~=`（空格分隔词）而不是 `=`：一个元素可能同时是多个角色
 *（例如滚动容器既可能是 `menu-child` 也可能是别的），用 token 列表才不会互相覆盖。
 * @param token - 锚点角色。
 * @returns 形如 `[data-tone-anchor~="composer-host"]` 的选择器片段。
 */
export function anchorSelector(token: AnchorToken): string {
  return `[${ANCHOR_ATTR}~="${token}"]`
}

/**
 * 把 token 列表规范化成属性值（去重、按 {@link ANCHOR_TOKENS} 的固定顺序排列、空格分隔）。
 *
 * 固定顺序是为了让「值没变就不写」这条优化真的有效 —— 集合相同但顺序不同的
 * 字符串会让 `setAttribute` 每次都写一遍，白引一次样式失效。
 * @param tokens - 该元素应具有的锚点角色。
 * @returns 属性值；空数组返回空串（调用方据此**移除**属性）。
 */
export function anchorValue(tokens: readonly AnchorToken[]): string {
  const wanted = new Set(tokens)
  return ANCHOR_TOKENS.filter(token => wanted.has(token)).join(' ')
}
