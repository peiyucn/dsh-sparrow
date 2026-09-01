/** dsh-archive-manage 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ArchiveConfig } from './archive.js'
export {
  TRASH_SIDECAR, isDeleteConfirmationSufficient, legacyTrashItem, normalizeArchiveConfig,
  parseTrashSidecar, sanitizeSegment,
} from './archive.js'
