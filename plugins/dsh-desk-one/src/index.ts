/** dsh-desk-one 入口：host half 契约 + 可复用的纯逻辑导出。 */
export { apply, inject, name } from './host.js'
export { DeskModelError, createNoteRecord, filterNotes, normalizeNoteInput, patchNoteRecord, sortNotes } from './model.js'
export type { NoteInput, NotePatch } from './model.js'
export {
  assertTrustedAuthority, isLoopbackHostname, isTrustedAuthority, isTrustedPluginRequest, parseAuthority,
} from './trust.js'
