/**
 * Session archive pure logic. Split by area (config / facts / tree / cache); this file only
 * aggregates them so callers keep importing './archive.js'.
 */

export {
  TRASH_SIDECAR, isDeleteConfirmationSufficient, isSafeSessionDirName, maskHomePath, normalizeArchiveConfig, sanitizeSegment,
  parseTrashSidecar, trashItemView, legacyTrashItem, type ArchiveConfig, type ArchiveSidecar,
  type ArchiveSubagentSidecar,
} from './archive-config.js'
export { parseBlankProjection, parseSessionFacts, straySessionIds, type SessionFacts } from './session-facts.js'
export {
  archiveAlignmentForChildren, archivedIdsToRemove, buildSessionTree, collectSubtreeIds, livingChildIds,
  subagentDescendantIds, type SessionTreeHeader, type SessionTreeNode,
} from './session-tree.js'
export {
  createBudgetSignal, createHeaderFactsStore, createLruCache, labelFromSubagentIdentity, runBounded,
  type HeaderFactsStore, type SubagentIdentityValue,
} from './facts-store.js'
