/**
 * dsh-desk-one 主面板页（S0）：一个面板、两个标签。
 * 「便签墙」是满墙贴纸：右下角「＋」随手加，贴纸不出屏、自由拖动 / 拖拽改大小、
 * 拿起即置顶、方角纸片；「总览」汇总便签并给后续任务 / 日程的联动聚合预留。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  LOCALE_NAMESPACE, MAX_ACTIVE_NOTES, MAX_TRASH_NOTES, NOTE_COLORS, NOTE_DEFAULT_HEIGHT, NOTE_DEFAULT_WIDTH,
  NOTE_MAX_SIZE, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH, TAB_STORAGE_KEY, TRASH_PAGE_SIZE,
} from '../constants.js'
import type { DeskNote, NoteColor } from '../contract.js'
import type { DeskPanelInjected } from './install.js'

type Tab = 'overview' | 'notes'

/** 新便签的颜色循环：便签墙优先彩色（默认色留给用户自己改）。 */
const STICKY_COLORS: readonly NoteColor[] = ['yellow', 'green', 'blue', 'pink']
/** 新便签在视口中心的级联错位（避免叠成一摞）。 */
const CASCADE_OFFSET = 18
/** Smash 动画时长：贴纸按顺序飞走后统一落库（动画 + 落库都在这个窗口内完成）。 */
const SMASH_ANIMATION_MS = 480
/** 单张便签丢进垃圾桶的动画时长（与 Smash 同一段飞散效果）。 */
const NOTE_TRASH_ANIMATION_MS = 300

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
  return 'notes'
}

/** 无坐标记录（agent 建的便签）的兜底摆放：每行 5 张的网格 + 轻微错位。 */
function fallbackPosition(index: number): { x: number; y: number } {
  return {
    x: 24 + (index % 5) * (NOTE_DEFAULT_WIDTH + 16) + (index % 2) * CASCADE_OFFSET,
    y: 24 + Math.floor(index / 5) * 190 + (index % 2) * CASCADE_OFFSET,
  }
}

/** 归档区里的日期展示（只到天）。 */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return date.toLocaleDateString()
}

/**
 * 主面板页面：标签切换 + 便签墙 + 总览摘要。
 * @param props - 主面板 owner share + 注入动作 + locale 座位。
 */
