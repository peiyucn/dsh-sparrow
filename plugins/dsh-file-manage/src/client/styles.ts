/** dsh-file-manage 客户端样式层：注入样式表 + 页面内联样式（官方设计 token；按 data 属性去重）。 @module dsh-file-manage/client/styles */

import type { CSSProperties } from 'react'

/** 注入页面 / 列表 / 确认框样式；HMR / 重载按 data 属性去重不叠加。 */
export function ensureFileManageStyles(): void {
  const css = `/* 主面板页面：官方入口型页面同款（居中内容列，整页滚动；标题行自带 28px 顶内边距，
   macOS 下再让出窗口顶带，故行自己的盒子就是窗口的拖拽几何）。 */
.dsh-file-manage-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: auto;
  padding: 0 clamp(24px, 4vw, 48px) 48px;
  color: var(--dsw-alias-label-primary);
  /* ⚠️ 基准字号必须自己给：中央列（.centerCol）**没有** font-size，官方入口型页面
     靠「每个文字元素各自写 font-size」立住；而本页原来挂在 sidebar.footer.action 槽里
     （DOM 在 SidebarRoot .root 内，那份 .root 有 font-size: 14px），改主面板后搬进中央列，
     没写字号的行就退回浏览器默认 **16px** —— owner 看到的就是「字变大了」。
     这里补回旧弹窗本来继承到的 14px 基准（官方 chrome 基准同为 14px），
     已显式声明字号的元素不受影响。 */
  font-size: 14px;
}
.dsh-file-manage-page > * {
  width: 100%;
  max-width: 960px;
}
.dsh-file-manage-page-head {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 28px;
  margin-bottom: 20px;
}
html[data-platform='darwin'] .dsh-file-manage-page-head {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-file-manage-page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
/* 合集品牌 footer：页面内容收尾。
   ⚠️ 必须自带 margin-top：列表容器（.dsh-file-manage-body）是最后一个兄弟，
   它下面直接就是这条 footer ⇒ 分割线会**贴着列表最后一行**（实测间距 0px，
   owner 报「分割线和上面都挨上了」）。旧浮层版 footer 在固定高度的面板里被
   body 的弹性撑开，搬进页面正常流后这层净空没了，所以要显式补回来。
   24px = 列表行 8px 下内边距之外再留出的呼吸（与页头 20px 下边距同档）。 */
.dsh-file-manage-page-footer {
  box-sizing: border-box;
  margin-top: 24px;
  padding: 16px 0 0;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  text-align: center;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
/* 整页 loading：首屏数据（列表 + 总数）落定前占满内容区，避免「打开后加载闪动」。
   ⚠️ 转动动画 / 配色 / 减动效兜底**全部来自官方 StateDot**（见 CloudFilesPage.tsx 顶部那段注释），
   这里没有任何 keyframes 或点阵几何。
   ⚠️ **只留转圈，不给可见文案**。文案改挂在 role="status" 的 aria-label 上，读屏器仍能念出来。 */
.dsh-file-manage-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  /* 只作 StateDot 自带着色失效时的继承兜底（转圈本身用官方 tertiary 中性色） */
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 页面滚动区：基底面上的滚动条用 l1 一族（原浮层版重绑过 l2，页面上不再需要）。 */
.dsh-file-manage-badge {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l2, #e2e5ea);
  border-radius: 999px;
  corner-shape: round;
  color: var(--dsw-alias-label-caption, #8a919f);
  font-size: 11px;
  line-height: 16px;
}
.dsh-file-manage-btn {
  /* 官方 Button.sm 同款几何：h28 + r14 胶囊（超椭圆角随官方全局规则自动生效）。 */
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l3, #d4d8e0);
  border-radius: 14px;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
}
.dsh-file-manage-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-file-manage-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-file-manage-btn-danger {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
/* 删除确认框：官方 Modal 原语提供遮罩 / 卡片 / Esc / 焦点回收，这里只保留本插件
   既有的正文排版与宽度（不自己造遮罩与对话框语义）。 */
.dsh-file-manage-confirm-dialog {
  width: min(480px, 100%);
}
.dsh-file-manage-confirm-desc {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-line;
}
.dsh-file-manage-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
/* 用量/进度条固定区：标题行下方、不随列表滚动。 */
.dsh-file-manage-summary {
  padding: 0 0 8px;
}
.dsh-file-manage-count {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 列表区块卡：存档页归档区/备份区同款 token（border-l2 + r12）。 */
.dsh-file-manage-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0 0 12px;
  padding: 8px 12px 12px;
  border: 0.5px solid var(--dsw-alias-border-l4, #e2e5ea);
  border-radius: 16px;
}
/* 配额容量条：加厚 + 未使用区斜纹（repeating-linear-gradient），与分割线区分；填充盖住斜纹。
   容量文字绝对定位居中叠加在条上。 */
.dsh-file-manage-quota-track {
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
.dsh-file-manage-quota-text {
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
  text-shadow: 0 0 4px var(--dsw-alias-bg-base, #ffffff);
  pointer-events: none;
}
.dsh-file-manage-quota-fill {
  height: 100%;
  /* 用量极小时（0.01% 量级）宽度趋近 0，兜底 4px 银条让「有使用」可见（网盘同款）。
     不加自身圆角：最小宽度下圆角会长成圆点、视觉鼓出轨道左端，改由轨道 overflow:hidden + 圆角裁切两端。 */
  min-width: 4px;
  background: var(--dsw-alias-state-business-primary);
  transition: width 220ms ease-out;
}
`
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-file-manage]')
  if (existing !== null) {
    // 同名去重命中时校验内容：HMR 升级后旧 style 可能残留过期规则，刷新之（与 archive 同款）。
    if (existing.textContent !== css) existing.textContent = css
    return
  }
  const style = document.createElement('style')
  style.dataset.dshFileManage = ''
  style.textContent = css
  document.head.appendChild(style)
}

/** 页面与行内联样式（对齐官方 Settings / Archive 的页面几何）。 */
export const styles = {
  body: {
    // 页面自身滚动（外层 .dsh-file-manage-page 已 overflow:auto），此处只做行内容器。
    flex: 'none',
    minHeight: 0,
    // 滚动条固定占位：卡片右缘不因滚动条出现/消失而左右漂移（与顶部进度条对齐）。
    scrollbarGutter: 'stable',
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
    /* ⚠️ 字号与行高都要**显式**给：本页已补 14px 基准，但行高若留 `normal`
       行盒只有约 16.8px，比官方同位置（列表标题 14px/20px）矮一档、
       行间距读起来发挤。官方列表标题的行高是 20px，这里对齐。 */
    fontSize: 14,
    lineHeight: '20px',
  } satisfies CSSProperties,
  secondarySmall: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    lineHeight: '18px',
  } satisfies CSSProperties,
} as const
