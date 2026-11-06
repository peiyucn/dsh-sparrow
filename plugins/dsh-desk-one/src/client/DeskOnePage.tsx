/**
 * dsh-desk-one 主面板页（S0）：一个面板、两个标签。
 * 「便签墙」是满墙贴纸：右下角「＋」随手加，贴纸不出屏、自由拖动 / 拖拽改大小、
 * 拿起即置顶、方角纸片；「总览」汇总便签并给后续任务 / 日程的联动聚合预留。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  LOCALE_NAMESPACE, NOTE_COLORS, NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH, NOTE_MAX_SIZE,
  NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH, TAB_STORAGE_KEY,
} from '../constants.js'
import type { DeskNote, NoteColor } from '../contract.js'
import type { DeskPanelInjected } from './install.js'

type Tab = 'overview' | 'notes'

/** 新便签的颜色循环：便签墙优先彩色（默认色留给用户自己改）。 */
const STICKY_COLORS: readonly NoteColor[] = ['yellow', 'green', 'blue', 'pink']
/** 新便签在视口中心的级联错位（避免叠成一摞）。 */
const CASCADE_OFFSET = 18

interface WallSize {
  readonly width: number
  readonly height: number
}

interface PlacedNote {
  readonly note: DeskNote
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
}

/** 页面 props：主面板 owner share + 注入动作 + locale 座位（框架组装）。 */
export type DeskPanelProps = PropsRuntime<'main'> & InjectFace<DeskPanelInjected> & PropsLocale<typeof LOCALE_NAMESPACE>

const messageOf = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max))

/** 记住上次停留的标签页：切走再回来不重置到总览。隐私模式下 localStorage 不可用时静默回退。 */
function readInitialTab(): Tab {
  try {
    const value = window.localStorage.getItem(TAB_STORAGE_KEY)
    if (value === 'overview' || value === 'notes') return value
  } catch {
    // 隐私模式 / 存储被禁用：按默认标签走。
  }
  return 'overview'
}

/** 无坐标记录（agent 建的便签）的兜底摆放：每行 5 张的网格 + 轻微错位。 */
function fallbackPosition(index: number): { x: number; y: number } {
  return {
    x: 24 + (index % 5) * (NOTE_DEFAULT_WIDTH + 16) + (index % 2) * CASCADE_OFFSET,
    y: 24 + Math.floor(index / 5) * 190 + (index % 2) * CASCADE_OFFSET,
  }
}

