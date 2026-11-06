/**
 * dsh-desk-one 主面板页（S0）：一个面板、两个标签。
 * 「便签」是便签墙：右下角「+」随手加一张，便签在墙上自由拖动摆放、直接在贴纸上写字；
 * 「总览」是主标签：先汇总便签，后续接入任务 / 日程。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE, NOTE_COLORS } from '../constants.js'
import type { DeskNote, NoteColor } from '../contract.js'
import type { DeskPanelInjected } from './install.js'

type Tab = 'overview' | 'notes'

/** 便签几何（px）：墙面上的自由摆放单位。 */
const NOTE_WIDTH = 208
const NOTE_MIN_HEIGHT = 168
const WALL_PADDING = 24
const CASCADE_OFFSET = 18
/** 新便签的颜色循环：便签墙优先彩色（默认色留给用户自己改）。 */
const STICKY_COLORS: readonly NoteColor[] = ['yellow', 'green', 'blue', 'pink']

/** 页面 props：主面板 owner share + 注入动作 + locale 座位（框架组装）。 */
export type DeskPanelProps = PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

const messageOf = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

/** 无坐标记录（agent 建的便签）的兜底摆放：每行 5 张的网格 + 轻微错位。 */
function fallbackPosition(index: number): { x: number; y: number } {
  return {
    x: WALL_PADDING + (index % 5) * (NOTE_WIDTH + 16) + (index % 2) * CASCADE_OFFSET,
    y: WALL_PADDING + Math.floor(index / 5) * 190 + (index % 2) * CASCADE_OFFSET,
  }
}

