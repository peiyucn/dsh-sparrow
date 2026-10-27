/**
 * 归档页二次确认框：**官方 `Modal` 原语**提供遮罩、Esc、焦点回收与角色语义
 * （与官方 ui-schedule / ui-plugin-manager 在主页面里做确认的方式一致）；
 * 提交后在框内展示处理中，成功后自动关闭。
 */

import { useEffect, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StraySessionItem, TrashEntry } from '../contract.js'
import type { ArchivedSessionItem } from './archivedTree.js'
import { pageStyles } from './styles.js'

/** 待确认动作（web 确认框状态）。 */
export type PendingConfirm =
  | { readonly kind: 'unarchive'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'trash'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'delete'; readonly item: ArchivedSessionItem }
  | { readonly kind: 'trashStray'; readonly item: StraySessionItem }
  | { readonly kind: 'deleteStray'; readonly item: StraySessionItem }
  | { readonly kind: 'deleteTrashItem'; readonly item: TrashEntry }
  | { readonly kind: 'restoreAll'; readonly restorable: number; readonly legacy: number }
  | { readonly kind: 'deleteAll'; readonly count: number }

interface ConfirmModalProps {
  readonly pending: PendingConfirm
  readonly t: TranslateNS<'archive-manage'>
  readonly onCancel: () => void
  /** 执行动作；成功后父级关闭确认框，失败 reject 并把错误显示在确认框内。 */
  readonly onSubmit: (typed: string) => Promise<void>
}

export function ConfirmModal(props: ConfirmModalProps) {
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
            style={pageStyles.confirmInput}
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
      <div style={pageStyles.confirmActions}>
        <button type="button" className="dsh-archive-btn" disabled={working} onClick={onCancel}>{t('confirm.cancel')}</button>
        <button type="button" className="dsh-archive-btn dsh-archive-btn-danger" disabled={!ready} onClick={submit}>{title}</button>
      </div>
    </Modal>
  )
}