/**
 * 主面板页面：标签切换 + 便签墙 + 总览摘要。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function DeskOnePage(props: DeskPanelProps) {
  const { listNotes, createNote, updateNote, deleteNote, t } = props
  const [tab, setTab] = useState<Tab>(readInitialTab)
  const [notes, setNotes] = useState<readonly DeskNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [wallSize, setWallSize] = useState<WallSize>({ width: 0, height: 0 })
  const wallRef = useRef<HTMLDivElement | null>(null)
  const textareas = useRef(new Map<string, HTMLTextAreaElement>())
  const loadSeq = useRef(0)
  /** 层级游标：取当前最大 z 再 +1，抬到最上后持久化的数值仍单调。 */
  const zTopRef = useRef(0)
  /** 最新便签状态：写队列按执行时的 revision 落库，避免层级/位置/正文并发写打架。 */
  const notesRef = useRef<readonly DeskNote[]>(notes)
  notesRef.current = notes
  /** 每张便签一条写队列（z / 位置 / 尺寸 / 正文按顺序保存）。 */
  const writeChains = useRef(new Map<string, Promise<void>>())

  const selectTab = useCallback((next: Tab): void => {
    setTab(next)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, next)
    } catch {
      // 存不了就只在本会话里记住，不影响使用。
    }
  }, [])

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

  /** 墙面尺寸：拖拽与初始摆放都必须在可见区域内（墙面不滚动）。 */
  useEffect(() => {
    if (tab !== 'notes') return
    const element = wallRef.current
    if (element === null) return
    const update = (): void => { setWallSize({ width: element.clientWidth, height: element.clientHeight }) }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [tab])

  /** 外部（agent / 重拉）改了正文时，同步到未聚焦的 textarea 里。 */
  useEffect(() => {
    for (const [id, element] of textareas.current) {
      const note = notes.find(item => item.id === id)
      if (note === undefined) continue
      const display = note.body === '' ? note.title : note.body
      if (document.activeElement !== element && element.value !== display) element.value = display
    }
  }, [notes])

  /** 坐标视图：缺位置/尺寸的记录用默认值，且一律夹进可见墙面（不产生滚动条）。 */
  const placed = useMemo<PlacedNote[]>(() => notes.map((note, index) => {
    const width = note.width ?? NOTE_DEFAULT_WIDTH
    const height = note.height ?? NOTE_DEFAULT_HEIGHT
    const fallback = fallbackPosition(index)
    const rawX = note.x ?? fallback.x
    const rawY = note.y ?? fallback.y
    const x = wallSize.width === 0 ? rawX : clamp(rawX, 0, wallSize.width - width)
    const y = wallSize.height === 0 ? rawY : clamp(rawY, 0, wallSize.height - height)
    return { note, x, y, width, height, zIndex: note.z ?? index + 1 }
  }), [notes, wallSize.height, wallSize.width])

  const replaceNote = useCallback((updated: DeskNote): void => {
    setNotes(current => current.map(note => note.id === updated.id ? updated : note))
  }, [])
  const removeNote = useCallback((id: string): void => {
    setNotes(current => current.filter(note => note.id !== id))
  }, [])

  type Patch = Parameters<DeskPanelInjected['updateNote']>[0]['patch']

  /** 写队列：同一张便签的保存串行，且每次按执行时的最新 revision 落库。 */
  const enqueueWrite = useCallback((noteId: string, task: () => Promise<void>): void => {
    const previous = writeChains.current.get(noteId) ?? Promise.resolve()
    const next = previous.then(task, task)
    writeChains.current.set(noteId, next)
    void next.finally(() => {
      if (writeChains.current.get(noteId) === next) writeChains.current.delete(noteId)
    })
  }, [])

  /** 统一的补丁落库：乐观更新已在本地完成，失败时提示并重拉对齐。 */
  const savePatch = useCallback((note: DeskNote, patch: Patch): void => {
    enqueueWrite(note.id, async () => {
      const current = notesRef.current.find(item => item.id === note.id)
      if (current === undefined) return
      try {
        const updated = await updateNote({ id: note.id, expectedRevision: current.revision, patch })
        replaceNote(updated)
        setActionError(null)
      } catch (reason) {
        setActionError(t('state.saveFailed', { message: messageOf(reason) }))
        void load()
      }
    })
  }, [enqueueWrite, load, replaceNote, t, updateNote])

  /** 点 / 拖 / 改大小把这张便签抬到最上层，并把层级持久化（刷新/重启后顺序不丢）。 */
  const raise = useCallback((noteId: string): void => {
    const current = notesRef.current.find(item => item.id === noteId)
    if (current === undefined) return
    const maxZ = notesRef.current.reduce((max, item) => Math.max(max, item.z ?? 0), zTopRef.current)
    zTopRef.current = maxZ + 1
    const layer = zTopRef.current
    setNotes(list => list.map(item => item.id === noteId ? { ...item, z: layer } : item))
    savePatch(current, { z: layer })
  }, [savePatch])

  /** 删除便签；排在同便签的写队列之后，避免「先删后写」造成 404 噪声。 */
  const removeWithFeedback = useCallback((id: string): void => {
    enqueueWrite(id, async () => {
      try {
        await deleteNote(id)
        removeNote(id)
        setActionError(null)
      } catch (reason) {
        setActionError(t('state.saveFailed', { message: messageOf(reason) }))
      }
    })
  }, [deleteNote, enqueueWrite, removeNote, t])

  /** 「＋」：在当前视口中间新建一张空便签，并立刻把焦点交给它。 */
  const addNote = useCallback(async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    setActionError(null)
    try {
      const offset = (notes.length % 6) * CASCADE_OFFSET
      const anchorX = Math.max(0, (wallSize.width - NOTE_DEFAULT_WIDTH) / 2) + offset
      const anchorY = Math.max(0, (wallSize.height - NOTE_DEFAULT_HEIGHT) / 2) + offset
      const note = await createNote({
        body: '',
        color: STICKY_COLORS[notes.length % STICKY_COLORS.length] ?? 'yellow',
        x: clamp(Math.round(anchorX), 0, Math.max(0, wallSize.width - NOTE_DEFAULT_WIDTH)),
        y: clamp(Math.round(anchorY), 0, Math.max(0, wallSize.height - NOTE_DEFAULT_HEIGHT)),
      })
      setNotes(current => [...current, note])
      selectTab('notes')
      requestAnimationFrame(() => { textareas.current.get(note.id)?.focus() })
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    } finally {
      setCreating(false)
    }
  }, [createNote, creating, notes.length, selectTab, t, wallSize.height, wallSize.width])

  /** 卡片拖拽：不出屏（坐标夹在墙内），抬起时落库。 */
  const startDrag = useCallback((event: React.PointerEvent<HTMLElement>, item: PlacedNote): void => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || target.closest('textarea,button,.dsh-desk-note-resize')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const maxX = Math.max(0, wallSize.width - item.width)
    const maxY = Math.max(0, wallSize.height - item.height)
    let currentX = item.x
    let currentY = item.y
    let moved = false
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      currentX = clamp(Math.round(item.x + dx), 0, maxX)
      currentY = clamp(Math.round(item.y + dy), 0, maxY)
      setNotes(current => current.map(note => note.id === item.note.id
        ? { ...note, x: currentX, y: currentY }
        : note))
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!moved) return
      void savePatch(item.note, { x: currentX, y: currentY })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [savePatch, wallSize.height, wallSize.width])

  /** 右下角改大小：同样夹在墙内，抬手落库。 */
  const startResize = useCallback((event: React.PointerEvent<HTMLElement>, item: PlacedNote): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const maxWidth = Math.max(NOTE_MIN_WIDTH, wallSize.width - item.x)
    const maxHeight = Math.max(NOTE_MIN_HEIGHT, wallSize.height - item.y)
    let currentWidth = item.width
    let currentHeight = item.height
    let moved = false
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      moved = true
      currentWidth = clamp(Math.round(item.width + moveEvent.clientX - startX), NOTE_MIN_WIDTH, Math.min(maxWidth, NOTE_MAX_SIZE))
      currentHeight = clamp(Math.round(item.height + moveEvent.clientY - startY), NOTE_MIN_HEIGHT, Math.min(maxHeight, NOTE_MAX_SIZE))
      setNotes(current => current.map(note => note.id === item.note.id
        ? { ...note, width: currentWidth, height: currentHeight }
        : note))
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!moved) return
      void savePatch(item.note, { width: currentWidth, height: currentHeight })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
  }, [savePatch, wallSize.height, wallSize.width])

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

  const renderNote = (item: PlacedNote): ReactElement => (
    <article
      key={item.note.id}
      className="dsh-desk-note"
      data-color={item.note.color}
      style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.zIndex }}
      onPointerDown={(event) => {
        // 点/拖哪张，哪张就置顶。
        raise(item.note.id)
        startDrag(event, item)
      }}
    >
      <div className="dsh-desk-note-bar">
        <span className="dsh-desk-note-drag">{t('action.drag')}</span>
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
        key={item.note.id}
        ref={(element) => {
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
      <span
        className="dsh-desk-note-resize"
        aria-hidden="true"
        onPointerDown={(event) => {
          raise(item.note.id)
          startResize(event, item)
        }}
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
                    <button type="button" className="dsh-desk-recent-item" onClick={() => selectTab('notes')}>
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
        <button type="button" className="dsh-desk-tab" data-active={tab === 'overview'} onClick={() => selectTab('overview')}>
          {t('tab.overview')}
        </button>
        <button type="button" className="dsh-desk-tab" data-active={tab === 'notes'} onClick={() => selectTab('notes')}>
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
          {loading && notes.length === 0
            ? <p className="dsh-desk-wall-hint">{t('state.loading')}</p>
            : notes.length === 0
              ? <p className="dsh-desk-wall-hint">{t('state.empty')}</p>
              : placed.map(renderNote)}
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
