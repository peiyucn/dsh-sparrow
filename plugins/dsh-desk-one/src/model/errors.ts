

type DeskModelErrorCode =
  | 'INVALID_NOTE'
  | 'REVISION_CONFLICT'
  | 'UNKNOWN_NOTE'

  | 'NOTE_LIMIT'

  | 'TRASH_FULL'
  | 'INVALID_TASK'
  | 'UNKNOWN_TASK'
  | 'INVALID_GROUP'
  | 'UNKNOWN_GROUP'

  | 'INVALID_SCHEDULE'
  | 'UNKNOWN_CALENDAR'


export class DeskModelError extends Error {
  constructor(readonly code: DeskModelErrorCode, message: string) {
    super(message)
    this.name = 'DeskModelError'
  }
}
