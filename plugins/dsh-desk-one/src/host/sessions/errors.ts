/**
 * Session-management error type (migrated from dsh-archive-manage's `ArchiveError`).
 *
 * The desk HTTP layer maps `SessionsError` to `{ error: { code, message } }` with the carried
 * status, so session routes keep archive-manage's error semantics without depending on its code.
 */

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
