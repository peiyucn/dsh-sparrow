/**
 * **锚点属性**：把昂贵的选择器从 CSS 挪到运行期 —— 成本来自 `:has()` 的失效跟踪
 * （受控实测见 docs/spec/11），换成同命中集的属性选择器观感不变、开销全拿回。
 * 代价是选择器得由本插件在运行期算好写进属性：**只标必要元素、只在值变化时写**，
 * 扫描一律用便宜选择器，**绝不在 JS 里用 `:has()` 反查**（那等于把省下的钱又花回去）。
 */

/** 锚点属性名。值是**空格分隔的 token 列表**（CSS 用 `~=` 匹配）：一个属性 + 多 token，
 *  一次 `setAttribute` 就能把该元素的角色写全，便于「只在变化时写」这条优化。 */
export const ANCHOR_ATTR = 'data-tone-anchor'

/**
 * 锚点角色。⚠️ 铁律：**原选择器语义不同，就必须是不同的 token** —— 合并「分组在任意深度」与
 * 「分组是直接子」会让某个菜单**静默失去质感**（改动后必跑 `TEMP/verify-anchor-menu.mjs` 等价性对拍）。
 * 命名说的是**「被标记的元素是什么」**，不是「它包含了什么」——后者会在重写时把主客搞反。
 */
export const ANCHOR = Object.freeze({
  /** **输入框卡片的父元素**（缺口补丁的宿主）。原选择器 `:has(> [data-composer-card])`。 */
  composerHost: 'composer-host',
  /**
   * **含停靠卡的会话座**（todo 面板 / 目标栏，且**不含**队列坞）。
   * 原选择器 `[data-composer-seat]:has([data-testid='todo-panel'], [data-goal-bar]):not(:has([data-queue-dock]))`。
   */
  seatDocked: 'seat-docked',
  /** **命令面板卡片的祖元素**（背景长在祖先上、`role` 在内层视口上）。原选择器 `body :has(> [role='listbox'])`。 */
  listboxHost: 'listbox-host',
  /** **实色模态弹窗**（`role='dialog'` 且**不是**图片灯箱）。原选择器 `[role='dialog']:not(:has(> img))`。 */
  dialog: 'dialog',
  /** **子代理血缘弹层的外层盒子**（`body` 直接子元素，内含 `[role='tree']`）。原选择器 `body > :has(> [role='tree'])`。 */
  treeHost: 'tree-host',
  /**
   * **含分组子元素的菜单本体**（分组在**任意深度**）。原选择器 `[role='menu']:has([role='group'])`。
   * ⚠️ **不能与 `menuSelfScroller` 合并**：那条是「直接子就是分组」，官方菜单的分组可能在更深一层。
   */
  menuGrouped: 'menu-grouped',
  /** **带分组菜单里、直接子元素就是分组的那个元素**（rc.2 的滚动容器）。原选择器 `[role='menu']:has(> [role='group'])`。 */
  menuSelfScroller: 'menu-self-scroller',
  /** **带分组菜单里、含分组的那个直接子元素**（rc.1 的滚动容器）。原选择器 `[role='menu'] > :has([role='group'])`。 */
  menuChild: 'menu-child',
  /** **轮次导航 nav 的直接父元素**（官方隐藏规则作用的目标）。原选择器 `[data-conversation-scroll] div:has(> nav[aria-label="…"])`。 */
  turnNavHost: 'turn-nav-host',
  /** **对话滚动体的直接父元素**（官方那个 wrapper）。原选择器 `[data-phase] > div:has(> [data-conversation-scroll])`。 */
  scrollWrap: 'scroll-wrap',
  /**
   * **右栏面板已打开**（标记在 `document.body` 上，不是某个面板）。
   * 原选择器 `body:has([data-sidebar-right-panel][data-sidebar-right-open])` —— `:has()` 里最贵的一类（锚在 `body` 上）。
   */
  rightPanelOpen: 'right-panel-open',
} as const)

/** 锚点 token 的联合类型。 */
export type AnchorToken = (typeof ANCHOR)[keyof typeof ANCHOR]

/** 全部合法 token（用于清理与校验）。 */
export const ANCHOR_TOKENS: readonly AnchorToken[] = Object.freeze(Object.values(ANCHOR))

/** 生成匹配某锚点的 CSS 片段。用 `~=`（空格分隔词）而非 `=`：一个元素可能同时是多个角色。 */
export function anchorSelector(token: AnchorToken): string {
  return `[${ANCHOR_ATTR}~="${token}"]`
}

/**
 * 把 token 列表规范化成属性值（去重、按 {@link ANCHOR_TOKENS} 的固定顺序排列、空格分隔）。
 * 固定顺序是为了让「值没变就不写」这条优化真的有效 —— 集合相同而顺序不同会让 `setAttribute` 白写一次。
 * 空数组返回空串，调用方据此**移除**属性。
 */
export function anchorValue(tokens: readonly AnchorToken[]): string {
  const wanted = new Set(tokens)
  return ANCHOR_TOKENS.filter(token => wanted.has(token)).join(' ')
}
