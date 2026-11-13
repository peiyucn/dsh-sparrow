/**
 * Review tab session binding: recover the note from the tab params / tab memory / host markers, and
 * keep the Session marked as a review Session so the sidebar glyph survives a restart.
 */

import { useEffect, useState } from 'react'
import type { NotebookApi } from '../../api.js'
import type { NoteReviewParams } from '../../review-bridge.js'
import { readReviewTabParams, recoverReviewParams, writeReviewTabParams } from '../../review-tab-memory.js'
import { persistReviewSession } from '../../../reviewSessions.js'
import type { ReviewTarget } from '../types.js'

/** Recover + persist the note target of one review Session. */
export function useReviewSession(input: {
  readonly notebook: NotebookApi
  readonly sessionId: string
  readonly navigationParams: NoteReviewParams | undefined
}): { readonly target: ReviewTarget | undefined; readonly recovering: boolean } {
  const { notebook, sessionId, navigationParams } = input
  /** Official sidebar restores the tab layout without its navigation params; recover the note. */
  const [recovered, setRecovered] = useState<NoteReviewParams | null>(null)
  const [recovering, setRecovering] = useState(navigationParams === undefined)
  const params = navigationParams ?? recovered ?? readReviewTabParams(sessionId)
  // Remember the params when they arrive, and resolve a restored tab from the memo / host markers.
  useEffect(() => {
    if (navigationParams !== undefined) {
      writeReviewTabParams(sessionId, navigationParams)
      setRecovered(null)
      setRecovering(false)
      return
    }
    if (readReviewTabParams(sessionId) !== undefined) {
      setRecovering(false)
      return
    }
    let cancelled = false
    setRecovering(true)
    void recoverReviewParams(notebook, sessionId).then((next) => {
      if (cancelled) return
      if (next !== undefined) writeReviewTabParams(sessionId, next)
      setRecovered(next ?? null)
      setRecovering(false)
    }, () => {
      if (!cancelled) setRecovering(false)
    })
    return () => { cancelled = true }
  }, [navigationParams, notebook, sessionId])
  const path = params?.path
  const fileId = params?.fileId
  const workspaceId = params?.workspaceId
  // Any session showing the review tab counts as a review session, including ones opened before
  // this build. Marking is durable so the sidebar icon survives a restart.
  useEffect(() => {
    persistReviewSession(notebook, {
      sessionId,
      ...workspaceId === undefined ? {} : { workspaceId },
      ...fileId === undefined ? {} : { fileId },
    })
  }, [fileId, notebook, sessionId, workspaceId])
  return {
    target: path === undefined || fileId === undefined || workspaceId === undefined
      ? undefined
      : { path, fileId, workspaceId },
    recovering,
  }
}
