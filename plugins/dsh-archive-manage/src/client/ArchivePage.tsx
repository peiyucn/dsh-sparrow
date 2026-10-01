/**
 * 归档会话管理**页面**（spec 16）：注册进官方 `main` keyed 槽，渲染在**中央列**
 * （对话区那块位置），与官方「插件」/「自动化任务」同形。
 *
 * ⚠️ 本视图**不再是弹窗**：没有遮罩、没有 `role='dialog'` / `aria-modal`、
 * 没有「点遮罩关闭」、没有焦点陷阱、没有关闭按钮 —— 离开的方式是官方那条
 * （点左栏会话项 / New Session）。二次确认仍走**官方 `Modal` 原语**
 * （与官方 `ui-schedule` / `ui-plugin-manager` 在各自主页面里做删除确认的方式一致）。
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { descendantLive, dropArchivedIds, isCollapsed, subtreeIdsOf, subtreeLive, trashSubagentTree, type ArchivedSessionItem, type TrashSubagentNode } from './archivedTree.js'
import { countVisibleRows } from './paging.js'

/** 分页窗口大小（spec 09）：每区每次渲染的行数上限，「加载更多」按此递增。 */
const ARCHIVE_PAGE_SIZE = 100
/** 会话进出事件的刷新防抖（spec 09）：多个会话释放事件合并成一次全量刷新。 */
const SESSIONS_CHANGED_DEBOUNCE_MS = 300

/** 归档树节点与本地变更纯逻辑：见 archivedTree.ts（零依赖纯模块，node:test 可直接导入）。 */
export type { ArchivedSessionItem } from './archivedTree.js'

export interface TrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly legacy: boolean
  /** 随父一起进回收站的子会话（sidecar v2 记账，展示用父子联动；还原/删除整棵走父条目）。
   *  parentSessionId 用于还原层级（spec 14）；旧条目没有该字段时按顶层平铺。 */
  readonly subagents?: ReadonlyArray<{ sessionId: string; title: string; parentSessionId?: string }>
}

export interface StraySessionItem {
  readonly sessionId: string
  readonly title: string
  readonly createdAt: number
  readonly blank: boolean
  /** 父会话已不存在的孤儿子会话（spec 08：按顶层对待）。 */
  readonly orphan: boolean
  readonly live: boolean
  readonly running: boolean
  readonly backendSupported: boolean
  readonly project?: string
  readonly turns?: number
  readonly tokens?: number
  readonly lastActiveAt?: number
  readonly sizeBytes?: number
}

/**
 * 写路由响应形状（与 host.ts 的路由契约一一对应）：
 * 变更成功后客户端靠响应里的 id 立刻本地摘掉受影响的行，不再等整页刷新落定。
 */
export interface TrashMutationResult {
  readonly ok?: boolean
  /** 本次回收站条目 id（回收站列表重载前用于对账）。 */
  readonly trashId?: string
  /** 随父会话一起进回收站的子会话 id（本地移除必须连带它们的行）。 */
  readonly subagentIds?: readonly string[]
}

export interface DeleteMutationResult {
  readonly ok?: boolean
  readonly deleted?: boolean
  /** 随父会话一起删除的子会话 id（本地移除必须连带它们的行）。 */
  readonly subagentIds?: readonly string[]
}

export interface TrashDeleteResult {
  readonly ok?: boolean
  readonly trashId?: string
}

/** 页面的注入面（业务动作；与旧入口逐项一致，只换了承载的槽位）。 */
export interface ArchivePanelInjected {
  listArchived: () => Promise<ArchivedSessionItem[]>
  listStrays: () => Promise<StraySessionItem[]>
  listTrashItems: () => Promise<TrashItem[]>
  /** 回收站实际存放目录（绝对路径 + 掩码后的展示路径），面板提示信息里明示卸载影响。 */
  trashDirPath: () => Promise<{ path: string; displayPath: string }>
  moveToTrash: (sessionId: string) => Promise<TrashMutationResult>
  unarchiveSession: (sessionId: string) => Promise<unknown>
  archiveSession: (sessionId: string) => Promise<unknown>
  deleteSession: (sessionId: string, confirmTitle: string, simple: boolean) => Promise<DeleteMutationResult>
  restoreTrashItem: (trashId: string) => Promise<unknown>
  deleteTrashItem: (trashId: string) => Promise<TrashDeleteResult>
  restoreAllTrash: () => Promise<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ trashId: string; message: string }> }>
  deleteAllTrash: () => Promise<{ deleted?: number; failed?: string[] }>
}

/** 页面组件 props：主面板 owner share + 注入动作 + locale 座位（框架组装）。 */
export type ArchivePanelProps = PropsRuntime<'main'> & InjectFace<ArchivePanelInjected> & PropsLocale<'archive-manage'>

