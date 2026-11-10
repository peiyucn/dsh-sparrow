/**
 * Archive tree rows: one archived session subtree (with its two-step actions and inline delete
 * confirmation) plus the read-only subagent rows shown inside a trash entry.
 */

import type { ReactElement } from 'react'
import type { ArchiveTreeNode } from '../../session-admin.js'
import type { DeskTranslator } from '../app/types.js'
import { formatTokens } from '../app/utils.js'
import { FillTitleButton } from './FillTitleButton.js'
import { SessionRowAction } from './SessionRowAction.js'
import { SessionTreeRow } from './SessionTreeRow.js'

export function countTree(nodes: readonly ArchiveTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countTree(node.children), 0)
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Two-step confirm button: first click arms, second click runs. */
/** One archived subtree: shared tree row + archive-only actions/confirmation; children recurse. */
export function ArchiveTreeNodeRow(props: {
  readonly node: ArchiveTreeNode
  readonly depth: number
  /** Subagent rows are read-only: every operation is parent-scoped, exactly like the old plugin. */
  readonly readOnly: boolean
  readonly t: DeskTranslator
  readonly expanded: Set<string>
  readonly armedTrash: Set<string>
  readonly deleteDraft: { readonly id: string; readonly text: string } | null
  readonly busy: boolean
  readonly onToggleExpand: (id: string) => void
  readonly onOpen: (id: string) => void
  readonly onUnarchive: (id: string) => void
  readonly onArmTrash: (id: string) => void
  readonly onConfirmTrash: (id: string) => void
  readonly onArmDelete: (id: string) => void
  readonly onDeleteDraft: (id: string, text: string) => void
  readonly onConfirmDelete: (node: ArchiveTreeNode) => void
}): ReactElement {
  const { node, depth, t, readOnly, expanded, armedTrash, deleteDraft, busy } = props
  const hasChildren = node.children.length > 0
  const open = expanded.has(node.sessionId)
  const deleteArmed = deleteDraft?.id === node.sessionId
  // Archived rows always require the exact title: the host only waives confirmation for blank
  // stray sessions, never for anything reached through the archived tree.
  const canDelete = deleteArmed && deleteDraft !== null
    && deleteDraft.text.trim() === node.title.trim() && node.title.trim() !== ''
  const badges = (
    <>
      {hasChildren ? <span className="dsh-desk-archive-badge">{t('sessions.childCount', { count: node.children.length })}</span> : null}
      {node.orphan ? <span className="dsh-desk-archive-badge">{t('sessions.archive.orphan')}</span> : null}
      {!node.backendSupported ? <span className="dsh-desk-archive-badge">{t('sessions.archive.unsupported')}</span> : null}
    </>
  )
  const meta = (
    <>
      {node.turns === undefined ? '' : `${node.turns} ${t('sessions.archive.turns')}`}
      {node.tokens === undefined ? '' : ` · ${formatTokens(node.tokens)}`}
      {node.sizeBytes === undefined ? '' : ` · ${Math.max(1, Math.round(node.sizeBytes / 1024))} KB`}
      {` · ${formatDate(node.updatedAt)}`}
    </>
  )
  const actions = readOnly || depth > 0 ? undefined : (
    <>
      <SessionRowAction kind="unarchive" label={t('sessions.archive.unarchive')} disabled={busy} onClick={() => props.onUnarchive(node.sessionId)} />
      <SessionRowAction
        kind="trash"
        label={t('sessions.archive.toTrash')}
        armed={armedTrash.has(node.sessionId)}
        disabled={busy || !node.backendSupported}
        onClick={() => {
          if (armedTrash.has(node.sessionId)) props.onConfirmTrash(node.sessionId)
          else props.onArmTrash(node.sessionId)
        }}
      />
      <SessionRowAction
        kind="delete"
        label={deleteArmed ? t('sessions.archive.deleteConfirm') : t('sessions.archive.delete')}
        armed={deleteArmed}
        danger
        disabled={busy || !node.backendSupported}
        onClick={() => {
          if (deleteArmed) props.onConfirmDelete(node)
          else props.onArmDelete(node.sessionId)
        }}
      />
    </>
  )
  return (
    <li>
      <SessionTreeRow
        variant="archive"
        title={node.title}
        depth={depth}
        live={node.live}
        disabled={readOnly}
        onOpen={() => props.onOpen(node.sessionId)}
        hasChildren={hasChildren}
        expanded={open}
        onToggleExpand={() => props.onToggleExpand(node.sessionId)}
        expandLabel={t('sessions.archive.expand')}
        collapseLabel={t('sessions.archive.collapse')}
        liveHint={t('sessions.archive.liveHint')}
        badges={badges}
        meta={meta}
        {...(actions === undefined ? {} : { actions })}
      />
      {deleteArmed ? (
        <div className="dsh-desk-archive-deletebox" style={{ marginLeft: `calc(12px + ${depth} * 16px)` }}>
          <FillTitleButton
            title={node.title}
            label={props.t('today.copyTitle')}
            onFill={() => props.onDeleteDraft(node.sessionId, node.title)}
          />
          <input
            className="dsh-desk-archive-input"
            value={deleteDraft?.text ?? ''}
            placeholder={props.t('sessions.archive.deletePlaceholder')}
            onChange={event => props.onDeleteDraft(node.sessionId, event.target.value)}
          />
          <button
            type="button"
            className="dsh-desk-archive-action"
            data-danger="true"
            disabled={!canDelete || busy}
            onClick={() => props.onConfirmDelete(node)}
          >{props.t('sessions.archive.deleteConfirm')}</button>
        </div>
      ) : null}
      {hasChildren && open ? (
        <ul className="dsh-desk-archive-list dsh-desk-tree-children">
          {node.children.map(child => (
            <ArchiveTreeNodeRow
              key={child.sessionId}
              node={child}
              depth={depth + 1}
              readOnly
              t={t}
              expanded={expanded}
              armedTrash={armedTrash}
              deleteDraft={deleteDraft}
              busy={busy}
              onToggleExpand={props.onToggleExpand}
              onOpen={props.onOpen}
              onUnarchive={props.onUnarchive}
              onArmTrash={props.onArmTrash}
              onConfirmTrash={props.onConfirmTrash}
              onArmDelete={props.onArmDelete}
              onDeleteDraft={props.onDeleteDraft}
              onConfirmDelete={props.onConfirmDelete}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
/** Trash subagents keep their parent-child display; actions stay on the parent entry. */
export function TrashSubagentRows(props: {
  readonly t: DeskTranslator
  readonly parentId: string
  readonly subagents: readonly { readonly sessionId: string; readonly title: string; readonly parentSessionId?: string }[]
  readonly depth: number
}): ReactElement | null {
  const children = props.subagents.filter(child => (child.parentSessionId ?? props.parentId) === props.parentId)
  if (children.length === 0) return null
  return (
    <ul className="dsh-desk-archive-list dsh-desk-tree-children">
      {children.map(child => (
        <li key={child.sessionId}>
          <SessionTreeRow
            variant="archive"
            title={child.title}
            depth={props.depth}
            subagent
            tag={props.t('sessions.subagent')}
            disabled
            expandLabel={props.t('sessions.archive.expand')}
            collapseLabel={props.t('sessions.archive.collapse')}
          />
          <TrashSubagentRows t={props.t} parentId={child.sessionId} subagents={props.subagents} depth={props.depth + 1} />
        </li>
      ))}
    </ul>
  )
}
