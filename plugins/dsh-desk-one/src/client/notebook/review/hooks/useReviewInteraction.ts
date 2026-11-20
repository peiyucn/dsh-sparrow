

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { DraftAnnotation } from '../../../../notebook-contract.js'
import type { DeskTranslator } from '../../../app/types.js'
import { messageOf } from '../../../app/utils.js'
import type { NotebookApi } from '../../api.js'
import type { ReviewBridge } from '../../review-bridge.js'
import { annotationsByLine, annotationMessage, selectedRangeOf } from '../format.js'
import { persistReviewSession } from '../sessions.js'
import type {
  ComposeTarget, OverlayKind, ReviewTarget, ReviewView, SelectionTarget,
} from '../types.js'
import type { ReviewDocumentController } from './useReviewDocument.js'


export interface ReviewInteractionController {
  readonly selection: SelectionTarget | null
  readonly composer: ComposeTarget | null
  readonly comment: string
  readonly overlay: OverlayKind | null
  readonly view: ReviewView
  readonly menuOpen: boolean
  readonly diffOpen: boolean
  readonly codeRef: MutableRefObject<HTMLDivElement | null>
  readonly rootRef: MutableRefObject<HTMLDivElement | null>
  readonly composerRef: MutableRefObject<HTMLDivElement | null>
  readonly floatRef: MutableRefObject<HTMLButtonElement | null>
  readonly floatPos: { readonly top: number; readonly left: number } | undefined
  readonly selectedRange: { readonly start: number; readonly end: number } | undefined
  readonly annotationsByLine: ReadonlyMap<number, readonly DraftAnnotation[]>
  readonly documentAnnotations: readonly DraftAnnotation[]
  readonly setComment: (value: string) => void
  readonly setOverlay: (overlay: OverlayKind | null) => void
  readonly toggleOverlay: (kind: OverlayKind) => void
  readonly openOverlay: (kind: OverlayKind) => void
  readonly setView: (view: ReviewView) => void
  readonly setMenuOpen: (open: boolean) => void
  readonly setDiffOpen: (open: boolean) => void
  readonly handleSelect: () => void
  readonly cancelSelection: () => void
  readonly startCompose: (target: ComposeTarget) => void
  readonly saveAnnotation: () => void
  readonly submitAll: () => void
}


