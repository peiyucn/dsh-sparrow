/**
 * dsh-archive-session client half：sidebar footer 入口 + 归档弹窗。
 * 所有写操作都走 host 自有路由；客户端不直接碰文件。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ArchiveDock } from './ArchiveDock.js'

export const inject = ['slots']

interface ApiEnvelope<T> {
  readonly items?: T[]
  readonly error?: { readonly code?: string; readonly message?: string }
}

async function readApi<T>(path: string, init?: RequestInit): Promise<T[]> {
  const response = await fetch(path, init)
  const payload = await response.json() as ApiEnvelope<T>
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return payload.items ?? []
}

async function postApi<T = { ok?: boolean }>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `请求失败（HTTP ${response.status}）`)
  }
  return payload
}

/**
 * client half 入口：注册 sidebar footer action。
 * @param ctx - 浏览器侧 Cordis 上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'archive-session',
    order: 20,
    inject: () => ({
      listArchived: () => readApi<{
        sessionId: string
        title: string
        updatedAt: number
        live: boolean
        running: boolean
        backendSupported: boolean
        workspaceIds: readonly string[]
      }>('/api/archive-session/list'),
      listBackups: () => readApi<{
        backupId: string
        sessionId: string
        title: string
        archivedAt: string
        legacy: boolean
      }>('/api/archive-session/backups'),
      backupSession: (sessionId: string) => postApi('/api/archive-session/backup', { sessionId, confirm: true }),
      deleteSession: (sessionId: string, confirmTitle: string) => postApi('/api/archive-session/delete', { sessionId, confirmTitle }),
      restoreBackup: (backupId: string) => postApi('/api/archive-session/restore', { backupId }),
      deleteBackup: (backupId: string) => postApi('/api/archive-session/backup-delete', { backupId, confirm: true }),
      restoreAllBackups: () => postApi<{ restored?: string[]; skippedLegacy?: number; failed?: Array<{ backupId: string; message: string }> }>('/api/archive-session/backup-restore-all', { confirm: true }),
      deleteAllBackups: () => postApi<{ deleted?: number; failed?: string[] }>('/api/archive-session/backup-delete-all', { confirm: true }),
    }),
  }, ArchiveDock))
}

export { ArchiveDock } from './ArchiveDock.js'
export type { ArchiveDockInjected, ArchiveDockProps, ArchivedSessionItem, BackupItem } from './ArchiveDock.js'
