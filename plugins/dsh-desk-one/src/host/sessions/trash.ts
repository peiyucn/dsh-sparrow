/** Trash: directory resolution, listing, restore, and permanent deletion. Every path check guarantees the result
 *  stays under trashRoot. */

import { mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  isSafeSessionDirName, legacyTrashItem, maskHomePath, parseTrashSidecar, sanitizeSegment, trashItemView,
  type ArchiveSidecar,
} from './archive.js'
import { TRASH_SIDECAR } from './constants.js'
import type {
  TrashDeleteAllResponse, TrashDeleteResponse, TrashDirResponse, TrashEntry, TrashListResponse,
  TrashRestoreAllResponse,
} from '../../session-admin.js'
import { addArchivedId, attachWorkspaceAccounting } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import { SessionsError } from './errors.js'
import { invalidateProjectionCacheGuarded } from './projection.js'

export async function ensureTrashRoot(trashRoot: string): Promise<void> {
  try {
    await mkdir(trashRoot, { recursive: true })
  } catch (error) {
    throw new SessionsError('IO_ERROR', `无法创建回收站目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
}

/** Subagent directory names inside a trash directory must be safe (compatible with official encodeSegment escaping)
 *  to prevent path traversal after sidecar tampering. */
export function safeDirName(value: string): string {
  if (!isSafeSessionDirName(value)) throw new SessionsError('BAD_BODY', `非法会话目录名：${value}`)
  return value
}

/** Ensure the supplied directory name can only resolve under trashRoot. */
export function resolveTrashDir(trashRoot: string, trashId: string): string {
  const candidate = resolve(trashRoot, sanitizeSegment(trashId))
  const prefix = resolve(trashRoot)
  if (candidate !== prefix && !candidate.startsWith(`${prefix}${sep}`)) {
    throw new SessionsError('BAD_BODY', '非法的回收站 id')
  }
  return candidate
}

/** List directory names under the trash root that satisfy the safe naming rule. */
async function trashDirNames(trashRoot: string): Promise<string[]> {
  try {
    const names = await readdir(trashRoot)
    return names.filter(name => /^[A-Za-z0-9_-]+$/u.test(name))
  } catch {
    return []
  }
}

/** Read a trash entry's sidecar; missing file / bad JSON / invalid shape all yield undefined (the caller treats it
 *  as the legacy format). */
async function readTrashSidecar(trashDir: string): Promise<ArchiveSidecar | undefined> {
  try {
    const raw = await readFile(join(trashDir, TRASH_SIDECAR), 'utf8')
    return parseTrashSidecar(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/**
 * All restorable session ids in the trash (parent + child sessions recorded in the sidecar).
 * The startup sweep uses this to keep their projection rows: they are not in the persistence list, but they are
 * still restorable sessions, and projection rows are the only source of titles / subagent labels after restore
 * (see the startup sweep notes in projection.ts).
 */
export async function trashedSessionIds(trashRoot: string): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const name of await trashDirNames(trashRoot)) {
    const sidecar = await readTrashSidecar(resolveTrashDir(trashRoot, name))
    if (sidecar === undefined) continue
    ids.add(sidecar.sessionId)
    for (const child of sidecar.subagents ?? []) ids.add(child.sessionId)
  }
  return ids
}

async function listTrashItems(trashRoot: string): Promise<TrashEntry[]> {
  const names = await trashDirNames(trashRoot)
  const items: TrashEntry[] = []
  for (const name of names) {
    const dir = resolveTrashDir(trashRoot, name)
    // No valid sidecar: treat it as a legacy-format directory (list/delete only, no restore).
    const sidecar = await readTrashSidecar(dir)
    if (sidecar !== undefined) {
      items.push(trashItemView(name, sidecar))
      continue
    }
    try {
      const info = await stat(dir)
      if (info.isDirectory()) items.push(legacyTrashItem(name, info.mtimeMs))
    } catch {
      // Directory missing or unreadable: skip it so the list does not hang.
    }
  }
  return items.sort((left, right) => String((right as { archivedAt?: string }).archivedAt ?? '').localeCompare(String((left as { archivedAt?: string }).archivedAt ?? '')))
}

export async function listTrashPayload(trashRoot: string): Promise<TrashListResponse> {
  return { items: await listTrashItems(trashRoot) }
}

export function trashDirPayload(trashRoot: string): TrashDirResponse {
  // For the panel hint: show where the trash actually lives (makes the impact of uninstalling visible); displayPath masks
  // the home prefix (~).
  return { path: trashRoot, displayPath: maskHomePath(trashRoot, homedir()) }
}

/** Restore one trash entry according to its sidecar (move back to the original location + workspace accounting +
 *  archived-set reinsertion). */
export async function restoreTrashDir(ctx: Context, surface: RegistryMutationSurface, trashDir: string): Promise<ArchiveSidecar> {
  let sidecar: ArchiveSidecar | undefined
  try {
    const raw = await readFile(join(trashDir, TRASH_SIDECAR), 'utf8')
    sidecar = parseTrashSidecar(JSON.parse(raw))
  } catch {
    throw new SessionsError('UNKNOWN_TRASH', '该条目是旧格式（缺少 sidecar），无法还原；只能彻底删除', 400)
  }
  if (sidecar === undefined) {
    throw new SessionsError('BAD_BODY', '回收站条目 sidecar 无效', 404)
  }
  // Sidecar validation: originalPath must be "an absolute path + a safely named single-level directory"
  // (compatible with official encodeSegment escaping) to prevent a tampered sidecar from renaming the trash
  // entry to an arbitrary location.
  if (!isAbsolute(sidecar.originalPath)
    || dirname(sidecar.originalPath) === sidecar.originalPath
    || !isSafeSessionDirName(basename(sidecar.originalPath))) {
    throw new SessionsError('UNKNOWN_TRASH', '该条目 sidecar 的原始路径不合法，拒绝还原', 400)
  }
  const sessionId = SessionId(sidecar.sessionId)
  if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
    throw new SessionsError('SESSION_LIVE', '该会话仍被 dsh 进程占用（未释放），不能重复还原')
  }
  // Why the format gate is deliberately **not** installed here (the asymmetry with trash / delete in
  // host/session-files.ts is intentional):
  // ① The host-level gate is already enforced at the top of apply() by assertHostCompatible — when the host
  //    session format is outside the supported set, the whole plugin has already disabled itself and this
  //    function is never called;
  // ② the per-header gate in trash / delete (assertHeaderFormatSupported) targets "old-generation files mixed
  //    onto disk", whereas **restore undoes the move we just performed**: it renames the directory back to
  //    sidecar.originalPath without parsing any session content, so there is no "misread format ⇒ data loss" path;
  // ③ conversely, adding a gate here would **lock out the user's own undo action** — old-generation sessions
  //    sitting in the trash could never be restored (leaving permanent deletion as the only option). The undo path
  //    must always remain available.
  // The sidecar does not record a session format version either (see ArchiveSidecar in archive.ts), so there is
  // no criterion to test in the first place.

  const subagentTargets = (sidecar.subagents ?? []).map(child => {
    const childId = SessionId(child.sessionId)
    if (!isAbsolute(child.originalPath)
      || dirname(child.originalPath) === child.originalPath
      || !isSafeSessionDirName(basename(child.originalPath))) {
      throw new SessionsError('UNKNOWN_TRASH', `subagent 会话 ${String(childId)} 的原始路径不合法，拒绝还原`, 400)
    }
    if (ctx.sessions.get(childId) !== undefined || ctx.agents.get(childId) !== undefined) {
      throw new SessionsError('SESSION_LIVE', `subagent 会话 ${String(childId)} 仍被 dsh 进程占用（未释放），不能重复还原`)
    }
    return { childId, originalPath: child.originalPath, workspaceIds: child.workspaceIds }
  })
  try {
    await mkdir(dirname(sidecar.originalPath), { recursive: true })
  } catch (error) {
    throw new SessionsError('IO_ERROR', `无法创建还原目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  let targetDirExists = false
  try {
    const entries = await readdir(sidecar.originalPath)
    if (entries.length > 0) {
      throw new SessionsError('TARGET_EXISTS', '原始会话位置已存在内容（可能此前已还原成功），拒绝覆盖还原')
    }
    targetDirExists = true
  } catch (error) {
    if (error instanceof SessionsError) throw error
    // A missing directory can be ignored; other read errors surface from the subsequent rename.
  }
  if (targetDirExists) {
    await rm(sidecar.originalPath, { recursive: true, force: false })
  }
  await rename(trashDir, sidecar.originalPath)
  // The accounting sidecar lives in the trash directory, so the rename above carries it back into the session
  // directory: it is trash metadata (including the title and original workspace accounting ids), and leaving it in
  // the user data directory would only get it swept into official log exports/packages. **Clean it up right after
  // the rename**: before moving subagents back, because that path throws on failure and a cleanup placed at the end
  // would never run (audit S2). At this point the entry has been renamed away, so deleting it cannot degrade the
  // trash entry into "a legacy entry without a sidecar". If deletion fails, only log a warning.
  try {
    await rm(join(sidecar.originalPath, TRASH_SIDECAR), { force: true })
  } catch (error) {
    ctx.logger.warn(`dsh-archive-manage: 还原后回收站记账文件清理失败（${sidecar.originalPath}）：${error instanceof Error ? error.message : String(error)}`)
  }
  for (const target of subagentTargets) {
    try {
      await mkdir(dirname(target.originalPath), { recursive: true })
      await rename(join(sidecar.originalPath, 'subagents', safeDirName(basename(target.originalPath))), target.originalPath)
    } catch (error) {
      // The parent is already back: this is "restored, but the subagent was not moved back" — say so explicitly
      // so a retry does not hit TARGET_EXISTS.
      throw new SessionsError('IO_ERROR', `父会话已还原，但 subagent 会话目录移回失败（${String(target.childId)}，请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
    }
  }
  try {
    await rm(join(sidecar.originalPath, 'subagents'), { recursive: true, force: false })
  } catch {
    // Ignore a missing subagents directory.
  }
  try {
    await attachWorkspaceAccounting(ctx, sessionId, sidecar.workspaceIds)
    for (const target of subagentTargets) {
      try {
        await attachWorkspaceAccounting(ctx, target.childId, target.workspaceIds)
      } catch (childError) {
        ctx.logger.warn(`dsh-archive-manage: 还原后 subagent 工作区记账失败（${String(target.childId)}）：${String(childError)}`)
      }
    }
  } catch (error) {
    // The directory is already back: this is "restored, but accounting failed" — say so explicitly so a retry
    // does not hit TARGET_EXISTS.
    throw new SessionsError('IO_ERROR', `会话已还原，但工作区记账失败（请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  try {
    await addArchivedId(surface, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`dsh-archive-manage: 还原后归档集同步失败：${String(cleanupError)}`)
  }
  return sidecar
}

/**
 * Invalidate projection rows for permanently deleted trash entries (parent + child sessions in the sidecar).
 * These rows were **preserved** by the startup sweep while the sessions were in the trash (see projection.ts),
 * so deletion must clean them up here; otherwise sessions absent from persistence would leave projection rows
 * that can never be read again.
 */
async function invalidateTrashProjectionRows(ctx: Context, sidecar: ArchiveSidecar | undefined): Promise<void> {
  if (sidecar === undefined) return
  await invalidateProjectionCacheGuarded(ctx, sidecar.sessionId)
  for (const child of sidecar.subagents ?? []) {
    await invalidateProjectionCacheGuarded(ctx, child.sessionId)
  }
}

/** Permanently delete a single trash entry (missing directory / not a directory → 404). */
export async function deleteTrashEntry(ctx: Context, trashRoot: string, trashId: string): Promise<TrashDeleteResponse> {
  const trashDir = resolveTrashDir(trashRoot, trashId)
  let info
  try {
    info = await stat(trashDir)
  } catch {
    throw new SessionsError('UNKNOWN_TRASH', '回收站条目不存在', 404)
  }
  if (!info.isDirectory()) {
    throw new SessionsError('UNKNOWN_TRASH', '回收站 id 不是目录', 404)
  }
  const sidecar = await readTrashSidecar(trashDir)
  await rm(trashDir, { recursive: true, force: false })
  await invalidateTrashProjectionRows(ctx, sidecar)
  return { ok: true, trashId }
}

/** Result of "restore all": the response body + session ids (roots + children, in restore order) for the route
 *  to seed projection rows in the background after responding. */
interface RestoreAllResult {
  readonly body: TrashRestoreAllResponse
  readonly restoredTreeIds: string[]
}

/** Restore all: legacy entries are skipped and counted; a single failure is recorded without stopping the rest. */
export async function restoreAllTrashItems(
  ctx: Context,
  surface: RegistryMutationSurface,
  trashRoot: string,
): Promise<RestoreAllResult> {
  const names = await trashDirNames(trashRoot)
  const restored: string[] = []
  const restoredTreeIds: string[] = []
  const failed: Array<{ trashId: string; message: string }> = []
  let skippedLegacy = 0
  for (const name of names) {
    const dir = resolveTrashDir(trashRoot, name)
    try {
      const sidecar = await restoreTrashDir(ctx, surface, dir)
      restored.push(sidecar.sessionId)
      // Root first, then child sessions in sidecar order: background seeding / added notifications keep
      // "parent before child".
      restoredTreeIds.push(sidecar.sessionId, ...(sidecar.subagents ?? []).map(child => child.sessionId))
    } catch (error) {
      if (error instanceof SessionsError && error.code === 'UNKNOWN_TRASH') {
        skippedLegacy += 1
        continue
      }
      failed.push({ trashId: name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { body: { ok: true, restored, skippedLegacy, failed }, restoredTreeIds }
}

/** Permanently delete all: stat + rm one by one, reporting failed entries by directory name. */
export async function deleteAllTrashItems(ctx: Context, trashRoot: string): Promise<TrashDeleteAllResponse> {
  const names = await trashDirNames(trashRoot)
  const failed: string[] = []
  let deleted = 0
  for (const name of names) {
    try {
      const dir = resolveTrashDir(trashRoot, name)
      const info = await stat(dir)
      if (info.isDirectory()) {
        const sidecar = await readTrashSidecar(dir)
        await rm(dir, { recursive: true, force: false })
        await invalidateTrashProjectionRows(ctx, sidecar)
        deleted += 1
      }
    } catch {
      failed.push(name)
    }
  }
  return { ok: true, deleted, failed }
}
