

import { randomUUID } from 'node:crypto'
import { MAX_ACTIVE_NOTES, MAX_TRASH_NOTES } from '../../constants.js'
import {
  DeskModelError, createNoteRecord, filterNotes, normalizeCoordinate, normalizeLayer, normalizeNoteInput, patchNoteRecord,
  sortNotes, type NotePatch,
} from '../../model.js'
import type { DeskNote } from '../../contract.js'
import type { StoreCore } from './core.js'


export interface CreateNoteInput {
  readonly title?: unknown
  readonly body?: unknown
  readonly color?: unknown
  readonly x?: unknown
  readonly y?: unknown
  readonly z?: unknown
}

export class NoteRepository {
  constructor(private readonly core: StoreCore) {}


  listNotes(query?: string, limit?: number): DeskNote[] {
    const notes = this.core.allNodes().filter((node): node is DeskNote => node.kind === 'note')
    const filtered = filterNotes(sortNotes(notes), query)
    if (limit === undefined) return filtered
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_ACTIVE_NOTES + MAX_TRASH_NOTES) : 0
    return bounded === 0 ? filtered : filtered.slice(0, bounded)
  }


  private countNotesByTrashed(trashed: boolean): number {
    let count = 0
    for (const node of this.core.allNodes()) {
      if (node.kind === 'note' && node.trashed === trashed) count += 1
    }
    return count
  }


  async createNote(raw: CreateNoteInput): Promise<DeskNote> {

    if (this.countNotesByTrashed(false) >= MAX_ACTIVE_NOTES) {
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
    await this.core.nodes.put(note.id, note)
    return note
  }


  async updateNote(id: string, expectedRevision: number, patch: NotePatch): Promise<DeskNote> {
    if (patch.trashed === true && this.countNotesByTrashed(true) >= MAX_TRASH_NOTES) {
      throw new DeskModelError('TRASH_FULL', `垃圾桶最多放 ${MAX_TRASH_NOTES} 张便签，请先清空垃圾桶`)
    }
    const now = new Date().toISOString()
    try {
      const updated = await this.core.nodes.update(id, (current) => {
        if (current.kind !== 'note') throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
        return patchNoteRecord(current, patch, { expectedRevision, now })
      })
      if (updated.kind !== 'note') throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
      return updated
    } catch (error) {
      throw this.core.mapMissing(error, 'UNKNOWN_NOTE', `便签不存在：${id}`)
    }
  }


  async deleteNote(id: string): Promise<boolean> {
    const current = this.core.nodes.get(id)
    if (current === undefined || current.kind !== 'note') {
      throw new DeskModelError('UNKNOWN_NOTE', `便签不存在：${id}`)
    }
    await this.core.nodes.delete(id)
    return true
  }
}
