/** 回收站：目录解析、清单、还原与彻底删除。所有路径校验都保证结果落在 trashRoot 内。 */

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
} from '../archive.js'
import { TRASH_SIDECAR } from '../constants.js'
import type {
  TrashDeleteAllResponse, TrashDeleteResponse, TrashDirResponse, TrashEntry, TrashListResponse,
  TrashRestoreAllResponse,
} from '../contract.js'
import { addArchivedId, attachWorkspaceAccounting } from './archive-set.js'
import type { RegistryMutationSurface } from './gates.js'
import { ArchiveError } from './http.js'

export async function ensureTrashRoot(trashRoot: string): Promise<void> {
  try {
    await mkdir(trashRoot, { recursive: true })
  } catch (error) {
    throw new ArchiveError('IO_ERROR', `无法创建回收站目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
}

/** 回收站目录内 subagent 子目录名必须安全（兼容官方 encodeSegment 转义形式），防 sidecar 篡改后路径穿越。 */
export function safeDirName(value: string): string {
  if (!isSafeSessionDirName(value)) throw new ArchiveError('BAD_BODY', `非法会话目录名：${value}`)
  return value
}

/** 保证传入目录名只能落到 trashRoot 下。 */
export function resolveTrashDir(trashRoot: string, trashId: string): string {
  const candidate = resolve(trashRoot, sanitizeSegment(trashId))
  const prefix = resolve(trashRoot)
  if (candidate !== prefix && !candidate.startsWith(`${prefix}${sep}`)) {
    throw new ArchiveError('BAD_BODY', '非法的回收站 id')
  }
  return candidate
}

/** 列出回收站根下符合安全命名的目录名。 */
async function trashDirNames(trashRoot: string): Promise<string[]> {
  try {
    const names = await readdir(trashRoot)
    return names.filter(name => /^[A-Za-z0-9_-]+$/u.test(name))
  } catch {
    return []
  }
}

async function listTrashItems(trashRoot: string): Promise<TrashEntry[]> {
  const names = await trashDirNames(trashRoot)
  const items: TrashEntry[] = []
  for (const name of names) {
    const dir = resolveTrashDir(trashRoot, name)
    try {
      const raw = await readFile(join(dir, TRASH_SIDECAR), 'utf8')
      const sidecar = parseTrashSidecar(JSON.parse(raw))
      if (sidecar !== undefined) {
        items.push(trashItemView(name, sidecar))
      }
    } catch {
      // 无合法 sidecar：按旧格式目录收纳（只列/删，不可还原）。
      try {
        const info = await stat(dir)
        if (info.isDirectory()) items.push(legacyTrashItem(name, info.mtimeMs))
      } catch {
        // 目录不存在或不可读：跳过，不让列表挂死。
      }
    }
  }
  return items.sort((left, right) => String((right as { archivedAt?: string }).archivedAt ?? '').localeCompare(String((left as { archivedAt?: string }).archivedAt ?? '')))
}

export async function listTrashPayload(trashRoot: string): Promise<TrashListResponse> {
  return { items: await listTrashItems(trashRoot) }
}

export function trashDirPayload(trashRoot: string): TrashDirResponse {
  // 面板提示信息用：明示回收站实际存放位置（卸载影响可见化）；displayPath 掩码 home 前缀（~）。
  return { path: trashRoot, displayPath: maskHomePath(trashRoot, homedir()) }
}

/** 按 sidecar 还原单个回收站条目（移动回原处 + 工作区记账 + 归档集回填）。 */
export async function restoreTrashDir(ctx: Context, surface: RegistryMutationSurface, trashDir: string): Promise<ArchiveSidecar> {
  let sidecar: ArchiveSidecar | undefined
  try {
    const raw = await readFile(join(trashDir, TRASH_SIDECAR), 'utf8')
    sidecar = parseTrashSidecar(JSON.parse(raw))
  } catch {
    throw new ArchiveError('UNKNOWN_TRASH', '该条目是旧格式（缺少 sidecar），无法还原；只能彻底删除', 400)
  }
  if (sidecar === undefined) {
    throw new ArchiveError('BAD_BODY', '回收站条目 sidecar 无效', 404)
  }
  // sidecar 校验：originalPath 必须是「绝对路径 + 安全命名的单层目录」（兼容官方 encodeSegment 转义形式），
  // 防被篡改后把回收站条目 rename 到任意位置。
  if (!isAbsolute(sidecar.originalPath)
    || dirname(sidecar.originalPath) === sidecar.originalPath
    || !isSafeSessionDirName(basename(sidecar.originalPath))) {
    throw new ArchiveError('UNKNOWN_TRASH', '该条目 sidecar 的原始路径不合法，拒绝还原', 400)
  }
  const sessionId = SessionId(sidecar.sessionId)
  if (ctx.sessions.get(sessionId) !== undefined || ctx.agents.get(sessionId) !== undefined) {
    throw new ArchiveError('SESSION_LIVE', '该会话仍被 dsh 进程占用（未释放），不能重复还原')
  }
  // 格式门为什么**不**装在这里（与 host/session-files.ts 的 trash / delete 不对称，是有意的）：
  // ① 宿主级门已在 apply() 开头由 assertHostCompatible 把住 —— 宿主会话格式不在支持集里时
  //    整个插件早已自停用，本函数根本不会被调用；
  // ② trash / delete 那里的逐 header 门（assertHeaderFormatSupported）针对的是「磁盘上混着
  //    旧代文件」，而**还原是撤销我们自己刚才那次移动**：把目录 rename 回 sidecar.originalPath，
  //    不解析任何会话内容，因此没有「认错格式 ⇒ 丢数据」的通路；
  // ③ 反过来，在这里加门会**把用户自己的撤销动作锁死** —— 回收站里躺着的旧代会话将永远
  //    无法还原（那时用户唯一的选择只剩彻底删除）。撤销路径必须始终可走。
  // sidecar 也不记录会话格式版本（见 archive.ts 的 ArchiveSidecar），本来就没有可判据。

  const subagentTargets = (sidecar.subagents ?? []).map(child => {
    const childId = SessionId(child.sessionId)
    if (!isAbsolute(child.originalPath)
      || dirname(child.originalPath) === child.originalPath
      || !isSafeSessionDirName(basename(child.originalPath))) {
      throw new ArchiveError('UNKNOWN_TRASH', `subagent 会话 ${String(childId)} 的原始路径不合法，拒绝还原`, 400)
    }
    if (ctx.sessions.get(childId) !== undefined || ctx.agents.get(childId) !== undefined) {
      throw new ArchiveError('SESSION_LIVE', `subagent 会话 ${String(childId)} 仍被 dsh 进程占用（未释放），不能重复还原`)
    }
    return { childId, originalPath: child.originalPath, workspaceIds: child.workspaceIds }
  })
  try {
    await mkdir(dirname(sidecar.originalPath), { recursive: true })
  } catch (error) {
    throw new ArchiveError('IO_ERROR', `无法创建还原目录：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  let targetDirExists = false
  try {
    const entries = await readdir(sidecar.originalPath)
    if (entries.length > 0) {
      throw new ArchiveError('TARGET_EXISTS', '原始会话位置已存在内容（可能此前已还原成功），拒绝覆盖还原')
    }
    targetDirExists = true
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    // 目录不存在可继续；其他读取错误由后续 rename 报出。
  }
  if (targetDirExists) {
    await rm(sidecar.originalPath, { recursive: true, force: false })
  }
  await rename(trashDir, sidecar.originalPath)
  // 记账 sidecar 在回收站目录里，上面这次 rename 会把它一起带回会话目录：它是回收站元数据
  // （含标题与原工作区记账 id），留在用户数据目录里只会被官方日志导出/打包捎带。**紧跟 rename 清理**：
  // 排在 subagent 移回之前，因为那条路径失败会直接抛出，放在末尾的清理就再也不会执行（审计 S2）；
  // 此刻条目已被 rename 走，删它不会把回收站条目退化成「无 sidecar 的旧格式条目」。删不掉只告警。
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
      // 父目录已移回，属「已还原但 subagent 未移回」——明确提示，避免重试撞 TARGET_EXISTS。
      throw new ArchiveError('IO_ERROR', `父会话已还原，但 subagent 会话目录移回失败（${String(target.childId)}，请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
    }
  }
  try {
    await rm(join(sidecar.originalPath, 'subagents'), { recursive: true, force: false })
  } catch {
    // subagents 目录不存在时忽略。
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
    // 目录已移回，属「已还原但记账失败」——明确提示，避免重试撞 TARGET_EXISTS。
    throw new ArchiveError('IO_ERROR', `会话已还原，但工作区记账失败（请勿重复还原）：${error instanceof Error ? error.message : String(error)}`, 500)
  }
  try {
    await addArchivedId(surface, sessionId)
  } catch (cleanupError) {
    ctx.logger.warn(`dsh-archive-manage: 还原后归档集同步失败：${String(cleanupError)}`)
  }
  return sidecar
}

/** 彻底删除单个回收站条目（目录不存在 / 不是目录 → 404）。 */
export async function deleteTrashEntry(trashRoot: string, trashId: string): Promise<TrashDeleteResponse> {
  const trashDir = resolveTrashDir(trashRoot, trashId)
  let info
  try {
    info = await stat(trashDir)
  } catch {
    throw new ArchiveError('UNKNOWN_TRASH', '回收站条目不存在', 404)
  }
  if (!info.isDirectory()) {
    throw new ArchiveError('UNKNOWN_TRASH', '回收站 id 不是目录', 404)
  }
  await rm(trashDir, { recursive: true, force: false })
  return { ok: true, trashId }
}

/** 全部还原：旧格式条目跳过并计数，单条失败只记录、不中断其余条目。 */
export async function restoreAllTrashItems(
  ctx: Context,
  surface: RegistryMutationSurface,
  trashRoot: string,
): Promise<TrashRestoreAllResponse> {
  const names = await trashDirNames(trashRoot)
  const restored: string[] = []
  const failed: Array<{ trashId: string; message: string }> = []
  let skippedLegacy = 0
  for (const name of names) {
    const dir = resolveTrashDir(trashRoot, name)
    try {
      const sidecar = await restoreTrashDir(ctx, surface, dir)
      restored.push(sidecar.sessionId)
    } catch (error) {
      if (error instanceof ArchiveError && error.code === 'UNKNOWN_TRASH') {
        skippedLegacy += 1
        continue
      }
      failed.push({ trashId: name, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { ok: true, restored, skippedLegacy, failed }
}

/** 全部彻底删除：逐条 stat + rm，失败条目按目录名回报。 */
export async function deleteAllTrashItems(trashRoot: string): Promise<TrashDeleteAllResponse> {
  const names = await trashDirNames(trashRoot)
  const failed: string[] = []
  let deleted = 0
  for (const name of names) {
    try {
      const dir = resolveTrashDir(trashRoot, name)
      const info = await stat(dir)
      if (info.isDirectory()) {
        await rm(dir, { recursive: true, force: false })
        deleted += 1
      }
    } catch {
      failed.push(name)
    }
  }
  return { ok: true, deleted, failed }
}
