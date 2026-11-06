/**
 * DeskStore：统一对象模型的 host 侧入口（S0 只有便签表）。
 * 所有写入走存储域的单写串行链；乐观并发用对象 revision（不匹配抛 409）。
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { DomainError, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { DESK_DOMAIN } from '../../domain.js'
import { MAX_ACTIVE_NOTES, MAX_TRASH_NOTES, NODES_TABLE, PACKAGE_NAME } from '../../constants.js'
import {
  DeskModelError, createNoteRecord, filterNotes, normalizeCoordinate, normalizeLayer, normalizeNoteInput, patchNoteRecord,
  sortNotes, type NotePatch,
} from '../../model.js'
import type { DeskNote } from '../../contract.js'

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

  /** 统一对象表句柄（S0 里只有便签记录）。 */
  private get nodes() {
    return this.domain.table(NODES_TABLE)
  }

  /** 列出便签：置顶优先、最近更新在前，可按关键词过滤。 */
  /** 列表：默认全量（客户端墙面最多 100 张，够用）；工具面传 limit 限流，避免撑爆上下文。 */
  listNotes(query?: string, limit?: number): DeskNote[] {
    const all = [...this.nodes.entries()].map(([, note]) => note)
    const filtered = filterNotes(sortNotes(all), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_ACTIVE_NOTES + MAX_TRASH_NOTES) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }

  /** 按垃圾桶状态计数（容量上限校验用，O(n) 只在写入口跑，n ≤ 300）。 */
  private countByTrashed(trashed: boolean): number {
    let count = 0
    for (const [, note] of this.nodes.entries()) {
      if (note.trashed === trashed) count += 1
    }
    return count
  }

  /** 新建便签；入参归一化与校验在模型层完成。 */
  async createNote(raw: {
    readonly title?: unknown
    readonly body?: unknown
    readonly color?: unknown
    readonly x?: unknown
    readonly y?: unknown
    readonly z?: unknown
  }): Promise<DeskNote> {
    // 产品硬上限（owner 2026-11-06）：墙上最多 100 张，客户端与 host 双重校验，工具也绕不过去。
    if (this.countByTrashed(false) >= MAX_ACTIVE_NOTES) {
      throw new DeskModelError('NOTE_LIMIT', `便签墙最多放 ${MAX_ACTIVE_NOTES} 张便签`)
    }
    const input = normalizeNoteInput(raw)
    const note = createNoteRecord(input, {
      id: `note_${randomUUID()}`,
      now: new Date().toISOString(),
      x: normalizeCoordinate(raw.x),
      y: normalizeCoordinate(raw.y),
      z: normalizeLayer(raw.z),
    })
    await this.nodes.put(note.id, note)
    return note
  }

  /** 应用补丁；revision 不匹配 → REVISION_CONFLICT，记录不存在 → UNKNOWN_NOTE。 */
  async updateNote(id: string, expectedRevision: number, patch: NotePatch): Promise<DeskNote> {
    // 垃圾桶容量硬上限（owner 2026-11-06）：满了必须先清空，不允许无限堆积。
    if (patch.trashed === true && this.countByTrashed(true) >= MAX_TRASH_NOTES) {
      throw new DeskModelError('TRASH_FULL', `垃圾桶最多放 ${MAX_TRASH_NOTES} 张便签，请先清空垃圾桶`)
    }
    const now = new Date().toISOString()
    try {
      return await this.nodes.update(id, current => patchNoteRecord(current, patch, { expectedRevision, now }))
    } catch (error) {
      if (error instanceof DomainError && error.code === 'missing-key') {
        throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
      }
      throw error
    }
  }

  /** 删除便签；不存在时报 UNKNOWN_NOTE（与界面「已删除」反馈一致）。 */
  async deleteNote(id: string): Promise<boolean> {
    const deleted = await this.nodes.delete(id)
    if (!deleted) throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
    return true
  }

  /** 关闭存储域（插件卸载 / 宿主退出时由 effect 调用）。 */
  close(): Promise<void> {
    return this.domain.close()
  }
}
