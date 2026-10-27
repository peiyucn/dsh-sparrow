/**
 * dsh-codebuddy-credits 客户端样式层（**唯一的 CSS 文本来源**）：
 * 五个组件原有的 `ensure*Styles()` 收敛为纯 `build*Css()` 构建函数 + 类名常量表，
 * 由 client/index.ts 统一注入一次（marker 选择器 + HMR 刷新）并在卸载时移除。
 * 组件只保留必要的动态 inline style（面板定位、进度条宽度、hero 落点等）。
 * 视觉 token 一律走官方 `--dsw-*` / `--dsh-*`，不引入自有设计。
 */

import { MARK_COLLAPSE_PX, STYLE_SELECTOR } from '../constants.js'

/** 组件共用的类名（对外导出给组件用，避免两处各写一遍字符串）。 */
export const CCB_CLASS = Object.freeze({
  // 顶栏入口 / 面板
  trigger: 'ccb-indicator-trigger',
  triggerHero: 'ccb-indicator-trigger-hero',
  heroAnchor: 'ccb-hero-anchor',
  indicatorButton: 'ccb-indicator-button',
  markWide: 'ccb-mark-wide',
  markNarrow: 'ccb-mark-narrow',
  panel: 'ccb-indicator-panel',
  panelHead: 'ccb-indicator-panel-head',
  panelMark: 'ccb-indicator-panel-mark',
  panelTitle: 'ccb-indicator-panel-title',
  badge: 'ccb-indicator-badge',
  caption: 'ccb-caption',
  danger: 'ccb-danger',
  divider: 'ccb-divider',
  quotaTitle: 'ccb-indicator-quota-title',
  quotaTrack: 'ccb-indicator-quota-track',
  quotaFill: 'ccb-quota-fill',
  quotaText: 'ccb-indicator-quota-text',
  creditValue: 'ccb-indicator-credit-value',
  maxRow: 'ccb-indicator-max-row',
  maxLabel: 'ccb-indicator-max-label',
  maxSwitch: 'ccb-max-switch',
  maxSwitchOn: 'ccb-max-switch-on',
  maxKnob: 'ccb-max-knob',
  modelRow: 'ccb-indicator-model-row',
  modelName: 'ccb-indicator-model-name',
  modelFacts: 'ccb-indicator-model-facts',
  featuresRow: 'ccb-indicator-features',
  featuresValue: 'ccb-indicator-features-value',
  brand: 'ccb-indicator-brand',
  // 设置卡
  cardRoot: 'ccb-card-root',
  cardRootHidden: 'ccb-card-root-hidden',
  cardEditor: 'ccb-card-editor',
  cardHeader: 'ccb-card-header',
  cardTitle: 'ccb-card-title',
  cardField: 'ccb-card-field',
  cardLabel: 'ccb-card-label',
  cardInput: 'ccb-card-input',
  cardError: 'ccb-card-error',
  cardHint: 'ccb-card-hint',
  cardModels: 'ccb-card-models',
  cardModelsHeader: 'ccb-card-models-header',
  cardModelRow: 'ccb-card-model-row',
  cardModelName: 'ccb-card-model-name',
  cardModelFact: 'ccb-card-model-fact',
  cardActions: 'ccb-card-actions',
  cardButton: 'ccb-card-button',
  cardButtonPrimary: 'ccb-card-button-primary',
  cardButtonSecondary: 'ccb-card-button-secondary',
  cardButtonDanger: 'ccb-card-button-danger',
  cardButtonClear: 'ccb-card-button-clear',
  cardButtonRefresh: 'ccb-card-button-refresh',
  cardNotice: 'ccb-card-notice',
  // 会话积分胶囊
  statsPill: 'ccb-session-stats-pill',
  statsLabel: 'ccb-session-stats-label',
  // 每轮积分胶囊
  turnTrigger: 'ccb-turn-credit-trigger',
  turnLabel: 'ccb-turn-credit-label',
  // 模型行只读事实
  modelLabel: 'ccb-model-label',
  modelLabelName: 'ccb-model-labelName',
  modelLabelFacts: 'ccb-model-labelFacts',
  // 积分弹层
  dialog: 'ccb-credit-dialog',
  dialogTitle: 'ccb-credit-dialog-title',
  dialogTitleLabel: 'ccb-credit-dialog-title-label',
  dialogAmount: 'ccb-credit-dialog-amount',
  dialogRule: 'ccb-credit-dialog-rule',
  dialogDetails: 'ccb-credit-dialog-details',
  dialogTerm: 'ccb-credit-dialog-term',
  dialogGroup: 'ccb-credit-dialog-group',
  dialogValue: 'ccb-credit-dialog-value',
  dialogModel: 'ccb-credit-dialog-model',
  // 加载态
  busyDot: 'ccb-busy-dot',
})

