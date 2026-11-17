


const MENU_GROUP_HEADING = '[data-menu-group-heading]'


const DOCK_TODO = "[data-composer-seat] [data-testid='todo-panel']"
const DOCK_CHILD_GLASS = "[data-composer-seat] :is([data-goal-bar], [data-queue-dock]) > *::before"

const TRIGGER_MENU = '[data-trigger-menu]'
const TRIGGER_MENU_VIEWPORT = '[role="listbox"]'
const TRIGGER_MENU_FADE = `${TRIGGER_MENU}::after`
const fadeEdges = (top: string, bottom: string): string => {
  const mask = `linear-gradient(to bottom, ${top}, #000 26px, #000 calc(100% - 26px), ${bottom})`
  return `  -webkit-mask-image: ${mask};
  mask-image: ${mask};`
}

export function buildSurfaceCss(): string {
  return `/* 停靠卡材质：半透明菜单玻璃 → 不透明抬升面。todo 的材质在卡根元素上，goal / queue 在卡面子层的
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

/* 菜单材质 / 相位动画交回官方（0.2.2 观感还原；嵌套 backdrop 闪块为已知限制）。 */

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
