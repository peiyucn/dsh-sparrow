
export { apply, inject, name } from './host.js'
export {
  DeskModelError, createNoteRecord, createTaskRecord, filterNotes, filterTasks, normalizeNoteInput, normalizeTaskInput,
  patchNoteRecord, patchTaskRecord, sortNotes, sortTasks,
} from './model.js'
export type { NoteInput, NotePatch, TaskInput, TaskPatch } from './model.js'
export {
  assertTrustedAuthority, isLoopbackHostname, isTrustedAuthority, isTrustedPluginRequest, parseAuthority,
} from './trust.js'
