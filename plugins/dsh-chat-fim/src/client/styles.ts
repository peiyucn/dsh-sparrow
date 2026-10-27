/**
 * dsh-chat-fim 客户端样式层：类名表 + 样式表文本 + 注入口。
 * 类名与样式表共用同一份定义 —— TSX 里不再手写类名字符串，样式也不再内联在组件里。
 */

import { MENU_MAX_HEIGHT, MENU_Z_INDEX, POPOVER_Z_INDEX, RING_Z_INDEX, STYLE_ATTR, STYLE_SELECTOR } from '../constants.js'

const PREFIX = 'dsh-chat-fim'

/** 环的角度变量与 keyframes 名（`@property` / `conic-gradient` / `animation` 三处必须同名）。 */
const RING_ANGLE = `--${PREFIX}-angle`
const RING_SPIN = `${PREFIX}-ring-spin`

/** 组件与样式表共用的类名表。 */
export const CHAT_FIM_CLASS = Object.freeze({
  switch: `${PREFIX}-switch`,
  switchIcon: `${PREFIX}-switch-icon`,
  switchLabel: `${PREFIX}-switch-label`,
  switchOn: `${PREFIX}-switch-on`,
  switchOff: `${PREFIX}-switch-off`,
  switchPicker: `${PREFIX}-switch-picker`,
  switchArrow: `${PREFIX}-switch-arrow`,
  switchArrowOpen: `${PREFIX}-switch-arrow-open`,
  ring: `${PREFIX}-ring`,
  anchor: `${PREFIX}-anchor`,
  menuAnchor: `${PREFIX}-menu-anchor`,
  menu: `${PREFIX}-menu`,
  menuRow: `${PREFIX}-menu-row`,
  menuText: `${PREFIX}-menu-text`,
  menuTrailing: `${PREFIX}-menu-trailing`,
  menuHint: `${PREFIX}-menu-hint`,
  menuKbd: `${PREFIX}-menu-kbd`,
  menuFooter: `${PREFIX}-menu-footer`,
  menuBrand: `${PREFIX}-menu-brand`,
  menuUsage: `${PREFIX}-menu-usage`,
  error: `${PREFIX}-error`,
  sensitivityPopover: `${PREFIX}-sensitivity-popover`,
  sensitivityOption: `${PREFIX}-sensitivity-option`,
  sensitivityOptionCheck: `${PREFIX}-sensitivity-option-check`,
  sensitivityOptionRule: `${PREFIX}-sensitivity-option-rule`,
  dots: `${PREFIX}-dots`,
  dot: `${PREFIX}-dot`,
  dotOn: `${PREFIX}-dot-on`,
})

