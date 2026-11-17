

import { useState } from 'react'
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { LOCALE_NAMESPACE } from '../../constants.js'
import { DeskGlyph } from '../brand.js'
import { messageOf } from '../app/utils.js'
import type { NotebookApi } from './api.js'
import type { ReviewBridge } from './review-bridge.js'
import type { WorkspaceAccess } from './workspaces.js'
import { findWorkspaceForPath, relativeToWorkspace } from './workspaces.js'


export interface DocReviewActionInjected {
  readonly notebook: NotebookApi
  readonly review: ReviewBridge
  readonly workspaceAccess: WorkspaceAccess
}

type DocReviewActionProps =
  PropsRuntime<'sidebar.right.tab.document.actions'>
  & InjectFace<DocReviewActionInjected>
  & PropsLocale<typeof LOCALE_NAMESPACE>


const REVIEWABLE_SUFFIXES = ['.md', '.markdown', '.txt']


export function DocReviewAction(props: DocReviewActionProps): ReactNode {
  const { absolutePath, notebook, review, workspaceAccess, t } = props
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const lower = absolutePath.toLowerCase()
  if (!REVIEWABLE_SUFFIXES.some(suffix => lower.endsWith(suffix))) return null

  const workspace = findWorkspaceForPath(workspaceAccess.list(), absolutePath)
  if (workspace === undefined) return null
  const relativePath = relativeToWorkspace(absolutePath, workspace.path)
  const label = failed ?? t('review.openInPreview')

  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <Button
        variant="ghost"
        size="sm"
        icon={<span className="dsh-desk-review-entry-icon"><DeskGlyph size={16} strokeWidth={2} /></span>}
        aria-label={t('review.openInPreview')}
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(null)
          void notebook.open({ workspaceId: workspace.workspaceId, path: relativePath }).then(({ file }) => (


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
