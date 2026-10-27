/**
 * 归档 / 游离 / 回收站三区的行渲染器。
 * 用**渲染函数**而非 React 组件：分页预算（`RowBudget.remaining`）必须由递归子行在父行渲染过程中同步消费，组件要等父级返回后才被 React 调用，预算会晚一拍、与旧行为不一致。
 */

import type { ReactElement } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { StraySessionItem, TrashEntry } from '../contract.js'
import { descendantLive, isCollapsed, subtreeLive, type ArchivedSessionItem, type TrashSubagentNode } from './archivedTree.js'
import { sessionFactLine } from './format.js'
import { pageStyles } from './styles.js'

/** 渲染预算：每次渲染新建一个，超出窗口的行返回 null（与旧的可变计数器同语义）。 */
export interface RowBudget {
  remaining: number
}

export interface ArchivedRowsContext {
  readonly t: TranslateNS<'archive-manage'>
  readonly loading: boolean
  readonly expandedIds: ReadonlySet<string>
  readonly onToggle: (sessionId: string) => void
  readonly onUnarchive: (item: ArchivedSessionItem) => void
  readonly onTrash: (item: ArchivedSessionItem) => void
  readonly onDelete: (item: ArchivedSessionItem) => void
}

/** 归档树行：父行（深度 0）带操作按钮与折叠切换；子行缩进只读并带树状连接线。 */
export function renderArchivedRow(
  ctx: ArchivedRowsContext,
  item: ArchivedSessionItem,
  budget: RowBudget,
  depth = 0,
): ReactElement | null {
  const { t, loading } = ctx
  if (budget.remaining <= 0) return null
  budget.remaining -= 1
  const locked = depth === 0 && subtreeLive(item)
  const hasChildren = item.children.length > 0
  const collapsed = isCollapsed(ctx.expandedIds, item.sessionId)
  const childrenBlock = hasChildren && !collapsed
    ? (() => {
      const emitted: ReactElement[] = []
      for (const child of item.children) {
        if (budget.remaining <= 0) break
        emitted.push(renderArchivedRow(ctx, child, budget, depth + 1) as ReactElement)
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
      <div style={depth > 0 || hasChildren ? pageStyles.treeRow : pageStyles.row}>
        <div style={pageStyles.shrink}>
          <div style={pageStyles.treeTitleRow}>
            {hasChildren ? (
              <button
                type="button"
                className="dsh-archive-tree-toggle"
                aria-expanded={!collapsed}
                onClick={() => { ctx.onToggle(item.sessionId) }}
              >
                <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
              </button>
            ) : (
              <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
            )}
            <div style={pageStyles.treeTitle} title={item.title}>{item.title}</div>
          </div>
          <div style={pageStyles.treeFactLine} title={item.sessionId}>
            {sessionFactLine(t, item)}
            {hasChildren ? (
              <>
                {' · '}
                <span style={pageStyles.warnText}>
                  {t('tree.childCount', { n: item.children.length })}
                </span>
              </>
            ) : ''}
            {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
            {item.running ? ` · ${t('state.running')}` : item.live ? (
              <>
                {' · '}
                <span style={pageStyles.warnText}>{t('state.unreleased')}</span>
              </>
            ) : descendantLive(item) ? (
              <>
                {' · '}
                <span style={pageStyles.warnText}>{t('state.subagentUnreleased')}</span>
              </>
            ) : ''}
            {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
          </div>
        </div>
        {depth === 0 ? (
          <div style={pageStyles.actions}>
            <button
              type="button"
              className="dsh-archive-btn"
              disabled={loading}
              onClick={() => { ctx.onUnarchive(item) }}
            >
              {t('action.unarchive')}
            </button>
            <button
              type="button"
              className="dsh-archive-btn"
              disabled={loading || !item.backendSupported || locked}
              title={locked ? t('state.unreleasedActionHint') : undefined}
              onClick={() => { ctx.onTrash(item) }}
            >
              {t('action.trash')}
            </button>
            <button
              type="button"
              className="dsh-archive-btn dsh-archive-btn-danger"
              disabled={loading || !item.backendSupported || locked}
              title={locked ? t('state.unreleasedActionHint') : undefined}
              onClick={() => { ctx.onDelete(item) }}
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

export interface StrayRowsContext {
  readonly t: TranslateNS<'archive-manage'>
  readonly loading: boolean
  readonly archivingId: string | null
  readonly onArchive: (item: StraySessionItem) => void
  readonly onTrash: (item: StraySessionItem) => void
  readonly onDelete: (item: StraySessionItem) => void
}

/** 游离会话行：与归档行同构；空白会话带角标、删除走简化确认；孤儿打标；「归档」以父为单位。 */
export function renderStrayRow(ctx: StrayRowsContext, item: StraySessionItem): ReactElement {
  const { t, loading } = ctx
  const locked = item.live
  const busy = ctx.archivingId === item.sessionId
  return (
    <div key={item.sessionId} style={pageStyles.row}>
      <div style={pageStyles.shrink}>
        <div style={pageStyles.title} title={item.title}>{item.title}</div>
        <div style={pageStyles.secondarySmall} title={item.sessionId}>
          {sessionFactLine(t, item)}
          {item.blank ? ` · ${t('stray.blankBadge')}` : ''}
          {item.orphan ? ` · ${t('stray.orphanBadge')}` : ''}
          {item.running ? ` · ${t('state.running')}` : item.live ? (
            <>
              {' · '}
              <span style={pageStyles.warnText}>{t('state.unreleased')}</span>
            </>
          ) : ''}
          {item.backendSupported ? '' : ` · ${t('state.backendUnsupported')}`}
        </div>
      </div>
      <div style={pageStyles.actions}>
        <button
          type="button"
          className="dsh-archive-btn"
          disabled={loading || busy}
          onClick={() => { ctx.onArchive(item) }}
        >
          {busy ? t('confirm.archiving') : t('action.archive')}
        </button>
        <button
          type="button"
          className="dsh-archive-btn"
          disabled={loading || busy || !item.backendSupported || locked}
          title={locked ? t('state.unreleasedActionHint') : undefined}
          onClick={() => { ctx.onTrash(item) }}
        >
          {t('action.trash')}
        </button>
        <button
          type="button"
          className="dsh-archive-btn dsh-archive-btn-danger"
          disabled={loading || busy || !item.backendSupported || locked}
          title={locked ? t('state.unreleasedActionHint') : undefined}
          onClick={() => { ctx.onDelete(item) }}
        >
          {t('action.deletePermanently')}
        </button>
      </div>
    </div>
  )
}

export interface TrashRowsContext {
  readonly t: TranslateNS<'archive-manage'>
  readonly loading: boolean
  readonly restoringId: string | null
  readonly expandedTrashIds: ReadonlySet<string>
  readonly childrenOf: (item: TrashEntry) => readonly TrashSubagentNode[]
  readonly onToggle: (trashId: string) => void
  readonly onRestore: (item: TrashEntry) => void
  readonly onDelete: (item: TrashEntry) => void
}

/** 回收站子行：任意深度缩进（父行由 sidecar 的 parentSessionId 还原）。 */
function renderTrashChildRow(ctx: TrashRowsContext, node: TrashSubagentNode, budget: RowBudget): ReactElement | null {
  if (budget.remaining <= 0) return null
  budget.remaining -= 1
  const nested = node.children.length > 0
    ? (() => {
      const emitted: ReactElement[] = []
      for (const child of node.children) {
        if (budget.remaining <= 0) break
        emitted.push(renderTrashChildRow(ctx, child, budget) as ReactElement)
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
      <div style={pageStyles.treeRow}>
        <div style={pageStyles.shrink}>
          <div style={pageStyles.treeTitleRow}>
            <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
            <div style={pageStyles.treeTitle} title={node.item.title}>{node.item.title}</div>
          </div>
          <div style={pageStyles.treeFactLine} title={node.item.sessionId}>{node.item.sessionId}</div>
        </div>
      </div>
      {nested}
    </div>
  )
}

/** 回收站树行：父行带恢复/彻底删除与折叠切换，子行缩进只读（任意深度）。 */
export function renderTrashRow(ctx: TrashRowsContext, item: TrashEntry, budget: RowBudget): ReactElement | null {
  const { t, loading } = ctx
  if (budget.remaining <= 0) return null
  budget.remaining -= 1
  const children = ctx.childrenOf(item)
  const hasChildren = children.length > 0
  const collapsed = isCollapsed(ctx.expandedTrashIds, item.trashId)
  const childrenBlock = hasChildren && !collapsed
    ? (() => {
      const emitted: ReactElement[] = []
      for (const child of children) {
        if (budget.remaining <= 0) break
        emitted.push(renderTrashChildRow(ctx, child, budget) as ReactElement)
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
      <div style={hasChildren ? pageStyles.treeRow : pageStyles.row}>
        <div style={pageStyles.shrink}>
          <div style={pageStyles.treeTitleRow}>
            {hasChildren ? (
              <button
                type="button"
                className="dsh-archive-tree-toggle"
                aria-expanded={!collapsed}
                onClick={() => { ctx.onToggle(item.trashId) }}
              >
                <span aria-hidden>{collapsed ? '▸' : '▾'}</span>
              </button>
            ) : (
              <span className="dsh-archive-tree-toggle-spacer" aria-hidden>·</span>
            )}
            <div style={pageStyles.treeTitle} title={item.title}>{item.title}</div>
          </div>
          <div style={pageStyles.secondarySmall} title={item.sessionId}>
            {item.legacy ? `${t('legacy.badge')} · ` : ''}{item.archivedAt}
            {hasChildren ? (
              <>
                {' · '}
                <span style={pageStyles.warnText}>
                  {t('tree.childCount', { n: children.length })}
                </span>
              </>
            ) : ''}
          </div>
        </div>
        <div style={pageStyles.actions}>
          <button
            type="button"
            className="dsh-archive-btn"
            disabled={loading || item.legacy || ctx.restoringId !== null}
            title={item.legacy ? t('legacy.restoreTitle') : undefined}
            onClick={() => { ctx.onRestore(item) }}
          >
            {t('action.restore')}
          </button>
          <button
            type="button"
            className="dsh-archive-btn dsh-archive-btn-danger"
            disabled={loading || ctx.restoringId !== null}
            onClick={() => { ctx.onDelete(item) }}
          >
            {t('action.deletePermanently')}
          </button>
        </div>
      </div>
      {childrenBlock}
    </div>
  )
}
