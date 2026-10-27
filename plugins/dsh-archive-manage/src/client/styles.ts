/**
 * 归档页样式表（纯 CSS 文本，由 client half 注入）：页头、归档树 / 回收站树、按钮、确认框与署名。
 * 拆成独立模块：node:test 可脱离 React 组件直接验证注入 / 复用 / 移除。
 */

import { STYLE_SELECTOR } from '../constants.js'

/** 注入样式表并返回 style 元素；调用方负责在卸载时移除。 */
export function ensureArchiveStyles(): HTMLStyleElement {
  const css = `
/* 主面板页面：官方入口型页面同款（居中内容列，整页滚动；标题行自带 28px 顶内边距，
   macOS 下再让出窗口顶带，故行自己的盒子就是窗口的拖拽几何）。 */
.dsh-archive-page {
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
  /* 基底面上的滚动条用 l1 一族（原浮层版重绑过 l2，页面上不再需要）。 */
}
.dsh-archive-page > * {
  width: 100%;
  max-width: 960px;
}
.dsh-archive-page-head {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-top: 28px;
  margin-bottom: 20px;
}
html[data-platform='darwin'] .dsh-archive-page-head {
  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));
}
.dsh-archive-page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  line-height: 28px;
}
/* 归档树：父行折叠按钮 + 树状连接线。 */
.dsh-archive-tree-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 12px;
  line-height: 1;
}
.dsh-archive-tree-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.dsh-archive-tree-toggle-spacer {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}
/* 分组线：父会话与其全部子会话视为一个整体块，分割线画在整块底部（父行自身不再画线）。
   组内用 L 形连接线：竖线**由每个子节点自己画一段**（见 .dsh-archive-tree-node::after），
   每个子节点一根 14px 横连钉在标题行中线（子行 padding-top 4px + 行高 22px → 15px）。

   ⚠️ 竖线**不能**画成子区容器的 border-left：那样它在**末节点底部**仍会往下拖出一截，
   于是需要一个「用面板底色盖掉残段」的补丁（.dsh-archive-tree-node-last::after）。
   那个补丁只在「与父面**逐像素**同色」时成立 —— 而 dsh-theme-tone 会给抬升面
   叠一层**颗粒与光**，父面不再是纯色：一条纯色的遮盖带盖在带颗粒的面上，
   就露成**一条白线**（owner 2026-09-20 报「看见蓝框里那个白线了么…官方纯白色调因为同色所以看不见」）。
   改成每节点自画竖段后，**没有任何一处依赖「与父面同色」**，色调插件怎么给质感都不会破。
   （本段在模板字符串里，注释中不能出现反引号。） */
.dsh-archive-tree-children {
  margin-left: 10px;
  padding-left: 14px;
}
.dsh-archive-tree-group {
  border-bottom: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
.dsh-archive-tree-node {
  position: relative;
}
/* 横连：从竖线右侧 14px，钉在标题行中线。 */
.dsh-archive-tree-node::before {
  content: '';
  position: absolute;
  left: -14px;
  top: 15px;
  width: 14px;
  height: 0;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
}
/* 竖段：每个节点自己画一段，从节点顶接续到**下一个**节点的肘部。
   非末节点 ⇒ 贯通整行（bottom: 0），线才能接到下一个孩子；
   末节点 ⇒ 只画到自己的肘部（见下一条），于是竖线在此**自然收口**，无需任何遮盖。
   横坐标 left: -15px 与原先子区容器 border-left 的位置逐像素一致。 */
.dsh-archive-tree-node::after {
  content: '';
  position: absolute;
  left: -15px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--dsw-alias-border-l1, #e2e5ea);
}
/* 末节点：竖线止于肘部（横连在 top:15px，故画到 16px 正好接上）。 */
.dsh-archive-tree-node-last::after {
  bottom: auto;
  height: 16px;
}
.dsh-archive-btn {
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
.dsh-archive-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-archive-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-archive-btn-danger {
  color: var(--dsw-alias-state-error-primary, #c62828);
}
.dsh-archive-section {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 40px;
  /* 官方 settings 导航单元规格：pad (9,16,9,12)、字重 400。 */
  padding: 9px 16px 9px 12px;
  margin: 0 0 4px -12px;
  box-sizing: border-box;
  border: none;
  outline: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
/* 区块标题行（归档区 / 回收站）不做 hover 底色：它只是折叠开关，泛底色会被读成
   "这一行被选中/可选"。owner 2026-09-29 口径。 */
/* 区块卡：官方 settings 内容卡同款 token（ModelsSection .rowCard：border-l2 + r12），
   归档区 / 回收站各包一块，视觉上分割两组列表；应用无全局 border-box，须显式声明。 */
.dsh-archive-section-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  margin: 0 0 12px;
  padding: 8px 12px 12px;
  border: 0.5px solid var(--dsw-alias-border-l4, #e2e5ea);
  border-radius: 16px;
}
/* 分组头横贯卡内两侧、文字与行内容左对齐（卡内边距 12px）。 */
.dsh-archive-section-card .dsh-archive-section {
  width: calc(100% + 24px);
  margin: 0 -12px 4px -12px;
}
/* 二次确认框：官方 Modal 原语提供遮罩 / 卡片 / Esc / 焦点回收，这里只保留
   本插件既有的正文排版与几何（不自己造遮罩与对话框语义）。 */
.dsh-archive-confirm-dialog {
  width: min(480px, 100%);
  max-height: calc(100dvh - 48px);
}
.dsh-archive-confirm-desc {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary, #6b7280);
  white-space: pre-line;
}
.dsh-archive-confirm-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1, #d4d8e0);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 20px;
  outline: none;
}
.dsh-archive-confirm-input:focus {
  border-color: var(--dsw-alias-button-info-fill, #4d6bfe);
}
.dsh-archive-confirm-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary, #c62828);
}
/* 回收站路径按钮：掩码展示，点击复制完整路径（悬停 title 给全文）。 */
.dsh-archive-trash-dir {
  display: inline;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-button-info-fill, #4d6bfe);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
  word-break: break-all;
}
.dsh-archive-trash-dir:hover {
  text-decoration: underline;
}
.dsh-archive-confirm-status {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
/* 合集品牌 footer：署名行，钉在页面左下角、与侧边栏底部「设置」入口对齐
   （owner 2026-10-07：「有点太高了，最好和左边栏下面的设置按钮对齐」）。
   * margin-top: auto —— 本页是 flex 纵列（.dsh-archive-page）且 height: 100%，
     故**内容不满一屏时署名被推到页面底部**、内容超高时它自然跟在内容之后。
   * text-align: left —— 与页标题、区块卡共用同一个左边缘。
   * **无分割线**：那条 1px 通栏线比 11px 的署名重得多，先被看到的是线而不是字。
   * padding-top: 24px —— 内容超高（署名跟在内容之后）时的**最小**净空，
     以及紧邻卡片的自带卡间距（12px）之外再留的呼吸。
     不能用 margin-top 顶替：margin-top: auto 与固定 margin 不能共存。
   ⚠️ 本页是 flex 纵列、**外边距不合并** ⇒ 紧邻 footer 的那张卡要归零，否则 12+24=36。
   * **margin-bottom: -25px —— 与侧边栏「设置」行对齐的那一段**。本页沿用官方入口型页面
     的 padding-bottom: 48px；不抵消的话署名中心落在「视口底部 −56.5px」，而侧边栏设置行
     的文字中心在「视口底部 −31.5px」（实测 720/800/900/1080 四种窗口高度下都是这个值 ——
     设置行贴着窗口底排，与窗口高度无关）⇒ 差值 25px 就是把署名往下拉的距离。
     ⚠️ 这个 −25 不是随手写的：**它依赖「本页 padding-bottom 48px」+「侧边栏设置行文字中心
     距底 31.5px」两个外部事实**。任一改变（官方给入口页换下内边距、设置行改高、或本页
     自己改 padding-bottom）都要重算，否则署名会重新错位。改前先量，别按感觉调。 */
.dsh-archive-section-card:has(+ .dsh-archive-page-footer) {
  margin-bottom: 0;
}
.dsh-archive-page-footer {
  box-sizing: border-box;
  margin-top: auto;
  margin-bottom: -25px;
  padding-top: 24px;
  text-align: left;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary, #8a919f);
}
/* 整页 loading：四个初始请求（归档/游离/回收站/回收站目录）都落定前占满内容区，
   避免「打开后加载闪动」。
   ⚠️ 转动动画 / 配色 / 减动效兜底**全部来自官方 StateDot**（沿用原实现的做法），
   这里没有任何 keyframes 或点阵几何。
   ⚠️ **只留转圈，不给可见文案**。官方 StateDot(state=ongoing) 基本都是光秃秃一个转圈
   （替换图标那种用法）。文案改挂在 role="status" 的 aria-label 上，读屏器仍能念出来。 */
.dsh-archive-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  /* 只作 StateDot 自带着色失效时的继承兜底（转圈本身用官方 tertiary 中性色） */
  color: var(--dsw-alias-label-secondary, #6b7280);
}
`
  // HMR / 重复安装命中旧标签时刷新内容，而不是再叠一张样式表。
  const existing = document.querySelector<HTMLStyleElement>(STYLE_SELECTOR)
  if (existing !== null) {
    if (existing.textContent !== css) existing.textContent = css
    return existing
  }
  const style = document.createElement('style')
  style.dataset.dshArchiveTrigger = ''
  style.textContent = css
  document.head.appendChild(style)
  return style
}
