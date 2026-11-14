/**
 * Document-preview entry: one "review view" button in the official preview header.
 *
 * The official file browser and markdown preview are left untouched; this contribution only
 * appears for markdown/text files inside the linked notebook workspace, and clicking it opens the
 * review view for that note — the note's existing review Session when it is still openable,
 * otherwise a fresh one (the bridge owns that decision) — so the official preview and the review
 * view toggle in place instead of piling up review Sessions.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { Button, IconListPenOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { messageOf } from '../app/utils.js'
import type { NotebookApi } from './api.js'
import type { ReviewBridge } from './review-bridge.js'
import type { WorkspaceAccess } from './workspaces.js'
import { findWorkspaceForRoot } from './workspaces.js'

/** Services the header contribution draws on. */
export interface DocReviewActionInjected {
  readonly notebook: NotebookApi
  readonly review: ReviewBridge
  readonly workspaceAccess: WorkspaceAccess
}

type DocReviewActionProps =
  PropsRuntime<'sidebar.right.tab.document.actions'>
  & InjectFace<DocReviewActionInjected>
  & PropsLocale<typeof LOCALE_NAMESPACE>

/** File suffixes the review view understands; everything else keeps the official preview only. */
const REVIEWABLE_SUFFIXES = ['.md', '.markdown', '.txt']

/** Normalize one absolute path for prefix comparison (`/`, no trailing separator). */
function normalizeAbsolute(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

/** Whether the path stays inside the root (case-insensitive only for Windows drive roots). */
function isUnderRoot(absolutePath: string, rootPath: string): boolean {
  const root = normalizeAbsolute(rootPath)
  const file = normalizeAbsolute(absolutePath)
  const caseless = /^[A-Za-z]:\//u.test(root) || root.startsWith('//')
  if (caseless) return file.toLowerCase().startsWith(`${root.toLowerCase()}/`)
  return file.startsWith(`${root}/`)
}

/** Path relative to the root, `/`-separated. */
function relativeToRoot(absolutePath: string, rootPath: string): string {
  const root = normalizeAbsolute(rootPath)
  const file = normalizeAbsolute(absolutePath)
  return file.slice(root.length + 1)
}

/**
 * The preview header's review entry.
 * @param props - the previewed file's absolute path and the notebook services.
 * @returns the button, or nothing for files the notebook does not manage.
 */
export function DocReviewAction(props: DocReviewActionProps): ReactNode {
  const { absolutePath, notebook, review, workspaceAccess, t } = props
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  // The linked library decides whether this file belongs to the notebook; the check is cheap
  // (state is served from the cached index) and refreshes whenever the header mounts.
  useEffect(() => {
    let cancelled = false
    void notebook.state().then((state) => {
      if (!cancelled) setRootPath(state.config?.rootPath ?? null)
    }, () => {
      if (!cancelled) setRootPath(null)
    })
    return () => { cancelled = true }
  }, [notebook])

  if (rootPath === null) return null
  const lower = normalizeAbsolute(absolutePath).toLowerCase()
  if (!REVIEWABLE_SUFFIXES.some(suffix => lower.endsWith(suffix))) return null
  if (!isUnderRoot(absolutePath, rootPath)) return null
  const relativePath = relativeToRoot(absolutePath, rootPath)
  const workspace = findWorkspaceForRoot(workspaceAccess.list(), rootPath)
  if (workspace === undefined) return null
  const label = failed ?? t('review.openInPreview')

  return (
    <Tooltip label={label} side="bottom" delayMs={400}>
      <Button
        variant="ghost"
        size="sm"
        icon={<span className="dsh-desk-review-entry-icon"><IconListPenOutlineRegular /></span>}
        aria-label={t('review.openInPreview')}
        title={t('review.openInPreview')}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(null)
          void notebook.ensureFile(relativePath).then(({ file }) => (
            // The bridge reopens this note's own review Session when it is still openable, so the
            // official files preview and the review view toggle in place.
            review.open({ path: relativePath, fileId: file.id, workspaceId: workspace.workspaceId })
          )).then((result) => {
            if (!result.ok) setFailed(result.message ?? t('review.openFailed'))
          }, (cause: unknown) => {
            setFailed(messageOf(cause))
          }).finally(() => setBusy(false))
        }}
      />
    </Tooltip>
  )
}
