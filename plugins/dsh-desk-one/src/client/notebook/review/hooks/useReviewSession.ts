

import { useEffect, useState } from 'react'
import type { NotebookApi } from '../../api.js'
import type { NoteReviewParams } from '../../review-bridge.js'
import { readReviewTabParams, recoverReviewParams, writeReviewTabParams } from '../tab-memory.js'
import { persistReviewSession } from '../sessions.js'
import type { ReviewTarget } from '../types.js'


export function useReviewSession(input: {
  readonly notebook: NotebookApi
  readonly sessionId: string
  readonly navigationParams: NoteReviewParams | undefined
}): { readonly target: ReviewTarget | undefined; readonly recovering: boolean } {
  const { notebook, sessionId, navigationParams } = input

  const [recovered, setRecovered] = useState<NoteReviewParams | null>(null)
  const [recovering, setRecovering] = useState(navigationParams === undefined)
  const params = navigationParams ?? recovered ?? readReviewTabParams(sessionId)

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
