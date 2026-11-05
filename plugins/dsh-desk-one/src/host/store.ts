/**
 * DeskStore：统一对象模型的 host 侧入口（S0 只有便签表）。
 * 所有写入走存储域的单写串行链；乐观并发用对象 revision（不匹配抛 409）。
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { DomainError, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { DESK_DOMAIN } from '../domain.js'
import { NOTES_TABLE, PACKAGE_NAME } from '../constants.js'
import {
  DeskModelError, createNoteRecord, filterNotes, normalizeNoteInput, patchNoteRecord, sortNotes,
  type NotePatch,
} from '../model.js'
import type { DeskNote } from '../contract.js'

type DeskDomain = Domain<typeof DESK_DOMAIN>

export class DeskStore {
  private constructor(private readonly domain: DeskDomain) {}

  /** 打开存储域；失败时记一条面向用户的告警再抛出（交给 cordis 标 inactive）。 */
  static async open(ctx: Context): Promise<DeskStore> {
    try {
      const domain = await ctx.storageDomain.open(DESK_DOMAIN)
      return new DeskStore(domain)
    } catch (error) {
      ctx.logger.warn(
        `${PACKAGE_NAME}: 打开存储域失败：${error instanceof Error ? error.message : String(error)}；已停用插件以免影响 dsh`,
      )
      throw error
    }
  }

  /** 便签表句柄。 */
  private get notes() {
    return this.domain.table(NOTES_TABLE)
  }

  /** 列出便签：置顶优先、最近更新在前，可按关键词过滤。 */
  listNotes(query?: string): DeskNote[] {
    const all = [...this.notes.entries()].map(([, note]) => note)
    return filterNotes(sortNotes(all), query)
  }

  /** 新建便签；入参归一化与校验在模型层完成。 */
  async createNote(raw: { readonly title?: unknown; readonly body?: unknown; readonly color?: unknown }): Promise<DeskNote> {
    const input = normalizeNoteInput(raw)
    const note = createNoteRecord(input, { id: `note_${randomUUID()}`, now: new Date().toISOString() })
    await this.notes.put(note.id, note)
    return note
  }

  /** 应用补丁；revision 不匹配 → REVISION_CONFLICT，记录不存在 → UNKNOWN_NOTE。 */
  async updateNote(id: string, expectedRevision: number, patch: NotePatch): Promise<DeskNote> {
    const now = new Date().toISOString()
    try {
      return await this.notes.update(id, current => patchNoteRecord(current, patch, { expectedRevision, now }))
    } catch (error) {
      if (error instanceof DomainError && error.code === 'missing-key') {
        throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
      }
      throw error
    }
  }

  /** 删除便签；不存在时报 UNKNOWN_NOTE（与界面「已删除」反馈一致）。 */
  async deleteNote(id: string): Promise<boolean> {
    const deleted = await this.notes.delete(id)
    if (!deleted) throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
    return true
  }

  /** 关闭存储域（插件卸载 / 宿主退出时由 effect 调用）。 */
  close(): Promise<void> {
    return this.domain.close()
  }
}
