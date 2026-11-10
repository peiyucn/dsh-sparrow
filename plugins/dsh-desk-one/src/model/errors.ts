/**
 * Model-layer error shared by every object kind: routes map the code to an HTTP status
 * (400 / 409 / 404). Kept in its own module so the per-kind model files can throw it without
 * importing each other.
 */

type DeskModelErrorCode =
  | 'INVALID_NOTE'
  | 'REVISION_CONFLICT'
  | 'UNKNOWN_NOTE'
  /** The note wall has reached its 100-note cap (product constraint, see constants.MAX_ACTIVE_NOTES). */
  | 'NOTE_LIMIT'
  /** The trash has reached its 200-note cap and must be emptied first (see constants.MAX_TRASH_NOTES). */
  | 'TRASH_FULL'
  | 'INVALID_TASK'
  | 'UNKNOWN_TASK'
  | 'INVALID_GROUP'
  | 'UNKNOWN_GROUP'
  /** Schedule module: input validation failure / unknown calendar (S2). */
  | 'INVALID_SCHEDULE'
  | 'UNKNOWN_CALENDAR'

/** Model-layer error: routes map it to HTTP status (400 / 409 / 404). */
export class DeskModelError extends Error {
  constructor(readonly code: DeskModelErrorCode, message: string) {
    super(message)
    this.name = 'DeskModelError'
  }
}
