/**
 * Review toolbar: mimics the official document-preview header (path, view menu, copy / refresh,
 * whole-document annotation). Only the tab's own actions live here; data comes from the controller.
 */

import type { ReactElement } from 'react'
import {
  Button, IconCopyOutlineRegular, IconRefreshOutlineRegular, Menu, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeskTranslator } from '../../../app/types.js'
import type { ReviewView } from '../types.js'

/** Delay before the tooltip appears (shared by the header actions). */
const TOOLTIP_DELAY_MS = 400

/** Render the review header. */
export function ReviewHeader(props: {
  readonly t: DeskTranslator
  readonly path: string
  readonly title: string | undefined
  readonly loading: boolean
  readonly pageReady: boolean
  readonly view: ReviewView
  readonly menuOpen: boolean
  readonly onMenuOpenChange: (open: boolean) => void
  readonly onSelectView: (view: ReviewView) => void
  readonly onCopyPath: () => void
  readonly onRefresh: () => void
  readonly onWholeDocument: () => void
}): ReactElement {
  const {
    t, path, title, loading, pageReady, view, menuOpen, onMenuOpenChange, onSelectView, onCopyPath, onRefresh, onWholeDocument,
  } = props
  return (
    <header className="dsh-desk-review-head">
      <span className="dsh-desk-review-path" title={path}>{title ?? path}</span>
      <Menu
        open={menuOpen}
        onClose={() => onMenuOpenChange(false)}
        align="end"
        portal
        autoFocus
        dense
        selectedId={view}
        items={[
          { id: 'render', label: t('review.viewRender') },
          { id: 'source', label: t('review.viewSource') },
        ]}
        onSelect={(id) => {
          if (id === 'render' || id === 'source') onSelectView(id)
        }}
        anchor={(
          <Button
            variant="ghost"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => onMenuOpenChange(!menuOpen)}
          >{view === 'source' ? t('review.viewSource') : t('review.viewRender')}</Button>
        )}
      />
      <Tooltip label={t('review.copyPath')} side="bottom" delayMs={TOOLTIP_DELAY_MS}>
        <Button variant="ghost" size="sm" icon={<IconCopyOutlineRegular />} aria-label={t('review.copyPath')} onClick={onCopyPath} />
      </Tooltip>
      <Tooltip label={t('review.refresh')} side="bottom" delayMs={TOOLTIP_DELAY_MS}>
        <Button variant="ghost" size="sm" icon={<IconRefreshOutlineRegular />} aria-label={t('review.refresh')} disabled={loading} onClick={onRefresh} />
      </Tooltip>
      <Button variant="outline" size="sm" disabled={!pageReady} onClick={onWholeDocument}>
        {t('review.wholeDoc')}
      </Button>
    </header>
  )
}
