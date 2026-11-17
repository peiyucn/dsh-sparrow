


export interface SnapshotLike<T> {
  getSnapshot(): T
}


export interface SidebarRightLike {
  openTab(kind: string, options?: { readonly params?: unknown }): void

  readonly mounted?: SnapshotLike<string | undefined>
}


export interface SessionsLike {
  scope(id: string): SessionScopeLike | undefined

  readonly list?: SnapshotLike<{
    readonly ids?: readonly string[]

    readonly projectionsBySession?: Readonly<Record<string, {
      readonly values?: { readonly sessionStats?: { readonly turns?: number } | null }
    }>>
  }>

  readonly refreshProjections?: (sessionId: string) => Promise<void>
}


export interface WorkspacesLike {
  readonly list?: SnapshotLike<{ readonly archivedSessionIds?: readonly string[] }>
}


export interface SessionScopeLike {
  get(name: string): unknown
}


export interface SessionInputLike {
  insertQuote(text: string): boolean
  focus(): void
}


export interface ConversationLike {
  readonly input: { for(scope: unknown): SessionInputLike }
}


export interface SessionNavigationLike {

  startSession(workspaceId: string, options?: { readonly prompt?: string }): void

  openWorkspace?(workspaceId: string, beforeOpen?: (sessionId: string) => void): Promise<void>

  openSession?(sessionId: string): void
}
