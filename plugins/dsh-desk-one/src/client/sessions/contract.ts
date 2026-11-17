

type SessionAvailability = 'available' | 'loading' | 'archived' | 'unavailable'


export interface SessionChipInfo {
  readonly id: string
  readonly title: string
  readonly running: boolean
  readonly availability: SessionAvailability
  readonly updatedAt: number
  readonly cwd?: string

  readonly parentId?: string
  readonly subagent: boolean

  readonly turns?: number
  readonly steps?: number

  readonly llmMs?: number

  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}


export interface SessionWorkspaceGroupInfo {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

export interface SessionLinkSnapshot {

  readonly enabled: boolean
  readonly sessions: readonly SessionChipInfo[]
  readonly workspaces: readonly SessionWorkspaceGroupInfo[]
}


export interface SessionLinkApi {
  list: () => SessionLinkSnapshot
  subscribe: (listener: () => void) => () => void

  open: (sessionId: string) => void

  inspect: (sessionId: string) => Promise<void>
}