/** 顶栏入口 + 面板样式（视觉与 2026-10 版一致；窄化靠官方 `.titleRow` 的匿名容器查询）。 */
export function buildIndicatorCss(): string {
  return `/* CodeBuddy 顶栏入口：hover / focus / 容器查询只能走样式表 */
.ccb-indicator-button {
  display: inline-flex; align-items: center; justify-content: center;
  height: 28px; padding: 0 8px;
  border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.ccb-mark-wide, .ccb-mark-narrow { line-height: 1; }
.ccb-mark-wide { display: inline-flex; }
.ccb-mark-narrow { display: none; }
@container (max-width: ${MARK_COLLAPSE_PX}px) {
  .ccb-mark-wide { display: none; }
  .ccb-mark-narrow { display: inline-flex; }
  .ccb-indicator-button { padding: 0 5px; }
}
.ccb-indicator-button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.ccb-indicator-button:focus-visible {
  outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
.ccb-quota-fill { height: 100%; min-width: 4px; transition: width 220ms ease-out; background: var(--dsw-alias-button-info-hover); }
.ccb-max-switch { position: relative; flex: 0 0 auto; width: 28px; height: 16px; padding: 0; border: none; border-radius: 8px; background: var(--dsw-alias-interactive-bg-hover); cursor: pointer; transition: background 120ms ease; }
.ccb-max-switch:disabled { cursor: default; opacity: 0.6; }
.ccb-max-switch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-alias-border-l3); }
.ccb-max-switch-on { background: var(--dsw-alias-button-info-hover); }
.ccb-max-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--dsw-alias-label-primary, #fff); transition: transform 120ms ease; }
.ccb-max-switch-on .ccb-max-knob { transform: translateX(12px); }
/* 入口根：header 常驻态在流内；hero 态由组件给 top/right（绝对定位） */
.ccb-indicator-trigger { display: inline-flex; position: relative; }
.ccb-indicator-trigger-hero { position: absolute; z-index: 7; }
/* hero 锚 span：display:none 占位（closest 仍有效），DOM 必须在，故用类名而不是条件渲染 */
.ccb-hero-anchor { display: none; }
/* 展开面板：材质对齐官方 Menu 卡片；定位（top / right / width）由组件按视口量出 */
.ccb-indicator-panel {
  position: fixed;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 0;
  border-radius: 20px;
  background: var(--dsw-specific-menu);
  /* --dsw-specific-menu 是半透明玻璃色：必须同规则内配对 backdrop-filter，否则背后文字透出来 */
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  z-index: 1000;
  text-align: left;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ccb-indicator-panel-head {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; line-height: 18px; margin-bottom: 6px;
}
.ccb-indicator-panel-mark { display: inline-flex; flex: 0 0 auto; font-size: 16px; line-height: 1; }
/* 标题不换行：放不下时省略号截断，把空间让给徽章 */
.ccb-indicator-panel-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ccb-indicator-badge {
  margin-left: auto; flex: 0 0 auto;
  padding: 0 6px; border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px; line-height: 18px; font-weight: 500;
  white-space: nowrap; text-decoration: none; cursor: pointer;
}
/* 面板正文 12px；不用 caption —— 那档在深浅两主题下都偏淡、不可读 */
.ccb-caption { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.ccb-danger { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.ccb-divider { height: 1px; background: var(--dsw-alias-border-l1); }
.ccb-indicator-quota-title { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
/* 容量条对齐 dsh-file-manage：16px 厚、45° 斜纹未使用区、文字居中叠加 */
.ccb-indicator-quota-track {
  position: relative; height: 16px; border-radius: 8px;
  background-color: var(--dsw-alias-interactive-bg-hover);
  background-image: repeating-linear-gradient(45deg, transparent 0px, transparent 5px, var(--dsw-alias-border-l1) 5px, var(--dsw-alias-border-l1) 7px);
  overflow: hidden;
}
.ccb-indicator-quota-text {
  position: absolute; inset: 0; z-index: 1;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; line-height: 16px; white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  text-shadow: 0 0 4px var(--dsw-alias-bg-layer-2);
  pointer-events: none;
}
.ccb-indicator-credit-value { color: var(--dsw-alias-state-warn-primary, #d9822b); font-weight: 600; }
.ccb-indicator-max-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ccb-indicator-max-label { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.ccb-indicator-model-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.ccb-indicator-model-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 20px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.ccb-indicator-model-facts { flex: 0 0 auto; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.ccb-indicator-features { display: flex; justify-content: space-between; gap: 12px; }
.ccb-indicator-features-value { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
/* 品牌行：-6px 底距抵消面板 12px 内边距，使上下边距对称 */
.ccb-indicator-brand { border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 2px; margin-bottom: -6px; text-align: center; font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-tertiary); }
`
}

