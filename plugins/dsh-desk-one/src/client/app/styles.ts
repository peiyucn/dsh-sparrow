/** Page shell CSS: panel page, header, tabs, overview placeholder, error and retry button. */

export const APP_CSS = `

/* 主面板页面：官方入口型页面同款（标题行自带 28px 顶内边距，macOS 下让出窗口顶带）。
   ⚠️ 中央列不提供基准字号，页面根必须显式给 14px。
   便签墙要占满剩余高度：页面自身不滚动，滚动交给墙面。 */
.dsh-desk-page {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0 clamp(20px, 3vw, 40px) 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 14px;
}
/* 内容列统一限宽居中；悬浮操作组例外（不能吃 100% 宽，否则右定位会被推去左边）。 */
.dsh-desk-page > :not(.dsh-desk-fabstack) {
  width: 100%;
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
}
.dsh-desk-head {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 28px;
  margin-bottom: 8px;
  flex: none;
}
html[data-platform='darwin'] .dsh-desk-head {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-desk-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
.dsh-desk-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 标签栏：总览 / 便签墙 /（后续：任务板 / 日程 / 专注）。 */
.dsh-desk-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  margin-bottom: 12px;
  flex: none;
}
.dsh-desk-tab {
  appearance: none;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
}
.dsh-desk-tab:hover {
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsh-desk-tab[data-active='true'] {
  color: var(--dsw-alias-label-primary, #1f2329);
  border-bottom-color: var(--dsw-alias-label-primary, #1f2329);
  font-weight: 500;
}
/* 总览：内容尚未设计，S0 保持空白占位（owner 2026-11-06：先不投入）。 */
.dsh-desk-overview {
  flex: 1;
  min-height: 0;
}
.dsh-desk-error {
  flex: none;
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-desk-btn {
  appearance: none;
  align-self: flex-start;
  box-sizing: border-box;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  color: inherit;
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}
.dsh-desk-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
`