/**
 * 主面板页面：标签切换 + 便签墙。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function DeskOnePage(props: DeskPanelProps) {
  const { listNotes, createNote, updateNote, deleteNote, t } = props
  const [tab, setTab] = useState<Tab>('overview')
  const [notes, setNotes] = useState<readonly DeskNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const wallRef = useRef<HTMLDivElement | null>(null)
  const textareas = useRef(new Map<string, HTMLTextAreaElement>())
  const loadSeq = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const next = await listNotes()
      if (seq !== loadSeq.current) return
      setNotes(next)
      setError(null)
    } catch (reason) {
      if (seq !== loadSeq.current) return
      setError(messageOf(reason))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [listNotes])

  useEffect(() => { void load() }, [load])

  /** 坐标视图：缺坐标的记录按序号兜底（不写回，用户拖动时才落库）。 */
  const placed = useMemo(() => notes.map((note, index) => {
    const fallback = fallbackPosition(index)
    return { note, x: note.x ?? fallback.x, y: note.y ?? fallback.y }
  }), [notes])

  const canvasSize = useMemo(() => {
    let right = 0
    let bottom = 0
    for (const item of placed) {
      right = Math.max(right, item.x + NOTE_WIDTH)
      bottom = Math.max(bottom, item.y + NOTE_MIN_HEIGHT)
    }
    return { width: right + WALL_PADDING * 2, height: bottom + WALL_PADDING * 2 }
  }, [placed])

  const replaceNote = useCallback((updated: DeskNote): void => {
    setNotes(current => current.map(note => note.id === updated.id ? updated : note))
  }, [])
  const removeNote = useCallback((id: string): void => {
    setNotes(current => current.filter(note => note.id !== id))
  }, [])

  /** 统一的补丁落库：乐观更新已在本地完成，失败时提示并重拉对齐。 */
  const savePatch = useCallback(async (note: DeskNote, patch: Parameters<DeskPanelInjected['updateNote']>[0]['patch']): Promise<void> => {
    try {
      const updated = await updateNote({ id: note.id, expectedRevision: note.revision, patch })
      replaceNote(updated)
      setActionError(null)
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      void load()
    }
  }, [load, replaceNote, t, updateNote])

  const removeWithFeedback = useCallback(async (id: string): Promise<void> => {
    try {
      await deleteNote(id)
      removeNote(id)
      setActionError(null)
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    }
  }, [deleteNote, removeNote, t])

  /** 「+」：在当前视口中间新建一张空便签，并立刻把焦点交给它。 */
  const addNote = useCallback(async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    setActionError(null)
    try {
      const wall = wallRef.current
      const anchorX = WALL_PADDING + (wall?.scrollLeft ?? 0) + ((wall?.clientWidth ?? 800) - NOTE_WIDTH) / 2
      const anchorY = WALL_PADDING + (wall?.scrollTop ?? 0) + 48
      const offset = (notes.length % 6) * CASCADE_OFFSET
      const note = await createNote({
        body: '',
        color: STICKY_COLORS[notes.length % STICKY_COLORS.length] ?? 'yellow',
        x: Math.max(WALL_PADDING, Math.round(anchorX + offset)),
        y: Math.max(WALL_PADDING, Math.round(anchorY + offset)),
      })
      setNotes(current => [...current, note])
      setTab('notes')
      requestAnimationFrame(() => { textareas.current.get(note.id)?.focus() })
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    } finally {
      setCreating(false)
    }
  }, [createNote, creating, notes.length, t])

  /**
   * 卡片拖拽：在非输入区按下开始移动，抬起时把最终坐标落库。
   * 本地先移动（跟手），落库失败由 savePatch 提示并重拉。
   */
  const startDrag = useCallback((
    event: React.PointerEvent<HTMLElement>,
    note: DeskNote,
    originX: number,
    originY: number,
  ): void => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('textarea,button')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    let currentX = originX
    let currentY = originY
    let moved = false
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      currentX = Math.max(0, Math.round(originX + dx))
      currentY = Math.max(0, Math.round(originY + dy))
      setNotes(current => current.map(item => item.id === note.id ? { ...item, x: currentX, y: currentY } : item))
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!moved) return
      void savePatch(note, { x: currentX, y: currentY })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [savePatch])

  /** 正文失焦落库；空白便签失焦即删除（墙上不留空贴纸）。 */
  const commitBody = useCallback((note: DeskNote, element: HTMLTextAreaElement): void => {
    const body = element.value
    if (body === note.body) return
    if (body.trim() === '' && note.body.trim() === '') {
      void removeWithFeedback(note.id)
      return
    }
    void savePatch(note, { body })
  }, [removeWithFeedback, savePatch])

  const renderNote = (item: { note: DeskNote; x: number; y: number }): ReactElement => (
    <article
      key={item.note.id}
      className="dsh-desk-note"
      data-color={item.note.color}
      style={{ left: item.x, top: item.y }}
      onPointerDown={event => startDrag(event, item.note, item.x, item.y)}
    >
      <div className="dsh-desk-note-bar">
        <div className="dsh-desk-note-colors">
          {NOTE_COLORS.map(color => (
            <button
              key={color}
              type="button"
              className="dsh-desk-dot"
              data-color={color}
              data-active={item.note.color === color}
              aria-label={t(`color.${color}`)}
              title={t(`color.${color}`)}
              onClick={() => { void savePatch(item.note, { color }) }}
            />
          ))}
        </div>
        <button
          type="button"
          className="dsh-desk-note-close"
          aria-label={t('action.delete')}
          title={t('action.delete')}
          onClick={() => { void removeWithFeedback(item.note.id) }}
        >
          ×
        </button>
      </div>
      <textarea
        key={`${item.note.id}:${item.note.revision}`}
        ref={element => {
          if (element === null) textareas.current.delete(item.note.id)
          else textareas.current.set(item.note.id, element)
        }}
        className="dsh-desk-note-body"
        // 兼容旧数据：早期版本允许「只有标题」的便签，墙上把标题原文当正文显示，避免显示成空贴纸。
        defaultValue={item.note.body === '' ? item.note.title : item.note.body}
        placeholder={t('note.placeholder')}
        spellCheck={false}
        onBlur={event => commitBody(item.note, event.currentTarget)}
      />
    </article>
  )

  const renderOverview = (): ReactElement => {
    const recent = notes.slice(0, 5)
    return (
      <div className="dsh-desk-today">
        <p className="dsh-desk-stats">{t('overview.counts', { notes: notes.length })}</p>
        <h2 className="dsh-desk-section-title">{t('overview.recent')}</h2>
        {recent.length === 0
          ? <p className="dsh-desk-hint">{t('overview.recentEmpty')}</p>
          : (
              <ul className="dsh-desk-recent">
                {recent.map(note => (
                  <li key={note.id}>
                    <button type="button" className="dsh-desk-recent-item" onClick={() => setTab('notes')}>
                      <span className="dsh-desk-recent-dot" data-color={note.color} />
                      <span className="dsh-desk-recent-text">{note.title === '' ? t('note.placeholder') : note.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        <p className="dsh-desk-hint">{t('overview.hint')}</p>
      </div>
    )
  }

  return (
    <div className="dsh-desk-page">
      <header className="dsh-desk-head" data-window-drag>
        <div>
          <h1 className="dsh-desk-title">{t('page.title')}</h1>
          <p className="dsh-desk-subtitle">{t('page.subtitle')}</p>
        </div>
      </header>
      <nav className="dsh-desk-tabs" role="tablist">
        <button type="button" className="dsh-desk-tab" data-active={tab === 'overview'} onClick={() => setTab('overview')}>
          {t('tab.overview')}
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
      {tab === 'overview' ? renderOverview() : (
        <div className="dsh-desk-wall" ref={wallRef}>
          <div
            className="dsh-desk-canvas"
            style={{ width: Math.max(canvasSize.width, 640), height: Math.max(canvasSize.height, 360) }}
          >
            {loading && notes.length === 0
              ? <p className="dsh-desk-wall-hint">{t('state.loading')}</p>
              : notes.length === 0
                ? <p className="dsh-desk-wall-hint">{t('state.empty')}</p>
                : placed.map(renderNote)}
          </div>
        </div>
      )}
      {tab === 'notes'
        ? (
          <button
            type="button"
            className="dsh-desk-add"
            disabled={creating}
            aria-label={t('action.newNote')}
            title={t('action.newNote')}
            onClick={() => { void addNote() }}
          >
            +
          </button>
        )
        : null}
    </div>
  )
}