/** 样式表文本（注入 `<style>`；规则内容与拆分前逐字一致）。 */
export function buildChatFimCss(): string {
  const cls = CHAT_FIM_CLASS
  return `
/* 开关胶囊：官方 PermissionSelect / ModelSelect 触发器**逐项几何一致**
   （height 28 / padding 0 4px 0 8px / 圆角 --dsw-radius-sm / gap 4 / 13-20 字、悬停底同 token）——
   此前圆角写 24px（胶囊），hover 底色因此被裁成「椭圆」，和官方其他触发器明显不同。 */
.${cls.switch} {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.${cls.switch}:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.${cls.switchIcon} {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-caption);
}
.${cls.switchLabel} {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${cls.switchOn} {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.${cls.switchOn} .${cls.switchIcon} {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
/* 关闭态：灰字区分（开启态紫色），不再用删除线。 */
.${cls.switchOff} .${cls.switchLabel} {
  color: var(--dsw-alias-label-tertiary, #9aa0a6);
}
/* 胶囊内灵敏度触发区（开关主体右侧：三点 + ▾）：整区可点，只开合灵敏度菜单、不切换开关。
   不单独做悬停底色——按钮主体已有悬停底色，叠加会成嵌套椭圆。
   命中区铺满：负 margin 顶掉按钮右侧 padding 与标签左侧 gap，视觉间距由 padding 补回
   （左 6px 呼吸间距，右侧 9px 保持按钮右缘观感）。 */
.${cls.switchPicker} {
  display: inline-flex;
  align-items: center;
  align-self: stretch;
  gap: 3px;
  margin: 0 -4px 0 -4px;
  padding: 0 9px 0 6px;
  cursor: pointer;
}
.${cls.switchOn} .${cls.switchPicker} {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
/* ▾：打开时旋转 180°。 */
.${cls.switchArrow} {
  display: inline-flex;
  align-items: center;
  flex: none;
  color: var(--dsw-alias-label-caption);
  transition: transform 120ms ease;
}
.${cls.switchOn} .${cls.switchArrow} {
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.${cls.switchArrowOpen} {
  transform: rotate(180deg);
}
/* 窄行折叠为纯图标：官方 PermissionSelect 同款匿名 @container 规则，
   容器是 InputBar .row（container-type: inline-size），阈值同官方 460px。 */
@container (max-width: 460px) {
  .${cls.switch} .${cls.switchLabel} {
    display: none;
  }
  .${cls.switch} {
    padding: 0 6px;
  }
  .${cls.switchPicker} {
    margin: 0 -6px 0 -4px;
    padding: 0 11px 0 9px;
  }
}
@property ${RING_ANGLE} { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
/* 转动环：钉在 composer 上沿的装饰层。
   z-index 必须**低于**遮罩层（官方 Modal/Settings 1000、归档面板与确认框 1000/1100）——
   否则弹窗打开时环会浮在遮罩之上，不随背景一起虚化（2026-09-08 修）。
   取值 900：仍高于普通内容与菜单层（官方 MenuView/PopupSelect 100、本插件菜单 100），
   又低于一切遮罩，因此弹窗一出环即被 backdrop-filter 模糊。 */
.${cls.ring} {
  position: fixed;
  z-index: ${RING_Z_INDEX};
  pointer-events: none;
  box-sizing: border-box;
  padding: 2px;
  border-radius: 24px;
  background: conic-gradient(
    from var(${RING_ANGLE}),
    transparent 0deg,
    transparent 300deg,
    color-mix(in srgb, var(--dsw-alias-button-info-fill, #4d6bfe) 85%, transparent) 340deg,
    color-mix(in srgb, var(--dsw-alias-button-info-fill, #4d6bfe) 30%, transparent) 355deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: ${RING_SPIN} 1.6s linear infinite;
}
@keyframes ${RING_SPIN} {
  to { ${RING_ANGLE}: 360deg; }
}
/* 候选菜单锚点：镜像官方 overlayAnchor（绝对定位、零高、钉在 composer 卡片上沿）。 */
.${cls.menuAnchor} {
  position: absolute;
  inset: 0 0 auto;
  height: 0;
}
/* 菜单卡：逐项对齐官方 @ 候选列表（ui-input-trigger/MenuView.module.css .menu）的几何与立起方式；
   材质交给官方 MenuSurface（.surface 只做 isolation / 圆角 / 裁切，.material 子层承担填充 + 模糊）。 */
.${cls.menu} {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: ${MENU_Z_INDEX};
  box-sizing: border-box;
  max-height: ${MENU_MAX_HEIGHT}px;
  overflow: hidden;
  padding: 4px;
  display: flex;
  flex-direction: column;
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
}
/* 行：官方 MenuView .item 的几何与 token 逐项一致（34 高 / 6×8 内边距 / 12 圆角 / 13-20 字）。 */
.${cls.menuRow} {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  text-align: left;
}
.${cls.menuRow}:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
/* 建议长句 2 行截断（超出省略），全文经 title 提示。 */
.${cls.menuText} {
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}
/* 行尾键位提示：官方 @ 列表 drillHint 同款（caption 色文字 + 键盘帽，右对齐）。 */
.${cls.menuTrailing} {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  /* 与建议文字保持呼吸间距（文字 flex:1 顶满后 auto 边距为 0，靠这里拉开）。 */
  padding-left: 24px;
}
.${cls.menuHint} {
  color: var(--dsw-alias-label-caption);
  font-size: 10px;
  line-height: 16px;
  white-space: nowrap;
}
/* 键盘帽与官方 @ 列表 drillHint 完全同款（token 逐项一致：底色/圆角/内边距/字色）。 */
.${cls.menuKbd} {
  padding: 0 4px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-caption);
  font-family: inherit;
  font-size: 10px;
  line-height: 16px;
}
/* 菜单底部：左下角品牌行（🐦 dsh-sparrow），右下角展示 token 数与实际模型。
   分隔线走官方菜单 footer 的 l2 发丝线（l1 在菜单面上近不可见）。 */
.${cls.menuFooter} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
  padding: 3px 4px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}
.${cls.menuBrand} {
  font-size: 11px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
/* 触发灵敏度弹层：与官方菜单同构（MenuSurface 承载材质，几何对齐官方 Menu 卡），
   左缘对齐开关胶囊、空间不足自动向上（官方 Menu 的 start 对齐）。 */
.${cls.sensitivityPopover} {
  position: fixed;
  z-index: ${POPOVER_Z_INDEX};
  display: flex;
  flex-direction: column;
  min-width: 240px;
  padding: 4px;
  border: 0;
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
}
.${cls.menuUsage} {
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}
/* 选项行：官方 MenuView .item 的几何与 token（与候选菜单行同一套尺寸）。 */
.${cls.sensitivityOption} {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.${cls.sensitivityOption}:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.${cls.sensitivityOptionCheck} {
  width: 14px;
  flex: none;
  font-size: 12px;
}
.${cls.sensitivityOptionRule} {
  margin-left: auto;
  color: var(--dsw-alias-label-caption);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
}
/* 灵敏度竖点：恒显 3 个方点，自下而上点亮 3/2/1 个 = 高/中/低；未点亮为更浅的淡色占位。
   与 ▾ 同在灵敏度触发区内（分割线左侧是开关主体）；点 3px、方角（owner 拍板：档位用方点）。 */
.${cls.dots} {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.${cls.dot} {
  width: 3px;
  height: 3px;
  border-radius: 0;
  background: color-mix(in srgb, currentColor 30%, transparent);
}
.${cls.dotOn} {
  background: currentColor;
}
/* 环的隐藏锚点：只作测量起点的 DOM 标记，不参与布局与朗读。 */
.${cls.anchor} {
  display: none;
}
/* 开关旁的错误标记：原因是标题（title），标记本身只做可见提示。 */
.${cls.error} {
  color: var(--dsw-alias-state-warn-primary, #d9822b);
  font-size: 12px;
}
`
}

/**
 * 注入本插件样式并返回 style 元素；调用方在卸载时移除。
 * HMR / 重载命中旧标签时只刷新内容，不叠加第二个 style。
 */
export function ensureChatFimStyles(): HTMLStyleElement {
  const css = buildChatFimCss()
  const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
  if (existing !== null) {
    if (existing.textContent !== css) existing.textContent = css
    return existing
  }
  const style = document.createElement('style')
  style.setAttribute(STYLE_ATTR, '')
  style.textContent = css
  document.head.appendChild(style)
  return style
}
