/** dsh-archive-session 入口：host half 契约。 */
export { apply, inject, name } from './host.js'
export type { ArchiveConfig } from './archive.js'
export {
  BACKUP_SIDECAR, isDeleteConfirmationSufficient, legacyBackupItem, normalizeArchiveConfig,
  parseBackupSidecar, sanitizeSegment,
} from './archive.js'
