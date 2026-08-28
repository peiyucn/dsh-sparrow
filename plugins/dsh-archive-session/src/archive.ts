/** dsh-archive-session 纯逻辑：配置、标题缓存、确认强度、备份目录名。 */

import { join } from 'node:path'

export const DEFAULT_TITLE_CACHE_TTL_MS = 60_000
export const DEFAULT_TITLE_CACHE_MAX_ENTRIES = 256
export const BACKUP_SIDECAR = 'dsh-archive-session.json'

export interface ArchiveConfig {
  readonly backupRoot: string
  readonly titleCacheTtlMs: number
  readonly titleCacheMaxEntries: number
}

export interface ArchiveSidecar {
  readonly version: 1
  readonly sessionId: string
  readonly title: string
  readonly originalPath: string
  readonly archivedAt: string
  readonly workspaceIds: readonly string[]
}

export function normalizeArchiveConfig(input: Readonly<Partial<ArchiveConfig>> | undefined): ArchiveConfig {
  const fallbackHome = join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  const defaultBackupRoot = join(process.env.DSH_HOME?.trim() || fallbackHome, 'dsh-archive-session-backup')
  const config: ArchiveConfig = {
    backupRoot: input?.backupRoot?.trim() || defaultBackupRoot,
    titleCacheTtlMs: input?.titleCacheTtlMs ?? DEFAULT_TITLE_CACHE_TTL_MS,
    titleCacheMaxEntries: input?.titleCacheMaxEntries ?? DEFAULT_TITLE_CACHE_MAX_ENTRIES,
  }
  if (config.backupRoot === '') throw new Error('dsh-archive-session: backupRoot 不能为空')
  if (!Number.isSafeInteger(config.titleCacheTtlMs) || config.titleCacheTtlMs <= 0) {
    throw new Error('dsh-archive-session: titleCacheTtlMs 必须是正整数')
  }
  if (!Number.isSafeInteger(config.titleCacheMaxEntries) || config.titleCacheMaxEntries <= 0) {
    throw new Error('dsh-archive-session: titleCacheMaxEntries 必须是正整数')
  }
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

/** 短 TTL 的标题观察缓存：只缓存 fulfilled 结果。 */
export class TitleCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>()

  /**
   * @param ttlMs - 过期时间。
   * @param maxEntries - 容量上限。
   * @param now - 当前时间源（测试注入）。
   */
  constructor(
    readonly ttlMs: number,
    readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {
  }

  get(key: string): unknown | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    // 刷新为最近使用。
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: unknown): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}

/** 从备份 sidecar 解析出安全的恢复信息；非法输入返回 undefined。 */
export function parseBackupSidecar(value: unknown): ArchiveSidecar | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const sidecar = value as Record<string, unknown>
  if (sidecar.version !== 1) return undefined
  if (typeof sidecar.sessionId !== 'string' || sidecar.sessionId.trim() === '') return undefined
  if (typeof sidecar.originalPath !== 'string' || sidecar.originalPath.trim() === '') return undefined
  if (typeof sidecar.archivedAt !== 'string') return undefined
  if (!Array.isArray(sidecar.workspaceIds) || !sidecar.workspaceIds.every(id => typeof id === 'string')) return undefined
  return {
    version: 1,
    sessionId: sidecar.sessionId,
    title: typeof sidecar.title === 'string' ? sidecar.title : sidecar.sessionId,
    originalPath: sidecar.originalPath,
    archivedAt: sidecar.archivedAt,
    workspaceIds: sidecar.workspaceIds,
  }
}
