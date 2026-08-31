/** dsh-archive-session 纯逻辑：配置、确认强度、备份目录名、sidecar 解析。 */

import { join } from 'node:path'

export const BACKUP_SIDECAR = 'dsh-archive-session.json'
/** 备份目录名（沿用此前版本实际使用的目录，让旧备份直接可见）。 */
export const DEFAULT_BACKUP_DIR = 'sessions-archived-backup'

export interface ArchiveConfig {
  readonly backupRoot: string
}

export interface ArchiveSubagentSidecar {
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly workspaceIds: readonly string[]
}

export interface ArchiveSidecar {
  readonly version: 1 | 2
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
  /** version 2：备份时随父会话一起移动的 subagent 会话。 */
  readonly subagents?: readonly ArchiveSubagentSidecar[]
}

export function normalizeArchiveConfig(input: Readonly<Partial<ArchiveConfig>> | undefined): ArchiveConfig {
  const fallbackHome = join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  const defaultBackupRoot = join(process.env.DSH_HOME?.trim() || fallbackHome, DEFAULT_BACKUP_DIR)
  const config: ArchiveConfig = {
    backupRoot: input?.backupRoot?.trim() || defaultBackupRoot,
  }
  if (config.backupRoot === '') throw new Error('dsh-archive-session: backupRoot 不能为空')
  return config
}

/** 删除档强确认：用户输入必须与会话当前标题逐字一致（trim 后比较）。 */
export function isDeleteConfirmationSufficient(expectedTitle: string, input: unknown): boolean {
  return typeof input === 'string' && input.trim() === expectedTitle.trim() && expectedTitle.trim() !== ''
}

/** 备份目录 / 备份 id 只允许大小写字母、数字、- 和 _，避免路径穿越。 */
export function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_-]/gu, '_')
  return /[A-Za-z0-9]/u.test(safe) ? safe : 'unknown'
}

/**
 * 把 home 目录前缀掩码为 `~`（跨平台）：Windows 反斜杠与 POSIX 斜杠都处理；
 * 先精确匹配，再回退大小写不敏感匹配（Windows 大小写不敏感的盘符路径）。
 * 不在 home 下的路径原样返回。
 */
export function maskHomePath(path: string, homeDir: string): string {
  const home = homeDir.replace(/[\\/]+$/u, '')
  if (home === '') return path
  const hasPrefix = (candidate: string, prefix: string): boolean =>
    candidate === prefix || candidate.startsWith(`${prefix}\\`) || candidate.startsWith(`${prefix}/`)
  if (hasPrefix(path, home)) return `~${path.slice(home.length)}`
  if (hasPrefix(path.toLowerCase(), home.toLowerCase())) return `~${path.slice(home.length)}`
  return path
}

/** 从备份 sidecar 解析出安全的恢复信息；非法输入返回 undefined。 */
export function parseBackupSidecar(value: unknown): ArchiveSidecar | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const sidecar = value as Record<string, unknown>
  if (sidecar.version !== 1 && sidecar.version !== 2) return undefined
  if (typeof sidecar.sessionId !== 'string' || sidecar.sessionId.trim() === '') return undefined
  if (typeof sidecar.originalPath !== 'string' || sidecar.originalPath.trim() === '') return undefined
  if (typeof sidecar.archivedAt !== 'string') return undefined
  if (!Array.isArray(sidecar.workspaceIds) || !sidecar.workspaceIds.every(id => typeof id === 'string')) return undefined
  let subagents: ArchiveSubagentSidecar[] | undefined
  if (sidecar.version === 2 && sidecar.subagents !== undefined) {
    if (!Array.isArray(sidecar.subagents)) return undefined
    subagents = sidecar.subagents.map((item): ArchiveSubagentSidecar | undefined => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return undefined
      const child = item as Record<string, unknown>
      if (typeof child.sessionId !== 'string' || child.sessionId.trim() === '') return undefined
      if (typeof child.originalPath !== 'string' || child.originalPath.trim() === '') return undefined
      if (!Array.isArray(child.workspaceIds) || !child.workspaceIds.every(id => typeof id === 'string')) return undefined
      return {
        sessionId: child.sessionId,
        title: typeof child.title === 'string' ? child.title : child.sessionId,
        originalPath: child.originalPath,
        workspaceIds: child.workspaceIds,
      }
    }).filter((item): item is ArchiveSubagentSidecar => item !== undefined)
    if (subagents.length !== (sidecar.subagents as unknown[]).length) return undefined
  }
  return {
    version: sidecar.version,
    sessionId: sidecar.sessionId,
    title: typeof sidecar.title === 'string' ? sidecar.title : sidecar.sessionId,
    originalPath: sidecar.originalPath,
    archivedAt: sidecar.archivedAt,
    workspaceIds: sidecar.workspaceIds,
    subagents,
  }
}

/** 旧格式备份条目（无 sidecar）：目录名即会话 id；只可列出/删除，不可恢复。 */
export interface LegacyBackupItem {
  readonly backupId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly []
  readonly legacy: true
}

/**
 * 从旧格式备份目录构造列表条目；时间取目录 mtime。
 * @param name - 备份目录名（旧格式下即会话 id）。
 * @param mtimeMs - 目录最后修改时间（毫秒时间戳）。
 */
export function legacyBackupItem(name: string, mtimeMs: number): LegacyBackupItem {
  return {
    backupId: name,
    sessionId: name,
    title: name,
    archivedAt: new Date(mtimeMs).toISOString(),
    workspaceIds: [],
    legacy: true,
  }
}
