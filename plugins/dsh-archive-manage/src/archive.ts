/** dsh-archive-manage 纯逻辑：配置、确认强度、回收站目录、sidecar 解析。 */

import { join } from 'node:path'

export const TRASH_SIDECAR = 'dsh-archive-manage.json'
/** 回收站目录名（. 前缀与 DSH 官方目录区分）。 */
export const DEFAULT_TRASH_DIR = '.sessions-recycle-bin'

export interface ArchiveConfig {
  readonly trashRoot: string
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
  /** version 2：移入回收站时随父会话一起移动的 subagent 会话。 */
  readonly subagents?: readonly ArchiveSubagentSidecar[]
}

/** DSH 数据主目录（$DSH_HOME 优先，缺省 ~/.dsh）。 */
function dshHomeBase(): string {
  const fallbackHome = join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
  return process.env.DSH_HOME?.trim() || fallbackHome
}

/** 默认回收站目录的绝对路径。 */
export function defaultTrashDir(): string {
  return join(dshHomeBase(), DEFAULT_TRASH_DIR)
}

export function normalizeArchiveConfig(input: Readonly<Partial<ArchiveConfig>> | undefined): ArchiveConfig {
  const trash = input?.trashRoot?.trim()
  if (trash !== undefined && trash === '') throw new Error('dsh-archive-manage: trashRoot 不能为空')
  return { trashRoot: trash || defaultTrashDir() }
}

/** 彻底删除强确认：用户输入必须与会话当前标题逐字一致（trim 后比较）。 */
export function isDeleteConfirmationSufficient(expectedTitle: string, input: unknown): boolean {
  return typeof input === 'string' && input.trim() === expectedTitle.trim() && expectedTitle.trim() !== ''
}

/** 回收站目录 / 回收站 id 只允许大小写字母、数字、- 和 _，避免路径穿越。 */
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

/** 从回收站 sidecar 解析出安全的还原信息；非法输入返回 undefined。 */
export function parseTrashSidecar(value: unknown): ArchiveSidecar | undefined {
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

/** 旧格式条目（无 sidecar）：目录名即会话 id；只可列出/彻底删除，不可还原。 */
export interface LegacyTrashItem {
  readonly trashId: string
  readonly sessionId: string
  readonly title: string
  readonly archivedAt: string
  readonly workspaceIds: readonly []
  readonly legacy: true
}

/**
 * 从旧格式目录构造列表条目；时间取目录 mtime。
 * @param name - 回收站目录名（旧格式下即会话 id）。
 * @param mtimeMs - 目录最后修改时间（毫秒时间戳）。
 */
export function legacyTrashItem(name: string, mtimeMs: number): LegacyTrashItem {
  return {
    trashId: name,
    sessionId: name,
    title: name,
    archivedAt: new Date(mtimeMs).toISOString(),
    workspaceIds: [],
    legacy: true,
  }
}

/**
 * 游离会话识别（三差集，见 docs/spec/05-stray-sessions.md）：
 * 持久化清单里有 ∧ 不在归档集 ∧ 不挂任何工作区。保持输入顺序。
 * @param persistedIds - sessionPersistence.list() 的会话 id。
 * @param archivedIds - workspace 域 archivedSessionIds。
 * @param attachedIds - 所有 workspace.sessionIds 的并集。
 */
export function straySessionIds(
  persistedIds: readonly string[],
  archivedIds: readonly string[],
  attachedIds: readonly string[],
): string[] {
  const archived = new Set(archivedIds)
  const attached = new Set(attachedIds)
  return persistedIds.filter(id => !archived.has(id) && !attached.has(id))
}

/**
 * 从官方投影行解析「空白会话」信号（session_projcache 行形状：{ version, record: { identity, rows } }）：
 * blank = sessionListMetadata.blank === true 或 sessionStats.turns === 0。
 * 行缺失 / 形状异常 / 明确非空白一律返回 undefined（调用方按非空白保守对待）。
 */
export function parseBlankProjection(row: unknown): { blank: true } | undefined {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  const outer = row as Record<string, unknown>
  const recordCandidate = outer.record
  const record = (typeof recordCandidate === 'object' && recordCandidate !== null && !Array.isArray(recordCandidate)
    ? recordCandidate
    : outer) as Record<string, unknown>
  const rowsCandidate = record.rows
  if (typeof rowsCandidate !== 'object' || rowsCandidate === null || Array.isArray(rowsCandidate)) return undefined
  const rows = rowsCandidate as Record<string, unknown>
  const metaVal = (rows.sessionListMetadata as Record<string, unknown> | undefined)?.val
  const statsVal = (rows.sessionStats as Record<string, unknown> | undefined)?.val
  const metaBlank = (metaVal as Record<string, unknown> | undefined)?.blank
  const statsTurns = (statsVal as Record<string, unknown> | undefined)?.turns
  if (metaBlank === true || statsTurns === 0) return { blank: true }
  return undefined
}