export function DeskOnePage(props: DeskPanelProps) {
  const { listNotes, createNote, updateNote, deleteNote, t } = props
  const [tab, setTab] = useState<Tab>(readInitialTab)
  /** 便签墙内的视图：便签墙 / 垃圾桶（只影响便签标签，不影响标签页选择）。 */
  const [showTrash, setShowTrash] = useState(false)
  /** 「清空垃圾桶」是显式二次确认操作，绝不自动清空。 */
  const [confirmClearTrash, setConfirmClearTrash] = useState(false)
  /** 「Smash!」一键把墙上便签全丢进垃圾桶，同样需要二次确认。 */
  const [confirmSmash, setConfirmSmash] = useState(false)
  const [smashing, setSmashing] = useState(false)
  /** 正在播放飞散动画的单张便签（与 Smash 共用同一段动画）。 */
  const [trashingIds, setTrashingIds] = useState<ReadonlySet<string>>(() => new Set())
  /** 垃圾桶一次渲染 10 行，点「加载更多」再加载。 */
  const [trashVisible, setTrashVisible] = useState(TRASH_PAGE_SIZE)
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
  /** Smash 动画的定时器：卸载时清掉，避免动画后写已卸载组件的状态。 */
  const smashTimer = useRef<number | null>(null)
  /** 单张便签删除动画的定时器（按 id 记，卸载时统一清）。 */
  const trashTimers = useRef(new Map<string, number>())

  useEffect(() => () => {
    if (smashTimer.current !== null) window.clearTimeout(smashTimer.current)
    for (const timer of trashTimers.current.values()) window.clearTimeout(timer)
    trashTimers.current.clear()
  }, [])

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

  /** 墙上只摆不在垃圾桶里的便签；垃圾桶的记录单独列出（一次只渲染前 20 行）。 */
  const activeNotes = useMemo(() => notes.filter(note => !note.trashed), [notes])
  const trashedNotes = useMemo(() => notes.filter(note => note.trashed), [notes])
  const visibleTrashed = useMemo(() => trashedNotes.slice(0, trashVisible), [trashedNotes, trashVisible])

  /** 坐标视图：缺位置/尺寸的记录用默认值，且一律夹进可见墙面（不产生滚动条）。 */
  const placed = useMemo<PlacedNote[]>(() => activeNotes.map((note, index) => {
    const width = note.width ?? NOTE_DEFAULT_WIDTH
    const height = note.height ?? NOTE_DEFAULT_HEIGHT
    const fallback = fallbackPosition(index)
    const rawX = note.x ?? fallback.x
    const rawY = note.y ?? fallback.y
    const x = wallSize.width === 0 ? rawX : clamp(rawX, 0, wallSize.width - width)
    const y = wallSize.height === 0 ? rawY : clamp(rawY, 0, wallSize.height - height)
    return { note, x, y, width, height, zIndex: note.z ?? index + 1 }
  }), [activeNotes, wallSize.height, wallSize.width])

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

  /** 点 / 拖 / 改大小把这张便签抬到最上层；已在最上层时跳过写库（省掉一次性 z 写）。 */
  const raise = useCallback((noteId: string): void => {
    const current = notesRef.current.find(item => item.id === noteId)
    if (current === undefined) return
    const maxZ = notesRef.current.reduce((max, item) => Math.max(max, item.z ?? 0), zTopRef.current)
    if (current.z !== undefined && current.z === maxZ) return
    zTopRef.current = maxZ + 1
    const layer = zTopRef.current
    setNotes(list => list.map(item => item.id === noteId ? { ...item, z: layer } : item))
    savePatch(current, { z: layer })
  }, [savePatch])

  /** 把一张便签丢进垃圾桶：先播飞散动画，动画结束再本地移除并落库（与 Smash 同一段效果）。 */
  const trashNote = useCallback((note: DeskNote): void => {
    if (trashingIds.has(note.id)) return
    if (trashedNotes.length >= MAX_TRASH_NOTES) {
      setActionError(t('trash.full'))
      setShowTrash(true)
      return
    }
    setActionError(null)
    setTrashingIds(current => {
      const next = new Set(current)
      next.add(note.id)
      return next
    })
    const timer = window.setTimeout(() => {
      trashTimers.current.delete(note.id)
      setTrashingIds(current => {
        const next = new Set(current)
        next.delete(note.id)
        return next
      })
      // 先本地移除再落库：避免「动画结束 → 状态回弹 → 再消失」的闪回。
      setNotes(current => current.map(item => item.id === note.id ? { ...item, trashed: true } : item))
      void savePatch(note, { trashed: true })
    }, NOTE_TRASH_ANIMATION_MS)
    trashTimers.current.set(note.id, timer)
  }, [savePatch, t, trashedNotes.length, trashingIds])

  /** Smash!：二次确认后把墙上所有便签一把丢进垃圾桶（先播动画，再乐观清墙并落库）。 */
  const smashWall = useCallback((): void => {
    if (smashing) return
    // 常驻按钮：墙上没有便签时点了没反应（不提示、不弹错误）。
    if (activeNotes.length === 0) return
    if (!confirmSmash) {
      setConfirmSmash(true)
      setActionError(null)
      return
    }
    setConfirmSmash(false)
    if (trashedNotes.length + activeNotes.length > MAX_TRASH_NOTES) {
      setActionError(t('trash.full'))
      setShowTrash(true)
      return
    }
    setSmashing(true)
    const targets = activeNotes
    smashTimer.current = window.setTimeout(() => {
      smashTimer.current = null
      const ids = new Set(targets.map(note => note.id))
      // 先乐观更新 state（墙面立刻收走），再落库：否则动画结束到服务端返回之间会整墙闪回一次。
      setNotes(current => current.map(item => ids.has(item.id) ? { ...item, trashed: true } : item))
      setSmashing(false)
      for (const note of targets) void savePatch(note, { trashed: true })
    }, SMASH_ANIMATION_MS)
  }, [activeNotes, confirmSmash, savePatch, smashing, t, trashedNotes.length])

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

  /** 「＋」/ 双击空白处：新建一张便签，落在当前视口中间或双击点附近，并立刻置顶 + 聚焦。 */
  const addNote = useCallback(async (point?: { x: number; y: number }): Promise<void> => {
    if (creating) return
    // 产品硬上限：墙上最多 100 张（host 侧同样校验，工具也绕不过去）。
    if (activeNotes.length >= MAX_ACTIVE_NOTES) {
      setActionError(t('wall.full'))
      return
    }
    setCreating(true)
    setActionError(null)
    try {
      const offset = (activeNotes.length % 6) * CASCADE_OFFSET
      const anchorX = point === undefined
        ? Math.max(0, (wallSize.width - NOTE_DEFAULT_WIDTH) / 2) + offset
        : point.x
      const anchorY = point === undefined
        ? Math.max(0, (wallSize.height - NOTE_DEFAULT_HEIGHT) / 2) + offset
        : point.y
      // 新建的便签置顶：比现有最大层级还高一层，并把层级写进记录（重启后顺序不变）。
      const layer = notes.reduce((max, item) => Math.max(max, item.z ?? 0), zTopRef.current) + 1
      zTopRef.current = layer
      const note = await createNote({
        body: '',
        color: STICKY_COLORS[activeNotes.length % STICKY_COLORS.length] ?? 'yellow',
        x: clamp(Math.round(anchorX), 0, Math.max(0, wallSize.width - NOTE_DEFAULT_WIDTH)),
        y: clamp(Math.round(anchorY), 0, Math.max(0, wallSize.height - NOTE_DEFAULT_HEIGHT)),
        z: layer,
      })
      // 新建即置顶：即便宿主暂时不认创建时的 z，也先在本地按最大层级 + 1 显示。
      const placedNote = note.z === layer ? note : { ...note, z: layer }
      setNotes(current => [...current, placedNote])
      selectTab('notes')
      setShowTrash(false)
      if (note.z !== layer) {
        // 补一次 z 补丁把层级真正落库（老宿主的 patch 已支持 z，不依赖重启）。
        enqueueWrite(note.id, async () => {
          try {
            const updated = await updateNote({ id: note.id, expectedRevision: note.revision, patch: { z: layer } })
            replaceNote({ ...updated, z: updated.z ?? layer })
          } catch {
            // 落库失败不影响本地显示，下次拖动/点击会再次尝试。
          }
        })
      }
      requestAnimationFrame(() => { textareas.current.get(note.id)?.focus() })
    } catch (reason) {
      setActionError(t('state.saveFailed', { message: messageOf(reason) }))
    } finally {
      setCreating(false)
    }
  }, [activeNotes.length, createNote, creating, enqueueWrite, notes, replaceNote, selectTab, t, updateNote, wallSize.height, wallSize.width])

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
    // 拖动过程直接改 DOM 位置（O(1)），抬手才写回 state + 落库：墙上张数多也不掉帧。
    const element = event.currentTarget as HTMLElement
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return
      moved = true
      currentX = clamp(Math.round(item.x + dx), 0, maxX)
      currentY = clamp(Math.round(item.y + dy), 0, maxY)
      element.style.left = `${currentX}px`
      element.style.top = `${currentY}px`
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!moved) return
      setNotes(current => current.map(note => note.id === item.note.id
        ? { ...note, x: currentX, y: currentY }
        : note))
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
    // 同样直接改 DOM 尺寸（O(1)），抬手才写回 state + 落库。
    const element = (event.currentTarget as HTMLElement).closest('.dsh-desk-note') as HTMLElement | null
    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId) return
      moved = true
      currentWidth = clamp(Math.round(item.width + moveEvent.clientX - startX), NOTE_MIN_WIDTH, Math.min(maxWidth, NOTE_MAX_SIZE))
      currentHeight = clamp(Math.round(item.height + moveEvent.clientY - startY), NOTE_MIN_HEIGHT, Math.min(maxHeight, NOTE_MAX_SIZE))
      if (element !== null) {
        element.style.width = `${currentWidth}px`
        element.style.height = `${currentHeight}px`
      }
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      if (!moved) return
      setNotes(current => current.map(note => note.id === item.note.id
        ? { ...note, width: currentWidth, height: currentHeight }
        : note))
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

  const renderNote = (item: PlacedNote, index: number): ReactElement => {
    const animating = smashing || trashingIds.has(item.note.id)
    return (
    <article
      key={item.note.id}
      className={animating ? 'dsh-desk-note dsh-desk-note-smashing' : 'dsh-desk-note'}
      data-color={item.note.color}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        zIndex: item.zIndex,
        animationDelay: smashing ? `${Math.min(index, 8) * 18}ms` : undefined,
      }}
      onPointerDown={(event) => {
        // 点/拖哪张，哪张就置顶。
        raise(item.note.id)
        startDrag(event, item)
      }}
    >
      <div className="dsh-desk-note-bar">
        <span className="dsh-desk-note-grip" role="img" aria-label={t('action.drag')} title={t('action.drag')}>
          <i /><i /><i /><i /><i /><i />
        </span>
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
          className="dsh-desk-iconbtn dsh-desk-iconbtn-sm dsh-desk-note-action"
          aria-label={t('action.trash')}
          title={t('action.trash')}
          onClick={() => { trashNote(item.note) }}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
          </svg>
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
  }

  /** 垃圾桶：轻便签的删除先进这里，可恢复或永久删除（入口在底部「＋」旁边）。 */
  const clearTrash = useCallback((): void => {
    if (!confirmClearTrash) {
      setConfirmClearTrash(true)
      return
    }
    setConfirmClearTrash(false)
    setTrashVisible(TRASH_PAGE_SIZE)
    for (const note of trashedNotes) removeWithFeedback(note.id)
  }, [confirmClearTrash, removeWithFeedback, trashedNotes])

  const renderTrash = (): ReactElement => (
    <div className="dsh-desk-trash">
      <div className="dsh-desk-trash-head">
        <h2 className="dsh-desk-trash-title">
          {t('trash.title')}
          {trashedNotes.length > 0
            ? <span className="dsh-desk-trash-count">{t('trash.total', { count: trashedNotes.length })}</span>
            : null}
        </h2>
        {trashedNotes.length === 0
          ? null
          : (
              <div className="dsh-desk-trash-actions">
                {trashVisible < trashedNotes.length
                  ? (
                      <button
                        type="button"
                        className="dsh-desk-trash-clear"
                        onClick={() => setTrashVisible(current => current + TRASH_PAGE_SIZE)}
                      >
                        {t('action.loadMore')}
                      </button>
                    )
                  : null}
                <button type="button" className="dsh-desk-trash-clear" onClick={clearTrash}>
                  {confirmClearTrash ? t('action.clearTrashConfirm') : t('action.clearTrash')}
                </button>
              </div>
            )}
      </div>
      {trashedNotes.length === 0
        ? <p className="dsh-desk-wall-hint">{t('trash.empty')}</p>
        : (
            <ul className="dsh-desk-trash-list">
              {visibleTrashed.map(note => (
                <li key={note.id} className="dsh-desk-trash-row">
                  <span className="dsh-desk-trash-dot" data-color={note.color} />
                  <span className="dsh-desk-trash-text">{note.title === '' ? t('note.placeholder') : note.title}</span>
                  <span className="dsh-desk-trash-meta">{formatDate(note.updatedAt)}</span>
                  <button
                    type="button"
                    className="dsh-desk-iconbtn"
                    aria-label={t('action.restore')}
                    title={t('action.restore')}
                    onClick={() => { void savePatch(note, { trashed: false }) }}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M4.5 6.5v4h4" />
                      <path d="M5 10.3A5.2 5.2 0 1 1 6.6 13.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="dsh-desk-iconbtn dsh-desk-iconbtn-danger"
                    aria-label={t('action.delete')}
                    title={t('action.delete')}
                    onClick={() => { void removeWithFeedback(note.id) }}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
    </div>
  )

  const renderOverview = (): ReactElement => (
    // 总览内容尚未设计：S0 保持空白占位，不往里堆功能（owner 2026-11-06）。
    <div className="dsh-desk-overview" />
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
        <div className="dsh-desk-notesview">
          {showTrash
            ? renderTrash()
            : (
                <div
                  className="dsh-desk-wall"
                  ref={wallRef}
                  onDoubleClick={(event) => {
                    // 只在背板空白处生效；双击贴纸/控件不新建。
                    if (event.target !== event.currentTarget) return
                    const rect = event.currentTarget.getBoundingClientRect()
                    void addNote({
                      x: event.clientX - rect.left - NOTE_DEFAULT_WIDTH / 2,
                      y: event.clientY - rect.top - NOTE_DEFAULT_HEIGHT / 2,
                    })
                  }}
                >
                  {loading
                    ? <p className="dsh-desk-wall-hint">{t('state.loading')}</p>
                    : activeNotes.length === 0
                      ? (
                          <p className="dsh-desk-wall-tip">
                            <span className="dsh-desk-wall-tip-main">{t('wall.tip')}</span>
                            <span className="dsh-desk-wall-tip-sub">{t('wall.tipAlt')}</span>
                          </p>
                        )
                      : null}
                  {placed.map(renderNote)}
                </div>
              )}
        </div>
      )}
      {tab === 'notes'
        ? (
          <div className="dsh-desk-fabstack">
            <div className="dsh-desk-fabrow">
              {showTrash
                ? null
                : (
                    <button
                      type="button"
                      className="dsh-desk-add dsh-desk-fabglass"
                      disabled={creating || smashing}
                      aria-label={t('action.newNote')}
                      title={t('action.newNote')}
                      onClick={() => { void addNote() }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  )}
              <button
                type="button"
                className="dsh-desk-fab-secondary dsh-desk-fabglass"
                aria-label={showTrash ? t('action.backToWall') : t('action.trash')}
                title={showTrash ? t('action.backToWall') : t('action.trash')}
                onClick={() => {
                  setConfirmClearTrash(false)
                  setConfirmSmash(false)
                  setTrashVisible(TRASH_PAGE_SIZE)
                  setShowTrash(current => !current)
                }}
              >
                {showTrash
                  ? (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M11.5 5.5L7 10l4.5 4.5M7.5 10h7" />
                    </svg>
                  )
                  : (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M4 6.5h12M8 6.5V5h4v1.5M6 6.5l.7 8.5h6.6l.7-8.5M8.5 9v4M11.5 9v4" />
                    </svg>
                  )}
              </button>
              {showTrash
                ? null
                : (
                    <button
                      type="button"
                      className="dsh-desk-smash dsh-desk-fabglass"
                      data-confirm={confirmSmash}
                      disabled={smashing}
                      aria-label={confirmSmash ? t('action.smashConfirm') : t('action.smash')}
                      title={confirmSmash ? t('action.smashConfirm') : t('action.smash')}
                      onClick={smashWall}
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M10 2.6v3.1M10 14.3v3.1M2.6 10h3.1M14.3 10h3.1M4.8 4.8l2.2 2.2M13 13l2.2 2.2M15.2 4.8L13 7M7 13l-2.2 2.2" />
                        <circle cx="10" cy="10" r="2.1" />
                      </svg>
                    </button>
                  )}
            </div>
          </div>
        )
        : null}
    </div>
  )
}