/** 注入归档页面样式：官方入口型页面的居中内容列 + 归档树 + 按钮，按 data 属性去重。 */
export function ensureArchiveStyles(): void {
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
/* spec 08 归档树：父行折叠按钮 + 树状连接线。 */
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
/* 合集品牌 footer：页面内容收尾（原面板底部那条，移到页面末尾）。
   ⚠️ 分割线上方必须留净空：本页最后一个兄弟是区块卡，卡自带 margin-bottom 12px
   （它是「卡与卡之间」的间距，不是收尾净空），于是分割线离最后一行内容只有 12px，
   读起来像贴在一起。这里把收尾净空显式定成 24px，并让「紧邻 footer 的那张卡」
   不再贡献它自己的卡间距 —— 两处相加才是净空。
   ⚠️ 本页是 flex 纵列（.dsh-archive-page），**外边距不会合并**，
   所以 12 + 24 会真的变成 36；必须同时把那张卡的 margin-bottom 归零。
   （这与云端文件页的 24px 对齐，两页收尾观感一致。） */
.dsh-archive-section-card:has(+ .dsh-archive-page-footer) {
  margin-bottom: 0;
}
.dsh-archive-page-footer {
  box-sizing: border-box;
  margin-top: 24px;
  padding: 16px 0 0;
  border-top: 1px solid var(--dsw-alias-border-l1, #e2e5ea);
  text-align: center;
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
  const existing = document.querySelector<HTMLStyleElement>('style[data-dsh-archive-trigger]')
  if (existing !== null) {
    // 同名去重命中时校验内容：HMR 升级后旧 style 可能残留过期规则，刷新之（与 nav-pin 同款，审计建议）。
    if (existing.textContent !== css) existing.textContent = css
    return
  }
  const style = document.createElement('style')
  style.dataset.dshArchiveTrigger = ''
  style.textContent = css
  document.head.appendChild(style)
}

const styles = {
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
       行盒只有约 16.8px，比官方同位置（会话行标题 14px/20px）矮一档、
       行间距读起来发挤。官方列表标题的行高是 20px，这里对齐。 */
    fontSize: 14,
    lineHeight: '20px',
  } satisfies CSSProperties,
  secondarySmall: {
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
    fontSize: 12,
    /* ⚠️ 行高也要给：留 `normal` 时行盒只有约 16px，比官方次级文字（12px/18px）
       与云端文件页同款样式都矮 2px，两页并排看会不一致（实测过）。 */
    lineHeight: '18px',
  } satisfies CSSProperties,
  /** 子分组小标题（未释放）：官方面板分组标签同款（12px 次级色）。 */
  groupHeading: {
    margin: '10px 0 2px',
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 500,
    color: 'var(--dsw-alias-label-secondary, #6b7280)',
  } satisfies CSSProperties,
} as const

/** 待确认动作（web 确认框状态）。 */
type PendingConfirm =
  | { readonly kind: 'unarchive'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'trash'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'delete'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'trashStray'; readonly item: StraySessionItem }
  | { readonly kind: 'deleteStray'; readonly item: StraySessionItem }
  | { readonly kind: 'deleteTrashItem'; readonly item: TrashItem }
  | { readonly kind: 'restoreAll'; readonly restorable: number; readonly legacy: number }
  | { readonly kind: 'deleteAll'; readonly count: number }

interface ArchiveConfirmProps {
  readonly pending: PendingConfirm
  readonly t: TranslateNS<'archive-manage'>
  readonly onCancel: () => void
  /** 执行动作；成功后父级关闭确认框，失败 reject 并把错误显示在确认框内。 */
  readonly onSubmit: (typed: string) => Promise<void>
}

/**
 * 二次确认框：**官方 `Modal` 原语**提供遮罩、Esc、焦点回收与角色的语义
 * （与官方 ui-schedule / ui-plugin-manager 在主页面里做确认的方式一致）；
 * 提交后在框内展示处理中，成功后自动关闭。
 */
function ArchiveConfirm(props: ArchiveConfirmProps) {
  const { pending, t, onCancel, onSubmit } = props
  const [typed, setTyped] = useState('')
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const needsTyping = pending.kind === 'delete' || (pending.kind === 'deleteStray' && !pending.item.blank) || pending.kind === 'deleteAll'
  const phrase = t('confirm.deleteAllPhrase')
  const expected = pending.kind === 'delete' || pending.kind === 'deleteStray' ? pending.item.title.trim() : pending.kind === 'deleteAll' ? phrase : ''
  const title = pending.kind === 'unarchive' ? t('action.unarchive')
    : pending.kind === 'trash' || pending.kind === 'trashStray' ? t('action.trash')
    : pending.kind === 'delete' || pending.kind === 'deleteStray' || pending.kind === 'deleteTrashItem' ? t('action.deletePermanently')
      : pending.kind === 'restoreAll' ? t('action.restoreAll', { count: pending.restorable })
        : t('action.deleteAll')
  const description = pending.kind === 'unarchive' ? t('confirm.unarchive', { name: pending.item.title })
    : pending.kind === 'trash' || pending.kind === 'trashStray' ? t('confirm.trash', { name: pending.item.title })
    : pending.kind === 'delete' ? t('confirm.delete', { name: pending.item.title })
      : pending.kind === 'deleteStray'
        ? (pending.item.blank
          ? t('confirm.deleteStrayBlank', { name: pending.item.title })
          : t('confirm.delete', { name: pending.item.title }))
        : pending.kind === 'deleteTrashItem' ? t('confirm.deleteTrashItem', { name: pending.item.title })
          : pending.kind === 'restoreAll'
            ? (pending.legacy > 0
              ? t('confirm.restoreAll.withLegacy', { count: pending.restorable, legacy: pending.legacy })
              : t('confirm.restoreAll', { count: pending.restorable }))
            : t('confirm.deleteAll', { count: pending.count, phrase })
  const workingText = pending.kind === 'unarchive' ? t('confirm.unarchiving')
    : pending.kind === 'trash' || pending.kind === 'trashStray' ? t('confirm.movingToTrash')
    : pending.kind === 'restoreAll' ? t('confirm.restoring')
      : t('confirm.deleting')
  const ready = !working && (!needsTyping || typed.trim() === expected)
  const mismatch = !working && needsTyping && typed.trim() !== '' && typed.trim() !== expected

  useEffect(() => {
    setTyped('')
    setWorking(false)
    setFailure(null)
  }, [pending])

  const submit = (): void => {
    if (!ready) return
    setWorking(true)
    setFailure(null)
    void onSubmit(typed).catch((reason: unknown) => {
      setWorking(false)
      setFailure(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <Modal
      open
      // 处理中不许用遮罩 / Esc / 关闭键把确认框撤掉（请求未落定时状态会孤儿化）。
      onClose={() => { if (!working) onCancel() }}
      title={title}
      closeLabel={t('confirm.cancel')}
      className="dsh-archive-confirm-dialog"
    >
      <p className="dsh-archive-confirm-desc">{description}</p>
      {needsTyping ? (
        <>
          <input
            className="dsh-archive-confirm-input"
            style={{ marginTop: 12 }}
            type="text"
            value={typed}
            placeholder={pending.kind === 'delete' || pending.kind === 'deleteStray' ? pending.item.title : phrase}
            disabled={working}
            data-modal-autofocus
            onChange={(event) => { setTyped(event.currentTarget.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ready) {
                event.stopPropagation()
                submit()
              }
            }}
          />
          {mismatch ? (
            <p className="dsh-archive-confirm-hint" role="alert">
              {pending.kind === 'delete' || pending.kind === 'deleteStray' ? t('confirm.deleteMismatch') : t('confirm.deleteAllMismatch', { phrase })}
            </p>
          ) : null}
        </>
      ) : null}
      {working ? <p className="dsh-archive-confirm-status">{workingText}</p> : null}
      {failure !== null ? <p className="dsh-archive-confirm-hint" role="alert">{failure}</p> : null}
      <div style={{ ...styles.actions, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="button" className="dsh-archive-btn" disabled={working} onClick={onCancel}>{t('confirm.cancel')}</button>
        <button type="button" className="dsh-archive-btn dsh-archive-btn-danger" disabled={!ready} onClick={submit}>{title}</button>
      </div>
    </Modal>
  )
}

/** 创建龄文案的「一天」毫秒数。 */
const DAY_MS = 86_400_000
/** 复制成功反馈的展示时长。 */
const COPIED_FEEDBACK_MS = 2_000

/**
 * 主面板页面：中央列列出归档会话与回收站，进入时先显示加载态。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function ArchivePanel(props: ArchivePanelProps) {
  const { listArchived, listStrays, listTrashItems, trashDirPath, moveToTrash, unarchiveSession, archiveSession, deleteSession, restoreTrashItem, deleteTrashItem, restoreAllTrash, deleteAllTrash, t } = props
  // 初值即 loading：本页**挂载即打开**（无「打开」这一步），若初值是 false，
  // 首帧会先画一次空的归档区 / 回收站再被 effect 换成转圈 —— 那正是要避免的闪动。
  const [loading, setLoading] = useState(true)
  const [archived, setArchived] = useState<ArchivedSessionItem[]>([])
  const [strays, setStrays] = useState<StraySessionItem[]>([])
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [trashDir, setTrashDir] = useState<{ path: string; displayPath: string } | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(true)
  const [straysOpen, setStraysOpen] = useState(true)
  const [trashOpen, setTrashOpen] = useState(false)
  /** 已有数据时的后台刷新（写操作后 / 实时刷新事件）：列表保持挂载，只静默更新（防闪烁）。 */
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [copied, setCopied] = useState(false)
  /** 单会话还原进行中锁：连点会并发还原同一 trashId（2026-08-30 审计）。 */
  const [restoringId, setRestoringId] = useState<string | null>(null)
  /** 游离/孤儿会话归档进行中锁（spec 08）。 */
  const [archivingId, setArchivingId] = useState<string | null>(null)
  /** 归档树里被用户**显式展开**的父节点 id（spec 15：默认收起——空集即全部收起，
   *  与「跟踪折叠集合」相比默认值由数据结构表达，不靠初值预置）。 */
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())
  /** 回收站树被显式展开的父条目集合（键 = trashId，与归档树分开：两区互不干扰）。 */
  const [expandedTrashIds, setExpandedTrashIds] = useState<ReadonlySet<string>>(new Set())
  /** 三区分页窗口（spec 09）：数据刷新时复位，加载更多按页递增。 */
  const [archivedLimit, setArchivedLimit] = useState(ARCHIVE_PAGE_SIZE)
  const [straysLimit, setStraysLimit] = useState(ARCHIVE_PAGE_SIZE)
  const [trashLimit, setTrashLimit] = useState(ARCHIVE_PAGE_SIZE)

  // 刷新代际：快速切换面板产生并发 refresh 时，只让最新一次的结果落地（陈旧列表竞态）。
  const refreshSeqRef = useRef(0)
  /** 首屏是否已成功落过数据：决定刷新走「整页 loading」还是「静默更新」。 */
  const loadedRef = useRef(false)
  const refresh = async (): Promise<void> => {
    const seq = ++refreshSeqRef.current
    // 只有首屏（还没有任何数据）才占满内容区。写操作后的刷新改走 refreshing：
    // 此前每次刷新都把 loading 置真 → 内容区被 loading 替换 → 卸载再挂载，看起来就是「闪一下」。
    if (loadedRef.current) setRefreshing(true)
    else setLoading(true)
    try {
      const [nextArchived, nextStrays, nextTrashItems, nextTrashDir] = await Promise.all([
        listArchived(),
        listStrays(),
        listTrashItems(),
        trashDirPath().catch(() => null),
      ])
      if (seq !== refreshSeqRef.current) return
      setArchived(nextArchived)
      setStrays(nextStrays)
      setTrashItems(nextTrashItems)
      setTrashDir(nextTrashDir)
      // spec 09：新数据重置分页窗口（避免刷新后停在深层分页位）。
      setArchivedLimit(ARCHIVE_PAGE_SIZE)
      setStraysLimit(ARCHIVE_PAGE_SIZE)
      setTrashLimit(ARCHIVE_PAGE_SIZE)
      loadedRef.current = true
      setError(null)
    } catch (reason) {
      if (seq !== refreshSeqRef.current) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (seq === refreshSeqRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  // 复制完整回收站路径到剪贴板；成功给 2 秒「已复制」反馈。
  const copiedTimerRef = useRef<number | null>(null)
  const copyTrashDir = async (): Promise<void> => {
    if (trashDir === null) return
    try {
      await navigator.clipboard.writeText(trashDir.path)
      setCopied(true)
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = window.setTimeout(() => { setCopied(false) }, COPIED_FEEDBACK_MS)
    } catch {
      // 剪贴板不可用（非安全上下文等）：悬停 title 里始终有完整路径。
    }
  }
  useEffect(() => () => {
    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current)
  }, [])

  // 挂载即拉数据：本页在中央列按需挂载，离开面板即卸载，重新进入自然重取。
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => { void refreshRef.current() }, [])

  // 官方会话释放（fiber 销毁）→ 页面在屏时实时刷新，hold 标记即时清除（spec 08 §2.5）。
  // spec 09：300ms 防抖——批量释放会话时合并成一次全量刷新。
  useEffect(() => {
    let timer: number | null = null
    const onSessionsChanged = (): void => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void refreshRef.current() }, SESSIONS_CHANGED_DEBOUNCE_MS)
    }
    window.addEventListener('dsh-archive-sessions-changed', onSessionsChanged)
    return () => {
      window.removeEventListener('dsh-archive-sessions-changed', onSessionsChanged)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  const confirmTrash = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'trash', item })
  }

  const confirmUnarchive = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'unarchive', item })
  }

  const confirmDelete = (item: ArchivedSessionItem): void => {
    setPending({ kind: 'delete', item })
  }

  const confirmTrashStray = (item: StraySessionItem): void => {
    setPending({ kind: 'trashStray', item })
  }

  const confirmDeleteStray = (item: StraySessionItem): void => {
    setPending({ kind: 'deleteStray', item })
  }

  /** 游离/孤儿会话归档：父+子树一并归档（可逆操作，无二次确认；spec 08）。 */
  const archiveStray = async (item: StraySessionItem): Promise<void> => {
    if (loading || refreshing || archivingId !== null) return
    setArchivingId(item.sessionId)
    try {
      await archiveSession(item.sessionId)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setArchivingId(null)
    }
  }

  /** 创建龄文案：今天 / N 天前。 */
  const strayAge = (createdAt: number | undefined): string => {
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return ''
    const days = Math.floor((Date.now() - createdAt) / DAY_MS)
    return days <= 0 ? t('stray.ageToday') : t('stray.ageDays', { n: days })
  }

  /** 输出 token 数人类可读（1.2M / 30.8K / 512）。 */
  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  /** 文件大小人类可读。 */
  const formatBytes = (n: number): string => {
    if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${n} B`
  }

  /** 会话事实行：项目 · 轮数 · tok · 大小 · 时间（缺失项自动跳过）。 */
  const sessionFactLine = (item: { project?: string; turns?: number; tokens?: number; lastActiveAt?: number; sizeBytes?: number; createdAt: number }): string => {
    const parts = [
      item.project,
      item.turns !== undefined ? t('fact.turns', { n: item.turns }) : null,
      item.tokens !== undefined ? `${formatTokens(item.tokens)} tok` : null,
      item.sizeBytes !== undefined ? formatBytes(item.sizeBytes) : null,
      strayAge(item.lastActiveAt ?? item.createdAt),
    ].filter((part): part is string => typeof part === 'string' && part !== '')
    return parts.join(' · ')
  }

  /** 游离会话行：与归档行同构；空白会话带角标、删除走简化确认；孤儿打标；「归档」以父为单位（spec 08）。 */
  const renderStrayRow = (item: StraySessionItem) => {
    const locked = item.live
    const busy = archivingId === item.sessionId
    return (
      <div key={item.sessionId} style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.title} title={item.title}>{item.title}</div>
          <div style={styles.secondarySmall} title={item.sessionId}>
            {sessionFactLine(item)}
            {item.blank ? ` · ${t('stray.blankBadge')}` : ''}
            {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
            {item.running ? ` · ${t('state.running')}` : item.live ? (
              <>
                {' · '}
                <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>{t('state.unreleased')}</span>
              </>
            ) : ''}
            {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
          </div>
        </div>
        <div style={styles.actions}>
          <button
            type="button"
            className="dsh-archive-btn"
            disabled={loading || busy}
            onClick={() => { void archiveStray(item) }}
          >
            {busy ? t('confirm.archiving') : t('action.archive')}
          </button>
          <button
            type="button"
            className="dsh-archive-btn"
            disabled={loading || busy || !item.backendSupported || locked}
            title={locked ? t('state.unreleasedActionHint') : undefined}
            onClick={() => { confirmTrashStray(item) }}
          >
            {t('action.trash')}
          </button>
          <button
            type="button"
            className="dsh-archive-btn dsh-archive-btn-danger"
            disabled={loading || busy || !item.backendSupported || locked}
            title={locked ? t('state.unreleasedActionHint') : undefined}
            onClick={() => { confirmDeleteStray(item) }}
          >
            {t('action.deletePermanently')}
          </button>
        </div>
      </div>
    )
  }

  const confirmDeleteTrashItem = (item: TrashItem): void => {
    setPending({ kind: 'deleteTrashItem', item })
  }

  const restorableCount = trashItems.filter(item => !item.legacy).length
  const legacyCount = trashItems.length - restorableCount

  /** 回收站区父子层级（spec 14）：sidecar 的扁平清单 → 嵌套树，一次构建供全部行复用。 */
  const trashTrees = useMemo(
    () => new Map(trashItems.map(item => [item.trashId, trashSubagentTree(item.subagents ?? [])])),
    [trashItems],
  )

  // 未释放（本次 dsh 运行中驻留）的会话在归档区内分组前置；父级锁定看整棵子树
  // （subtreeLive 已下沉到 archivedTree.ts，判定有单测覆盖，spec 15）。
  const liveItems = archived.filter(item => subtreeLive(item))
  const coldItems = archived.filter(item => !subtreeLive(item))

  /** 展开/收起某父节点的子树（spec 15：集合里存的是「显式展开过」的 id）。 */
  const toggleExpanded = (sessionId: string): void => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  /** 展开/收起回收站父条目的子树（与归档树同一交互语义）。 */
  const toggleTrashExpanded = (trashId: string): void => {
    setExpandedTrashIds(prev => {
      const next = new Set(prev)
      if (next.has(trashId)) next.delete(trashId)
      else next.add(trashId)
      return next
    })
  }

  /** 归档树行：父行（深度 0）带操作按钮与折叠切换；子行缩进只读并带树状连接线（spec 08）。
   *  spec 09 分页预算：超出窗口的行返回 null，由父层 children 容器跳过空行渲染。 */
  const renderArchivedRow = (item: ArchivedSessionItem, depth = 0): ReactElement | null => {
    if (archivedRowsRendered >= archivedLimit) return null
    archivedRowsRendered += 1
    const locked = depth === 0 && subtreeLive(item)
    const hasChildren = item.children.length > 0
    const collapsed = isCollapsed(expandedIds, item.sessionId)
    const childrenBlock = hasChildren && !collapsed
      ? (() => {
        const emitted: ReactElement[] = []
        for (const child of item.children) {
          if (archivedRowsRendered >= archivedLimit) break
          const row = renderArchivedRow(child, depth + 1)
          if (row === null) continue
          emitted.push(row)
        }
        if (emitted.length === 0) return null
        return (
          <div className="dsh-archive-tree-children">
            {emitted.map((row, index) => (
              <div
                key={row.key}
                className={index === emitted.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {row}
              </div>
            ))}
          </div>
        )
      })()
      : null
    return (
      <div key={item.sessionId} className={hasChildren ? 'dsh-archive-tree-group' : undefined}>
        <div style={{
          ...styles.row,
          ...(depth > 0 || hasChildren ? { borderBottom: 'none', padding: '4px 0' } : {}),
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="dsh-archive-tree-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => { toggleExpanded(item.sessionId) }}
                >
                  <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
                </button>
              ) : (
                <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
              )}
              <div style={{ ...styles.title, minWidth: 0 }} title={item.title}>{item.title}</div>
            </div>
            <div style={{ ...styles.secondarySmall, paddingLeft: 20, marginTop: 2 }} title={item.sessionId}>
              {sessionFactLine(item)}
              {hasChildren ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>
                    {t('tree.childCount', { n: item.children.length })}
                  </span>
                </>
              ) : ''}
              {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
              {item.running ? ` · ${t('state.running')}` : item.live ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>{t('state.unreleased')}</span>
                </>
              ) : descendantLive(item) ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>{t('state.subagentUnreleased')}</span>
                </>
              ) : ''}
              {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
            </div>
          </div>
          {depth === 0 ? (
            <div style={styles.actions}>
              <button
                type="button"
                className="dsh-archive-btn"
                disabled={loading}
                onClick={() => { confirmUnarchive(item) }}
              >
                {t('action.unarchive')}
              </button>
              <button
                type="button"
                className="dsh-archive-btn"
                disabled={loading || !item.backendSupported || locked}
                title={locked ? t('state.unreleasedActionHint') : undefined}
                onClick={() => { confirmTrash(item) }}
              >
                {t('action.trash')}
              </button>
              <button
                type="button"
                className="dsh-archive-btn dsh-archive-btn-danger"
                disabled={loading || !item.backendSupported || locked}
                title={locked ? t('state.unreleasedActionHint') : undefined}
                onClick={() => { confirmDelete(item) }}
              >
                {t('action.deletePermanently')}
              </button>
            </div>
          ) : null}
        </div>
        {childrenBlock}
      </div>
    )
  }

  /** 回收站子行：任意深度缩进（父行由 sidecar 的 parentSessionId 还原，spec 14）。
   *  spec 09 分页预算：超出窗口的行返回 null。 */
  const renderTrashChildRow = (node: TrashSubagentNode): ReactElement | null => {
    if (trashRowsRendered >= trashLimit) return null
    trashRowsRendered += 1
    const nested = node.children.length > 0
      ? (() => {
        const emitted: ReactElement[] = []
        for (const child of node.children) {
          const row = renderTrashChildRow(child)
          if (row === null) continue
          emitted.push(row)
        }
        if (emitted.length === 0) return null
        return (
          <div className="dsh-archive-tree-children">
            {emitted.map((row, index) => (
              <div
                key={row.key}
                className={index === emitted.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {row}
              </div>
            ))}
          </div>
        )
      })()
      : null
    return (
      <div key={node.item.sessionId}>
        <div style={{ ...styles.row, borderBottom: 'none', padding: '4px 0' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
              <div style={{ ...styles.title, minWidth: 0 }} title={node.item.title}>{node.item.title}</div>
            </div>
            <div style={{ ...styles.secondarySmall, paddingLeft: 20, marginTop: 2 }} title={node.item.sessionId}>{node.item.sessionId}</div>
          </div>
        </div>
        {nested}
      </div>
    )
  }

  /** 回收站树行：父行带恢复/彻底删除与折叠切换，子行缩进只读（任意深度）
   *  （与归档树同款交互；还原/删除整棵走父条目的 sidecar）。
   *  spec 09 分页预算：超出窗口的行返回 null。 */
  const renderTrashRow = (item: TrashItem): ReactElement | null => {
    if (trashRowsRendered >= trashLimit) return null
    trashRowsRendered += 1
    const children = trashTrees.get(item.trashId) ?? []
    const hasChildren = children.length > 0
    const collapsed = isCollapsed(expandedTrashIds, item.trashId)
    const childrenBlock = hasChildren && !collapsed
      ? (() => {
        const emitted: ReactElement[] = []
        for (const child of children) {
          const row = renderTrashChildRow(child)
          if (row === null) continue
          emitted.push(row)
        }
        if (emitted.length === 0) return null
        return (
          <div className="dsh-archive-tree-children">
            {emitted.map((row, index) => (
              <div
                key={row.key}
                className={index === emitted.length - 1
                  ? 'dsh-archive-tree-node dsh-archive-tree-node-last'
                  : 'dsh-archive-tree-node'}
              >
                {row}
              </div>
            ))}
          </div>
        )
      })()
      : null
    return (
      <div key={item.trashId} className={hasChildren ? 'dsh-archive-tree-group' : undefined}>
        <div style={{ ...styles.row, ...(hasChildren ? { borderBottom: 'none', padding: '4px 0' } : {}) }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {hasChildren ? (
                <button
                  type="button"
                  className="dsh-archive-tree-toggle"
                  aria-expanded={!collapsed}
                  onClick={() => { toggleTrashExpanded(item.trashId) }}
                >
                  <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
                </button>
              ) : (
                <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
              )}
              <div style={{ ...styles.title, minWidth: 0 }} title={item.title}>{item.title}</div>
            </div>
            <div style={styles.secondarySmall} title={item.sessionId}>
              {item.legacy ? `${t('legacy.badge')} · ` : ''}{item.archivedAt}
              {hasChildren ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)' }}>
                    {t('tree.childCount', { n: children.length })}
                  </span>
                </>
              ) : ''}
            </div>
          </div>
          <div style={styles.actions}>
            <button
              type="button"
              className="dsh-archive-btn"
              disabled={loading || item.legacy || restoringId !== null}
              title={item.legacy ? t('legacy.restoreTitle') : undefined}
              onClick={() => {
                if (restoringId !== null) return
                setRestoringId(item.trashId)
                void (async () => {
                  try {
                    await restoreTrashItem(item.trashId)
                    await refresh()
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : String(reason))
                  } finally {
                    setRestoringId(null)
                  }
                })()
              }}
            >
              {t('action.restore')}
            </button>
            <button
              type="button"
              className="dsh-archive-btn dsh-archive-btn-danger"
              disabled={loading || restoringId !== null}
              onClick={() => { confirmDeleteTrashItem(item) }}
            >
              {t('action.deletePermanently')}
            </button>
          </div>
        </div>
        {childrenBlock}
      </div>
    )
  }

  const confirmRestoreAll = (): void => {
    setPending({ kind: 'restoreAll', restorable: restorableCount, legacy: legacyCount })
  }

  const confirmDeleteAll = (): void => {
    setPending({ kind: 'deleteAll', count: trashItems.length })
  }

  /**
   * 确认框提交：动作全程在确认框内展示处理中，成功后由这里关闭；
   * 失败（含批量部分失败）reject 回确认框展示错误。
   *
   * 单条分支不等整页刷新：写操作必然打穿 host 的 header 缓存，紧随其后的刷新要走冷扫描
   * （列表越大越慢），此前条目与确认框都干等它落定。改为变更成功后立即按响应里的 id 本地摘掉
   * 受影响的行并关闭确认框，refresh() 退到后台对账。摘除集合与 host 完全一致——响应里的 subagentIds
   * 就是随父一起搬走/删掉的**全部后代**子会话（任意深度，见 spec 12），由 refresh 落定。
   * 失败路径语义不变：变更 reject 时本地状态一律不动，错误仍回确认框展示。
   */
  const submitConfirm = async (typed: string): Promise<void> => {
    if (pending === null) return
    const kind = pending.kind
    if (kind === 'unarchive') {
      const item = pending.item
      await unarchiveSession(item.sessionId)
      // 子会话由 host 的父子对齐异步移出归档集；本地先按已知子树摘，收敛结果一致。
      const removed = new Set(subtreeIdsOf(item))
      setArchived(prev => dropArchivedIds(prev, removed))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'trash' || kind === 'trashStray') {
      const sessionId = pending.item.sessionId
      const result = await moveToTrash(sessionId)
      const removed = new Set([sessionId, ...result.subagentIds ?? []])
      setArchived(prev => dropArchivedIds(prev, removed))
      setStrays(prev => prev.filter(stray => !removed.has(stray.sessionId)))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'delete') {
      const sessionId = pending.item.sessionId
      const result = await deleteSession(sessionId, typed, false)
      const removed = new Set([sessionId, ...result.subagentIds ?? []])
      setArchived(prev => dropArchivedIds(prev, removed))
      setStrays(prev => prev.filter(stray => !removed.has(stray.sessionId)))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'deleteStray') {
      const item = pending.item
      const result = await deleteSession(item.sessionId, item.blank ? '' : typed, item.blank)
      const removed = new Set([item.sessionId, ...result.subagentIds ?? []])
      setArchived(prev => dropArchivedIds(prev, removed))
      setStrays(prev => prev.filter(stray => !removed.has(stray.sessionId)))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'deleteTrashItem') {
      const trashId = pending.item.trashId
      const result = await deleteTrashItem(trashId)
      const removedTrashId = result.trashId ?? trashId
      setTrashItems(prev => prev.filter(item => item.trashId !== removedTrashId))
      setPending(null)
      void refresh()
      return
    }
    if (kind === 'restoreAll') {
      const result = await restoreAllTrash()
      const problems: string[] = []
      const skipped = result.skippedLegacy ?? 0
      const failed = result.failed?.length ?? 0
      if (skipped > 0) problems.push(t('notice.skippedLegacy', { count: skipped }))
      if (failed > 0) problems.push(t('notice.failed', { count: failed }))
      await refresh()
      if (problems.length > 0) throw new Error(problems.join(' · '))
      setPending(null)
      return
    }
    const result = await deleteAllTrash()
    const problems: string[] = []
    const failed = result.failed?.length ?? 0
    if (failed > 0) problems.push(t('notice.failed', { count: failed }))
    await refresh()
    if (problems.length > 0) throw new Error(problems.join(' · '))
    setPending(null)
  }

  // spec 09 分页预算：每次渲染复位（renderArchivedRow/renderTrashRow 超出窗口返回 null）；
  // 总数用于「加载更多」显隐。树结构不变，分页只裁剪渲染窗口。
  // spec 15：默认可视行只剩父行，窗口预算不再被未展开的子行吃掉。
  let archivedRowsRendered = 0
  let trashRowsRendered = 0
  const archivedTotal = countVisibleRows(liveItems, item => item.children, item => isCollapsed(expandedIds, item.sessionId))
    + countVisibleRows(coldItems, item => item.children, item => isCollapsed(expandedIds, item.sessionId))
  const trashTotal = trashItems.reduce((total, item) => {
    const children = item.subagents?.length ?? 0
    return total + 1 + (isCollapsed(expandedTrashIds, item.trashId) ? 0 : children)
  }, 0)

  return (
    <section className="dsh-archive-page" data-archive-panel aria-busy={refreshing}>
      {/* 标题行自带 28px 顶内边距并打上窗口拖拽标记：内容不再有遮罩，页面顶端就是窗口边缘。 */}
      <header className="dsh-archive-page-head" data-window-drag>
        <h1 className="dsh-archive-page-title">{t('dialog.title')}</h1>
      </header>

      {loading ? (
        <div className="dsh-archive-loading" role="status" aria-label={t('loading')}>
          <StateDot state="ongoing" />
        </div>
      ) : (
        <>
          {error !== null ? (
            <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary, #c62828)', margin: '0 0 12px' }}>
              {error}
              {' '}
              <button type="button" className="dsh-archive-btn" onClick={() => { void refresh() }}>{t('retry')}</button>
            </p>
          ) : null}

          <div className="dsh-archive-section-card">
            <button
              type="button"
              className="dsh-archive-section"
              aria-expanded={archivedOpen}
              onClick={() => { setArchivedOpen(value => !value) }}
            >
              <span aria-hidden>{archivedOpen ? '▾' : '▸'}</span>
              <span>{t('section.archived', { count: archived.length })}</span>
            </button>
            {archivedOpen ? (
              <>
                {archived.length === 0 ? <p style={styles.secondarySmall}>{t('empty.archived')}</p> : null}
                {liveItems.length > 0 ? (
                  <>
                    <p style={styles.groupHeading}>{t('group.unreleased', { count: liveItems.length })}</p>
                    {liveItems.map(item => renderArchivedRow(item))}
                  </>
                ) : null}
                {coldItems.map(item => renderArchivedRow(item))}
                {archivedTotal > archivedLimit ? (
                  <button
                    type="button"
                    className="dsh-archive-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => { setArchivedLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}
                  >
                    {t('pager.loadMore', { remaining: archivedTotal - archivedLimit })}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          {strays.length > 0 ? (
            <div className="dsh-archive-section-card">
              <button
                type="button"
                className="dsh-archive-section"
                aria-expanded={straysOpen}
                onClick={() => { setStraysOpen(value => !value) }}
              >
                <span aria-hidden>{straysOpen ? '▾' : '▸'}</span>
                <span>{t('section.strays', { count: strays.length })}</span>
              </button>
              {straysOpen ? (
                <>
                  <p style={styles.secondarySmall}>{t('stray.hint')}</p>
                  {strays.slice(0, straysLimit).map(renderStrayRow)}
                  {strays.length > straysLimit ? (
                    <button
                      type="button"
                      className="dsh-archive-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => { setStraysLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}
                    >
                      {t('pager.loadMore', { remaining: strays.length - straysLimit })}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="dsh-archive-section-card">
            <button
              type="button"
              className="dsh-archive-section"
              aria-expanded={trashOpen}
              onClick={() => { setTrashOpen(value => !value) }}
            >
              <span aria-hidden>{trashOpen ? '▾' : '▸'}</span>
              <span>{t('section.trash', { count: trashItems.length })}</span>
            </button>
            {trashOpen ? (
              <>
                {/* 回收站位置归回收站区（页面顶部不放全局行）；点击复制完整路径。 */}
                {trashDir !== null && trashDir.displayPath !== '' ? (
                  <p style={styles.secondarySmall}>
                    {t('dialog.trashDir')}
                    {' '}
                    <button
                      type="button"
                      className="dsh-archive-trash-dir"
                      title={`${trashDir.path}（${t('dialog.copyHint')}）`}
                      onClick={() => { void copyTrashDir() }}
                    >
                      {trashDir.displayPath}
                      {copied ? ` ✓${t('dialog.copied')}` : ''}
                    </button>
                  </p>
                ) : null}
                <p style={styles.secondarySmall}>{t('trash.hint')}</p>
                {trashItems.length > 0 ? (
                  <div style={{ ...styles.actions, padding: '4px 0 8px' }}>
                    <button
                      type="button"
                      className="dsh-archive-btn"
                      disabled={loading || restorableCount === 0 || restoringId !== null}
                      onClick={() => { confirmRestoreAll() }}
                    >
                      {t('action.restoreAll', { count: restorableCount })}
                    </button>
                    <button
                      type="button"
                      className="dsh-archive-btn dsh-archive-btn-danger"
                      disabled={loading || trashItems.length === 0 || restoringId !== null}
                      onClick={() => { confirmDeleteAll() }}
                    >
                      {t('action.deleteAll')}
                    </button>
                  </div>
                ) : null}
                {trashItems.length > 0 ? (
                  <p role="note" style={{ color: 'var(--dsw-alias-state-warn-primary, #d9822b)', fontSize: 12, lineHeight: '18px', margin: '0 0 4px' }}>
                    {t('trash.uninstallHint')}
                  </p>
                ) : null}
                {trashItems.length === 0 ? <p style={styles.secondarySmall}>{t('empty.trash')}</p> : null}
                {trashItems.some(item => item.legacy) ? (
                  <p style={styles.secondarySmall}>
                    {t('legacy.hint')}
                  </p>
                ) : null}
                {trashItems.map(renderTrashRow)}
                {trashTotal > trashLimit ? (
                  <button
                    type="button"
                    className="dsh-archive-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => { setTrashLimit(limit => limit + ARCHIVE_PAGE_SIZE) }}
                  >
                    {t('pager.loadMore', { remaining: trashTotal - trashLimit })}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>

          {/* 合集品牌 footer：页面内容收尾。 */}
          <div className="dsh-archive-page-footer">🐦 dsh-sparrow</div>
        </>
      )}

      {pending !== null ? (
        <ArchiveConfirm
          pending={pending}
          t={t}
          onCancel={() => { setPending(null) }}
          onSubmit={submitConfirm}
        />
      ) : null}
    </section>
  )
}
