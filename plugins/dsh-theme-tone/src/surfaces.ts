/**
 * 官方**写死了面与字**、或材质在深色玻璃上读起来不对的少数浮层：本表统一做「官方材料修正」，
 * 不带「官方默认」门（与色调偏好无关，任何音色下都该修）。
 *
 * ① 左边栏 Workspace 行 hover 卡（HoverCard 的 compact/copyable 变体）：官方给它固定的深底与白系
 *    字色（两轴同值），这里把面换成官方抬升面 token、字换成官方 label token（标题最亮 → 路径/时间
 *    次之 → 状态最暗）。锚点：卡根是 `body > [role="button"][aria-label]`；字色按官方 CSS-module
 *    类名的稳定后缀命中（`[class*='_hoverTitle']` 等），已登记 docs/private-seams.md 的静默失效风险。
 * ② 停靠卡 / ③ 菜单分组标题 / ④ 输入框触发菜单：见各自常量上的注释。
 */
const CARD = "body > [role='button'][aria-label]"
const TITLE = "body > [role='button'][aria-label] [class*='_hoverTitle']"
const SECONDARY = "body > [role='button'][aria-label] [class*='_hoverPath'],\nbody > [role='button'][aria-label] [class*='_hoverTime']"
const TERTIARY = "body > [role='button'][aria-label] [class*='_hoverStatus']"
const COPIED = "body > [role='button'][aria-label] [class*='_copied']"

/** 菜单分组标题（模型选择列表等）：官方给了 sticky 却没给背景，列表滚动时条目从标题下面穿过。 */
const MENU_GROUP_HEADING = '[data-menu-group-heading]'
/** 停靠卡（todo / goal / queue）：官方材质是半透明菜单玻璃，几张叠在一起互相透，只有最上面一张看得出磨砂。 */
const DOCK_TODO = "[data-composer-seat] [data-testid='todo-panel']"
const DOCK_CHILD_GLASS = "[data-composer-seat] :is([data-goal-bar], [data-queue-dock]) > *::before"
/**
 * 输入框触发菜单（@ / 斜杠 候选列表）的「下面还有内容」提示：官方用 ::after 画一条 16px 的渐变条
 * （悬在底边上方、颜色取菜单材质色），在深色玻璃上会叠成一条发亮的硬边长方形。
 * 适配方式：不再用这条色块，改成**淡出列表内容本身**——菜单带 `data-overflow-below` 时把列表底部
 * 26px 渐隐（顶部同理），滚到底时官方会移除该属性、渐隐自然消失。提示语义保留且更直观。
 */
const TRIGGER_MENU = '[data-trigger-menu]'
const TRIGGER_MENU_VIEWPORT = '[role="listbox"]'
const TRIGGER_MENU_FADE = `${TRIGGER_MENU}::after`
const fadeEdges = (top: string, bottom: string): string => {
  const mask = `linear-gradient(to bottom, ${top}, #000 26px, #000 calc(100% - 26px), ${bottom})`
  return `  -webkit-mask-image: ${mask};
  mask-image: ${mask};`
}

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

/* 停靠卡材质：半透明菜单玻璃 → 不透明抬升面。todo 的材质在卡根元素上，goal / queue 在卡面子层的
   ::before 上；两轴、所有音色（含官方默认）统一生效，官方 elevation 阴影 / 边框 / 圆角原样保留。 */
${DOCK_TODO} {
  background: var(--dsw-alias-bg-layer-1) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
${DOCK_CHILD_GLASS} {
  background: var(--dsw-alias-bg-layer-1) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* 菜单分组标题：sticky 却没有（或只有近透明）背景 → 用「半透明菜单色盖在主题底色上」合成不透明底，
   滚动时条目不再从标题文字下面穿过；颜色与菜单主体同源，不新增色板。官方在浅色轴给了 94% 透明度的
   近不透明底，仍需压成完全不透明，故用 !important。 */
${MENU_GROUP_HEADING} {
  background-color: var(--dsw-alias-bg-base) !important;
  background-image: linear-gradient(var(--dsw-specific-menu), var(--dsw-specific-menu)) !important;
}

/* 输入框触发菜单「下面还有内容」提示：官方那条色块渐隐条在深色玻璃上会读成多余的长方形，
   改成淡出列表内容本身 —— 仅在菜单确实还能继续滚（data-overflow-below / -above）时生效，
   滚到底后官方移除属性、渐隐自动消失，提示语义保留且更直观。 */
${TRIGGER_MENU_FADE} {
  content: none !important;
}
${TRIGGER_MENU}[data-overflow-below] ${TRIGGER_MENU_VIEWPORT} {
${fadeEdges('black', 'transparent')}
}
${TRIGGER_MENU}[data-overflow-above] ${TRIGGER_MENU_VIEWPORT} {
${fadeEdges('transparent', 'black')}
}
${TRIGGER_MENU}[data-overflow-below][data-overflow-above] ${TRIGGER_MENU_VIEWPORT} {
${fadeEdges('transparent', 'transparent')}
}
`
}
