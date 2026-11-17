

import { mkdir, readdir, readFile, rename, rm, rmdir, stat } from 'node:fs/promises'
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
import { PACKAGE_NAME, TRASH_SIDECAR } from './constants.js'
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


export function safeDirName(value: string): string {
  if (!isSafeSessionDirName(value)) throw new SessionsError('BAD_BODY', `非法会话目录名：${value}`)
  return value
}


export function resolveTrashDir(trashRoot: string, trashId: string): string {
  const candidate = resolve(trashRoot, sanitizeSegment(trashId))
  const prefix = resolve(trashRoot)
  if (candidate !== prefix && !candidate.startsWith(`${prefix}${sep}`)) {
    throw new SessionsError('BAD_BODY', '非法的回收站 id')
  }
  return candidate
}


async function trashDirNames(trashRoot: string): Promise<string[]> {
  try {
    const names = await readdir(trashRoot)
    return names.filter(name => /^[A-Za-z0-9_-]+$/u.test(name))
  } catch {
    return []
  }
}


async function readTrashSidecar(trashDir: string): Promise<ArchiveSidecar | undefined> {
  try {
    const raw = await readFile(join(trashDir, TRASH_SIDECAR), 'utf8')
    return parseTrashSidecar(JSON.parse(raw))
  } catch {
    return undefined
  }
}


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

    const sidecar = await readTrashSidecar(dir)
    if (sidecar !== undefined) {
      items.push(trashItemView(name, sidecar))
      continue
    }
    try {
      const info = await stat(dir)
      if (info.isDirectory()) items.push(legacyTrashItem(name, info.mtimeMs))
    } catch {

    }
  }
  return items.sort((left, right) => String((right as { archivedAt?: string }).archivedAt ?? '').localeCompare(String((left as { archivedAt?: string }).archivedAt ?? '')))
}

export async function listTrashPayload(trashRoot: string): Promise<TrashListResponse> {
  return { items: await listTrashItems(trashRoot) }
}

export function trashDirPayload(trashRoot: string): TrashDirResponse {


  return { path: trashRoot, displayPath: maskHomePath(trashRoot, homedir()) }
}


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



  if (!isAbsolute(sidecar.originalPath)
    || dirname(sidecar.originalPath) === sidecar.originalPath
    || !isSafeSessionDirName(basename(sidecar.originalPath))) {
    throw new SessionsError('UNKNOWN_TRASH', '该条目 sidecar 的原始路径不合法，拒绝还原', 400)
  }
  const sessionId = SessionId(sidecar.sessionId)
  if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
    throw new SessionsError('SESSION_LIVE', '该会话仍被 dsh 进程占用（未释放），不能重复还原')
  }














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

  }
  if (targetDirExists) {


    try {
      await rmdir(sidecar.originalPath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code !== 'ENOENT') {
        throw new SessionsError('TARGET_EXISTS', '原始会话位置在还原过程中出现了新内容，拒绝覆盖还原')
      }
    }
  }
  await rename(trashDir, sidecar.originalPath)






  try {
    await rm(join(sidecar.originalPath, TRASH_SIDECAR), { force: true })
  } catch (error) {
    ctx.logger.warn(`${PACKAGE_NAME}: 还原后回收站记账文件清理失败（${sidecar.originalPath}）：${error instanceof Error ? error.message : String(error)}`)
  }
  for (const target of subagentTargets) {
    try {
      await mkdir(dirname(target.originalPath), { recursive: true })
      await rename(join(sidecar.originalPath, 'subagents', safeDirName(basename(target.originalPath))), target.originalPath)
    } catch (error) {


      throw new SessionsError('IO_ERROR', `父会话已还原，但 subagent 会话目录移回失败（${String(target.childId)}，请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
    }
  }
  try {
    await rm(join(sidecar.originalPath, 'subagents'), { recursive: true, force: false })
  } catch {

  }
  try {
    await attachWorkspaceAccounting(ctx, sessionId, sidecar.workspaceIds)
    for (const target of subagentTargets) {
      try {
        await attachWorkspaceAccounting(ctx, target.childId, target.workspaceIds)
      } catch (childError) {
        ctx.logger.warn(`${PACKAGE_NAME}: 还原后 subagent 工作区记账失败（${String(target.childId)}）：${String(childError)}`)
      }
    }
  } catch (error) {


    throw new SessionsError('IO_ERROR', `会话已还原，但工作区记账失败（请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  try {
    await addArchivedId(surface, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`${PACKAGE_NAME}: 还原后归档集同步失败：${String(cleanupError)}`)
  }
  return sidecar
}


async function invalidateTrashProjectionRows(ctx: Context, sidecar: ArchiveSidecar | undefined): Promise<void> {
  if (sidecar === undefined) return
  await invalidateProjectionCacheGuarded(ctx, sidecar.sessionId)
  for (const child of sidecar.subagents ?? []) {
    await invalidateProjectionCacheGuarded(ctx, child.sessionId)
  }
}


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


interface RestoreAllResult {
  readonly body: TrashRestoreAllResponse
  readonly restoredTreeIds: string[]
}


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
