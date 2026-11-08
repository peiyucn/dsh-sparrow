/** Sessions host errors: same semantics as the archived plugin's ArchiveError. */

export type SessionsErrorCode =
  | 'BAD_BODY'
  | 'NOT_ARCHIVED'
  | 'UNKNOWN_SESSION'
  | 'UNKNOWN_TRASH'
  | 'SESSION_LIVE'
  | 'BACKEND_UNSUPPORTED'
  | 'CONFIRMATION_FAILED'
  | 'TARGET_EXISTS'
  | 'FORBIDDEN'
  | 'IO_ERROR'

export class SessionsError extends Error {
  constructor(readonly code: SessionsErrorCode, message: string, readonly status = 400) {
    super(message)
    this.name = 'SessionsError'
  }
}
