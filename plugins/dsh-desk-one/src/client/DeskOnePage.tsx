/**
 * dsh-desk-one 主面板页（S0）：一个面板、两个标签。
 * 「今天」是主标签（后续任务 / 日程的联动聚合面），S0 先展示置顶便签与统计；
 * 「便签」是第一个落地功能：新建 / 编辑 / 置顶 / 改色 / 删除 / 搜索。
 * 后续版本在这里追加标签，不改动宿主契约。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE, NOTE_COLORS } from '../constants.js'
import type { DeskNote, NoteColor } from '../contract.js'
import type { DeskPanelInjected } from './install.js'

type Tab = 'today' | 'notes'

/** 页面 props：主面板 owner share + 注入动作 + locale 座位（框架组装）。 */
export type DeskPanelProps = PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

interface ComposerState {
  readonly id: string | null
  readonly title: string
  readonly body: string
  readonly color: NoteColor
  readonly revision: number
}

const EMPTY_COMPOSER: ComposerState = { id: null, title: '', body: '', color: 'default', revision: 0 }

/** 卡片正文预览：最多 160 字符，超出省略。 */
function previewOf(note: DeskNote): string {
  const text = note.body.trim()
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

/** 时间的本地短格式（面板只展示，不做精确业务计算）。 */
function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

/**
 * 主面板页面：标签切换 + 便签数据面。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function DeskOnePage(props: DeskPanelProps) {
  const { listNotes, createNote, updateNote, deleteNote, t } = props
  const [tab, setTab] = useState<Tab>('today')
  const [notes, setNotes] = useState<readonly DeskNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [composer, setComposer] = useState<ComposerState>(EMPTY_COMPOSER)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  /** 刷新代际：并发刷新时只让最新一次结果落地。 */
  const loadSeqRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    try {
      const next = await listNotes()
      if (seq !== loadSeqRef.current) return
      setNotes(next)
      setError(null)
    } catch (reason) {
      if (seq !== loadSeqRef.current) return
      setError(messageOf(reason))
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [listNotes])

  useEffect(() => { void load() }, [load])

  /** 搜索在客户端过滤：今天标签始终拿到全量数据，不因搜索词缺条目。 */
  const visibleNotes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (keyword === '') return notes
    return notes.filter(note => `${note.title}\n${note.body}`.toLowerCase().includes(keyword))
  }, [notes, query])

  const pinnedNotes = useMemo(() => notes.filter(note => note.pinned), [notes])

  const replaceNote = useCallback((next: DeskNote): void => {
    setNotes(current => current.map(note => note.id === next.id ? next : note))
  }, [])

  const resetComposer = useCallback((): void => {
    setComposer(EMPTY_COMPOSER)
    setActionError(null)
  }, [])

  const startEdit = useCallback((note: DeskNote): void => {
    setComposer({ id: note.id, title: note.title, body: note.body, color: note.color, revision: note.revision })
    setActionError(null)
    setTab('notes')
  }, [])

  const save = useCallback(async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setActionError(null)
    try {
      if (composer.id === null) {
        const created = await createNote({ title: composer.title, body: composer.body, color: composer.color })
        setNotes(current => [created, ...current])
      } else {
        const updated = await updateNote({
          id: composer.id,
          expectedRevision: composer.revision,
          patch: { title: composer.title, body: composer.body, color: composer.color },
        })
        replaceNote(updated)
      }
      setComposer(EMPTY_COMPOSER)
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    } finally {
      setSaving(false)
    }
  }, [composer, createNote, replaceNote, saving, t, updateNote])

  const togglePin = useCallback(async (note: DeskNote): Promise<void> => {
    setActionError(null)
    try {
      const updated = await updateNote({
        id: note.id,
        expectedRevision: note.revision,
        patch: { pinned: !note.pinned },
      })
      replaceNote(updated)
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    }
  }, [replaceNote, t, updateNote])

  const remove = useCallback(async (note: DeskNote): Promise<void> => {
    if (pendingDeleteId !== note.id) {
      setPendingDeleteId(note.id)
      return
    }
    setPendingDeleteId(null)
    setActionError(null)
    try {
      await deleteNote(note.id)
      setNotes(current => current.filter(item => item.id !== note.id))
      setComposer(current => current.id === note.id ? EMPTY_COMPOSER : current)
    } catch (reason) {
      setActionError(t('state.deleteFailed', { message: messageOf(reason) }))
    }
  }, [deleteNote, pendingDeleteId, t])

  const canSave = !saving && (composer.title.trim() !== '' || composer.body.trim() !== '')

  const renderCard = (note: DeskNote): ReactElement => (
    <article key={note.id} className="dsh-desk-card" data-color={note.color}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <button
          type="button"
          className="dsh-desk-pin"
          data-active={note.pinned}
          aria-label={note.pinned ? t('action.unpin') : t('action.pin')}
          title={note.pinned ? t('action.unpin') : t('action.pin')}
          onClick={() => { void togglePin(note) }}
        >
          {note.pinned ? '★' : '☆'}
        </button>
        <h3 className="dsh-desk-card-title" style={{ flex: 1, minWidth: 0 }}>{note.title}</h3>
      </div>
      {previewOf(note) === '' ? null : <p className="dsh-desk-card-body">{previewOf(note)}</p>}
      <div className="dsh-desk-card-foot">
        <span className="dsh-desk-meta">{t('meta.updatedAt', { time: formatTime(note.updatedAt) })}</span>
        <div className="dsh-desk-card-actions">
          <button type="button" className="dsh-desk-link" onClick={() => startEdit(note)}>{t('action.edit')}</button>
          <button type="button" className="dsh-desk-link dsh-desk-link-danger" onClick={() => { void remove(note) }}>
            {pendingDeleteId === note.id ? t('action.confirmDelete') : t('action.delete')}
          </button>
        </div>
      </div>
    </article>
  )

  const renderToday = (): ReactElement => (
    <div className="dsh-desk-today">
      <p className="dsh-desk-stats">
        {t('today.counts', { notes: notes.length, pinned: pinnedNotes.length })}
      </p>
      <h2 className="dsh-desk-section-title">{t('today.pinned')}</h2>
      {pinnedNotes.length === 0
        ? <p className="dsh-desk-hint">{t('state.empty')}</p>
        : <div className="dsh-desk-grid">{pinnedNotes.map(renderCard)}</div>}
      <p className="dsh-desk-hint">{t('today.hint')}</p>
    </div>
  )

  const renderNotes = (): ReactElement => (
    <div>
      <div className="dsh-desk-toolbar">
        <input
          className="dsh-desk-search"
          type="search"
          value={query}
          placeholder={t('placeholder.search')}
          onChange={event => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="dsh-desk-btn"
          onClick={() => { resetComposer(); setTab('notes') }}
        >
          {t('action.newNote')}
        </button>
      </div>

      <div className="dsh-desk-composer">
        <input
          className="dsh-desk-input"
          type="text"
          value={composer.title}
          placeholder={t('placeholder.title')}
          onChange={event => setComposer(current => ({ ...current, title: event.target.value }))}
        />
        <textarea
          className="dsh-desk-textarea"
          value={composer.body}
          placeholder={t('placeholder.body')}
          onChange={event => setComposer(current => ({ ...current, body: event.target.value }))}
        />
        <div className="dsh-desk-composer-foot">
          <div className="dsh-desk-swatches">
            {NOTE_COLORS.map(color => (
              <button
                key={color}
                type="button"
                className="dsh-desk-swatch"
                data-color={color}
                data-active={composer.color === color}
                aria-label={t(`color.${color}`)}
                title={t(`color.${color}`)}
                onClick={() => setComposer(current => ({ ...current, color }))}
              />
            ))}
          </div>
          <button
            type="button"
            className="dsh-desk-btn"
            onClick={() => { resetComposer() }}
            disabled={saving}
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="dsh-desk-btn dsh-desk-btn-primary"
            onClick={() => { void save() }}
            disabled={!canSave}
          >
            {saving ? t('state.saving') : t('action.save')}
          </button>
        </div>
      </div>

      {loading
        ? <p className="dsh-desk-empty">{t('state.loading')}</p>
        : visibleNotes.length === 0
          ? <p className="dsh-desk-empty">{query.trim() === '' ? t('state.empty') : t('state.searchEmpty')}</p>
          : <div className="dsh-desk-grid">{visibleNotes.map(renderCard)}</div>}
    </div>
  )

  return (
    <div className="dsh-desk-page">
      <header className="dsh-desk-head" data-window-drag>
        <div>
          <h1 className="dsh-desk-title">{t('page.title')}</h1>
          <p className="dsh-desk-subtitle">{t('page.subtitle')}</p>
        </div>
      </header>
      <nav className="dsh-desk-tabs" role="tablist">
        <button type="button" className="dsh-desk-tab" data-active={tab === 'today'} onClick={() => setTab('today')}>
          {t('tab.today')}
        </button>
        <button type="button" className="dsh-desk-tab" data-active={tab === 'notes'} onClick={() => setTab('notes')}>
          {t('tab.notes')}
        </button>
      </nav>
      {error === null ? null : (
        <div>
          <p className="dsh-desk-error">{t('state.loadFailed', { message: error })}</p>
          <button type="button" className="dsh-desk-btn" onClick={() => { void load() }}>{t('action.retry')}</button>
        </div>
      )}
      {actionError === null ? null : <p className="dsh-desk-error">{actionError}</p>}
      {tab === 'today' ? renderToday() : renderNotes()}
    </div>
  )
}
