/** dsh-file-session 客户端样式层：注入样式表 + 面板内联样式（官方设计 token；按 data 属性去重）。 @module dsh-file-session/client/styles */

import type { CSSProperties } from 'react'

/** 注入触发键 / 面板 / 确认框样式；HMR / 重载按 data 属性去重不叠加。 */
export function ensureFileSessionStyles(): void {
  if (document.querySelector('style[data-dsh-file-session]') !== null) return
  const style = document.createElement('style')
  style.dataset.dshFileSession = ''
  style.textContent = `/* 官方 .footerActions 是横向 flex 行，slot 包裹层为行内 display:contents：
 * 多插件各自的全宽按钮会并排挤到右缘外（只剩一条边）。这里把包裹层改回真实盒子纵排，
 * Archive / 云端文件两个按钮上下堆叠、各自占满一行（!important 压过行内 contents）。 */
[data-slot='sidebar.footer.action'] {
  display: flex !important;
  flex-direction: column;
  /* 包裹层是 .footerActions 行容器里的 flex item，需显式撑满，否则两个全宽按钮按内容宽度收缩。 */
  width: 100%;
}
.dsh-file-session-trigger {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% + 4px);
  height: 42px;
  margin: 4px -2px;
  padding: 0 10px 0 8px;
  box-sizing: border-box;
  border: none;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
}
.dsh-file-session-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-trigger-rail {
  width: 36px;
  height: 36px;
  margin: 8px 0 10px;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50%;
}
.dsh-file-session-trigger-icon {
  flex: none;
}
.dsh-file-session-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 面板滚动区：官方 settings 同款——elevated surface 重绑 l2 滚动条 token（base 默认 l1，浮层上对比度不对）。 */
.dsh-file-session-body {
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
/* 面板头：官方 settings 面板同款（54px 高、标题起点 24px）。 */
.dsh-file-session-panel-header {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  height: 54px;
  padding: 20px 14px 8px 24px;
  box-sizing: border-box;
}
.dsh-file-session-panel-title {
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  color: var(--dsw-alias-label-primary);
}
.dsh-file-session-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 28px;
  outline: none;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-primary);
}
.dsh-file-session-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e5ea);
  border-radius: 999px;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
  line-height: 16px;
}
.dsh-file-session-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1, #d4d8e0);
  border-radius: 999px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-file-session-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-session-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-file-session-btn-danger {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
/* 删除确认框：官方 web 确认框同款（mask + 毛玻璃 + 480 卡片）。 */
.dsh-file-session-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.28));
  backdrop-filter: var(--dsw-mask-blur);
}
.dsh-file-session-confirm-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(480px, calc(100vw - 48px));
  padding: 20px;
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-2, #f6f7f9);
  color: var(--dsw-alias-label-primary, #1f2329);
  box-shadow: var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.22));
}
.dsh-file-session-confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}
.dsh-file-session-confirm-desc {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-line;
}
.dsh-file-session-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
/* 用量/进度条固定区：面板头下方、不随列表滚动；左侧 24px 与区块卡线框齐平，
   右侧额外让出滚动条宽度（列表区 scrollbar-gutter: stable 固定占位 8px）。 */
.dsh-file-session-summary {
  flex: none;
  padding: 12px calc(24px + var(--dsh-scrollbar-width, 8px)) 8px 24px;
}
.dsh-file-session-count {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 列表区块卡：存档页归档区/备份区同款 token（border-l2 + r12）。 */
.dsh-file-session-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0 0 12px;
  padding: 8px 12px 12px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e5ea);
  border-radius: 12px;
}
/* 配额容量条：加厚 + 未使用区斜纹（repeating-linear-gradient），与分割线区分；填充盖住斜纹。
   容量文字绝对定位居中叠加在条上。 */
.dsh-file-session-quota-track {
  position: relative;
  height: 16px;
  border-radius: 8px;
  background-color: var(--dsw-alias-interactive-bg-hover);
  background-image: repeating-linear-gradient(
    45deg,
    transparent 0px,
    transparent 5px,
    var(--dsw-alias-border-l1, #d4d8e0) 5px,
    var(--dsw-alias-border-l1, #d4d8e0) 7px
  );
  overflow: hidden;
}
.dsh-file-session-quota-text {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
  /* 高用量时蓝填充垫底，加一圈底色光晕保证可读。 */
  text-shadow: 0 0 4px var(--dsw-alias-bg-layer-2, #f6f7f9);
  pointer-events: none;
}
.dsh-file-session-quota-fill {
  height: 100%;
  /* 用量极小时（0.01% 量级）宽度趋近 0，兜底 4px 银条让「有使用」可见（网盘同款）。
     不加自身圆角：最小宽度下圆角会长成圆点、视觉鼓出轨道左端，改由轨道 overflow:hidden + 圆角裁切两端。 */
  min-width: 4px;
  background: var(--dsw-alias-state-business-primary);
  transition: width 220ms ease-out;
}
`
  document.head.appendChild(style)
}

/** 面板与行内联样式（对齐官方 Settings / Archive 的面板几何）。 */
export const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.28))',
    backdropFilter: 'var(--dsw-mask-blur)',
  } satisfies CSSProperties,
  panel: {
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column',
    width: 'min(800px, calc(100vw - 48px))',
    // 高度随内容自适应、上限钳到视口（官方 settings 同款上限）。
    maxHeight: 'min(800px, calc(100vh - 48px))',
    borderRadius: 24,
    overflow: 'hidden',
    padding: 0,
    background: 'var(--dsw-alias-bg-layer-2, #f6f7f9)',
    color: 'var(--dsw-alias-label-primary, #1f2329)',
    boxShadow: 'var(--dsw-shadow-lv3, 0 12px 40px rgba(0,0,0,0.22))',
  } satisfies CSSProperties,
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    // 滚动条固定占位：卡片右缘不因滚动条出现/消失而左右漂移（与顶部进度条对齐）。
    scrollbarGutter: 'stable',
    padding: '0 24px 24px',
  } satisfies CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid var(--dsw-alias-border-l1, #e2e5ea)',
  } satisfies CSSProperties,
  actions: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  } satisfies CSSProperties,
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies CSSProperties,
  secondarySmall: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    lineHeight: '18px',
  } satisfies CSSProperties,
  footerBar: {
    flex: 'none',
    display: 'flex',
    justifyContent: 'center',
    // 列表已包区块卡，不再加顶部分隔线（避免与卡片叠加显乱）。
    padding: '10px 24px 14px',
  } satisfies CSSProperties,
} as const