/** 设置卡样式（官方 ProviderEditor / ModelsSection 同款；:focus 等伪类只能走样式表）。 */
export function buildCardCss(): string {
  return `/* CodeBuddy Credits 设置卡：只隐藏官方占位编辑器，行头「编辑」按钮保留 */
.ccb-card-root-hidden { display: none; }
.ccb-card-editor {
  display: flex; flex-direction: column; gap: 14px;
  padding: 14px 16px; border-radius: 12px;
  background: var(--dsw-alias-bg-module-platform);
  width: 100%; box-sizing: border-box;
}
.ccb-card-header { display: flex; align-items: baseline; gap: 8px; }
.ccb-card-title { font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.ccb-card-field { display: flex; flex-direction: column; gap: 6px; }
.ccb-card-label { display: inline-flex; align-items: center; gap: 10px; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.ccb-card-input {
  box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 8px;
  font: inherit; font-size: 14px; line-height: 22px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
}
.ccb-card-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.ccb-card-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.ccb-card-input:disabled { opacity: 0.6; cursor: default; }
.ccb-card-error { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.ccb-card-hint { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
/* 绿色保存提示：插在 section 顶部（官方 savedProvider 位置），静态样式只能靠类名 */
.ccb-card-notice { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-success-primary); }
.ccb-card-models { display: flex; flex-direction: column; gap: 6px; }
.ccb-card-models-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ccb-card-model-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 12px; line-height: 18px; }
.ccb-card-model-name { color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ccb-card-model-fact { flex: none; color: var(--dsw-alias-label-tertiary); }
.ccb-card-actions { display: flex; justify-content: flex-end; gap: 8px; }
/* 官方 footer 按钮：胶囊 */
.ccb-card-button {
  box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  gap: 4px; height: 36px; padding: 0 14px; border: none; border-radius: 18px;
  font: inherit; font-size: 14px; line-height: 22px; cursor: pointer;
}
.ccb-card-button-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.ccb-card-button-secondary { border: 0.5px solid var(--dsw-alias-border-l3); background: transparent; color: var(--dsw-alias-label-primary); }
.ccb-card-button-danger { border: 0.5px solid var(--dsw-alias-border-l3); background: transparent; color: var(--dsw-alias-state-error-primary); }
.ccb-card-button-clear { margin-right: auto; }
/* 只读清单右上角的「获取可用模型」按钮：官方同款紧凑行内 */
.ccb-card-button-refresh {
  height: 28px; padding: 0 10px; font-size: 12px; line-height: 18px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary);
}
/* 只隐藏官方占位编辑器（li 首个 div 且无 rowActions 结构）；行头「编辑」按钮不隐藏 */
li:has(.ccb-card-root) > div:first-child:not(:has(> span:last-child)) { display: none; }
`
}

/** 会话积分胶囊样式（官方 `.pill` 圆角是紧凑控件档 R8）。 */
export function buildStatsCss(): string {
  /** 官方字号/行高设在外层 `.anchor`（`.pill` 上不设），我们不在其中、`font: inherit` 会大一档，故照抄。 */
  const pillRadius = 'var(--dsw-radius-sm)'
  const pillFontSize = 'calc(var(--dsh-content-font-size-secondary, 13px) - 1px)'
  const pillLineHeight = 'calc(20px + var(--dsh-content-font-delta-secondary, 0px))'
  return `/* 会话积分胶囊：逐条对齐官方 .anchor + .pill */
.ccb-session-stats-pill {
  display: inline-flex; align-items: center; gap: 6px;
  box-sizing: border-box; max-width: 100%;
  padding: 1px 8px; border: none;
  border-radius: ${pillRadius};
  background: transparent; color: var(--dsw-alias-label-tertiary);
  font: inherit; font-variant-numeric: tabular-nums;
  font-size: ${pillFontSize};
  line-height: ${pillLineHeight};
  white-space: nowrap; cursor: pointer;
}
.ccb-session-stats-pill svg {
  width: 14px; height: 14px; flex: none;
}
.ccb-session-stats-pill:hover, .ccb-session-stats-pill[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);
}
.ccb-session-stats-label {
  min-width: 0; overflow: hidden; text-overflow: ellipsis;
}
`
}