export function useReviewInteraction(input: {
  readonly t: DeskTranslator
  readonly notebook: NotebookApi
  readonly bridge: ReviewBridge
  readonly sessionId: string
  readonly target: ReviewTarget | undefined
  readonly data: ReviewDocumentController
}): ReviewInteractionController {
  const { t, notebook, bridge, sessionId, target, data } = input
  const { annotations, persist, loadRecords, setNotice } = data
  const [selection, setSelection] = useState<SelectionTarget | null>(null)
  const [composer, setComposer] = useState<ComposeTarget | null>(null)
  const [comment, setComment] = useState('')
  const [overlay, setOverlay] = useState<OverlayKind | null>(null)
  const [view, setView] = useState<ReviewView>('source')
  const [menuOpen, setMenuOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const codeRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const floatRef = useRef<HTMLButtonElement | null>(null)


  useEffect(() => {
    if (overlay === null) return
    const onPointerDown = (event: PointerEvent): void => {
      const eventTarget = event.target
      if (!(eventTarget instanceof Element)) return
      if (eventTarget.closest('.dsh-desk-review-layer') !== null) return
      if (eventTarget.closest('.dsh-desk-review-bar') !== null) return
      if (composerRef.current?.contains(eventTarget) === true) return
      setOverlay(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOverlay(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [overlay])


  const cancelSelection = useCallback((): void => {
    setComposer(null)
    setComment('')
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])


  useEffect(() => {
    if (composer === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelSelection()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const composerElement = composerRef.current
      if (composerElement !== null && event.target instanceof Node && composerElement.contains(event.target)) return
      cancelSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [cancelSelection, composer])



  useEffect(() => {
    if (selection === null || composer !== null) return
    const onPointerDown = (event: PointerEvent): void => {
      const eventTarget = event.target as Node | null
      if (eventTarget === null) return
      if (floatRef.current?.contains(eventTarget) === true) return
      setSelection(null)
      window.getSelection()?.removeAllRanges()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [composer, selection])


  const handleSelect = useCallback((): void => {
    const container = codeRef.current
    const sel = window.getSelection()
    if (container === null || sel === null || sel.isCollapsed) return
    const lineOf = (node: Node | null): number | undefined => {
      let element = node instanceof Element ? node : node?.parentElement ?? null
      while (element !== null && !container.contains(element)) element = element.parentElement
      const holder = element?.closest('[data-line]')
      if (holder === null || holder === undefined) return undefined
      return Number(holder.getAttribute('data-line'))
    }
    const anchorLine = lineOf(sel.anchorNode)
    const focusLine = lineOf(sel.focusNode)
    if (anchorLine === undefined || focusLine === undefined) return
    const quote = sel.toString().replace(/\n+$/u, '').trim()
    if (quote === '') return
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    setSelection({
      quote,
      startLine: Math.min(anchorLine, focusLine),
      endLine: Math.max(anchorLine, focusLine),
      rect: { top: rect.top, left: rect.left },
    })
  }, [])

  const startCompose = useCallback((next: ComposeTarget): void => {
    setComposer(next)
    setComment('')
  }, [])

  const saveAnnotation = useCallback((): void => {
    if (composer === null) return
    const text = comment.trim()
    if (text === '') return
    const next: DraftAnnotation = {
      id: composer.editingId ?? `${Date.now()}-${annotations.length}`,
      quote: composer.quote,
      text,
      ...composer.scope === 'document' ? { scope: 'document' as const } : {
        ...composer.startLine === undefined ? {} : { startLine: composer.startLine },
        ...composer.endLine === undefined ? {} : { endLine: composer.endLine },
      },
      createdAt: new Date().toISOString(),
    }
    persist(composer.editingId === undefined
      ? [...annotations, next]
      : annotations.map(item => item.id === composer.editingId ? next : item))
    if (target !== undefined) {
      persistReviewSession(notebook, { sessionId, workspaceId: target.workspaceId, fileId: target.fileId })
    }
    setComposer(null)
    setComment('')
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [annotations, comment, composer, notebook, persist, sessionId, target])


  const submitAll = useCallback((): void => {
    if (target === undefined || annotations.length === 0) return
    const text = annotationMessage(target.path, annotations)
    if (!bridge.sendQuote(sessionId, text)) {
      setNotice(t('review.submitFailed'))
      return
    }
    persistReviewSession(notebook, { sessionId, workspaceId: target.workspaceId, fileId: target.fileId })
    void notebook.recordReview({
      sessionId,
      workspaceId: target.workspaceId,
      fileId: target.fileId,
      annotations,
    })
      .then(() => { void loadRecords() })
      .catch((cause: unknown) => setNotice(t('review.historySaveFailed', { message: messageOf(cause) })))
    persist([])
    setOverlay(null)
    setNotice(t('review.submitted'))
  }, [annotations, bridge, loadRecords, notebook, persist, sessionId, setNotice, t, target])

  const lineAnnotations = useMemo(() => annotationsByLine(annotations), [annotations])
  const documentAnnotations = useMemo(() => annotations.filter(annotation => annotation.scope === 'document'), [annotations])
  const selectedRange = selectedRangeOf(composer, selection)
  const rootRect = rootRef.current?.getBoundingClientRect()
  const floatPos = selection === null || rootRect === undefined
    ? undefined
    : { top: Math.max(selection.rect.top - rootRect.top - 34, 8), left: Math.max(selection.rect.left - rootRect.left, 8) }

  return {
    selection,
    composer,
    comment,
    overlay,
    view,
    menuOpen,
    diffOpen,
    codeRef,
    rootRef,
    composerRef,
    floatRef,
    floatPos,
    selectedRange,
    annotationsByLine: lineAnnotations,
    documentAnnotations,
    setComment,
    setOverlay,
    toggleOverlay: (kind) => setOverlay(current => current === kind ? null : kind),
    openOverlay: (kind) => setOverlay(kind),
    setView,
    setMenuOpen,
    setDiffOpen,
    handleSelect,
    cancelSelection,
    startCompose,
    saveAnnotation,
    submitAll,
  }
}