/** 每轮积分胶囊样式（对齐官方 TurnUsagePanel.module.css 的 .trigger 配方）。 */
export function buildTurnCreditCss(): string {
  return `/* 每轮积分胶囊 */
.ccb-turn-credit-trigger {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0;
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px 8px; border: none; border-radius: 28px;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  font-variant-numeric: tabular-nums;
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  white-space: nowrap; cursor: pointer;
}
.ccb-turn-credit-trigger svg {
  width: calc(15px + var(--dsh-content-font-delta, 0px)); height: calc(15px + var(--dsh-content-font-delta, 0px)); flex: none;
}
.ccb-turn-credit-trigger:hover, .ccb-turn-credit-trigger[aria-expanded="true"] {
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);
}
.ccb-turn-credit-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 480px) {
  .ccb-turn-credit-trigger { justify-content: center; width: calc(28px + var(--dsh-content-font-delta, 0px)); padding: 6px; }
  .ccb-turn-credit-label { display: none; }
}
`
}

/** 模型行只读事实样式。 */
export function buildModelLabelCss(): string {
  return `/* 模型行只读事实（倍率 · 上下文） */
.ccb-model-label { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.ccb-model-labelName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ccb-model-labelFacts { flex: none; color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; }
`
}

/** 积分弹层皮肤（官方 ui-chat stat-dialog 同配方；定位由组件按锚点算）。 */
export function buildCreditDialogCss(): string {
  return `/* 积分弹层：官方 .panel（定位由 pos 覆盖） */
.ccb-credit-dialog {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  width: max-content;
  min-width: min(260px, calc(100vw - 24px));
  max-width: min(440px, calc(100vw - 24px));
  padding: 16px;
  border: 0;
  border-radius: 12px;
  background: var(--dsw-specific-menu);
  /* --dsw-specific-menu 是半透明玻璃色，须同规则配对 backdrop-filter，否则背后文字透出来 */
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}
/* 官方 .title */
.ccb-credit-dialog-title {
  display: flex; justify-content: space-between; gap: 16px;
  margin-bottom: 8px;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}
/* 官方 .titleLabel（标不随文字压缩） */
.ccb-credit-dialog-title-label { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.ccb-credit-dialog-amount { font-variant-numeric: tabular-nums; }
.ccb-credit-dialog-rule { margin-bottom: 10px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
/* 官方 .details */
.ccb-credit-dialog-details {
  display: grid;
  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}
.ccb-credit-dialog-term { margin: 0; min-width: 0; }
/* 「每次调用」分组小标题（横跨两列） */
.ccb-credit-dialog-group { margin: 0; min-width: 0; grid-column: 1 / -1; padding-top: 4px; }
.ccb-credit-dialog-value { margin: 0; min-width: 0; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; text-align: right; }
/* 长模型 id 可任意位置换行，不撑破面板 */
.ccb-credit-dialog-model { margin: 0; min-width: 0; overflow-wrap: anywhere; }
`
}

/** 加载态容器（只有布局；颜色与转圈几何来自官方 StateDot）。 */
export function buildBusyDotCss(): string {
  return `/* 加载态：光秃秃一个官方转圈（文案挂在 aria-label 上） */
.ccb-busy-dot { display: inline-flex; align-items: center; }
`
}

/** 全部样式表文本（client half 统一注入）。 */
export function buildCodeBuddyCss(): string {
  return [
    buildIndicatorCss(),
    buildCardCss(),
    buildStatsCss(),
    buildTurnCreditCss(),
    buildModelLabelCss(),
    buildCreditDialogCss(),
    buildBusyDotCss(),
  ].join('\n')
}

/**
 * 注入 / 刷新本插件样式表并返回 `<style>`：marker 选择器让 HMR / 重载复用同一个标签
 * （不叠加第二份），调用方用 `ctx.effect` 在卸载时移除。
 */
export function injectCodeBuddyStyles(): HTMLStyleElement {
  const css = buildCodeBuddyCss()
  const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
  if (existing !== null) {
    if (existing.textContent !== css) existing.textContent = css
    return existing
  }
  const style = document.createElement('style')
  style.setAttribute('data-dsh-codebuddy-credits', '')
  style.textContent = css
  document.head.appendChild(style)
  return style
}
