

import type { Context } from '@deepseek-ai/cordis'
import { DESK_DOMAIN } from './domain.js'
import { PACKAGE_NAME } from '../constants.js'
import type { GroupPatch, NotePatch, TaskPatch } from '../model.js'
import type { CalendarDraft, EventDraft, EventQuery } from './schedule/records.js'
import type { SessionIndexDraft } from './sessions/records.js'
import type {
  DeskCalendar, DeskEvent, DeskNote, DeskScheduleSource, DeskSessionIndex, DeskTask, DeskTaskGroup, ScheduleSyncError,
} from '../contract.js'
import type {
  DeskNotebookConfig, NoteBaseline, NoteDraft, NoteFileRef, ReviewRecord, ReviewSessionMarker,
} from '../notebook-contract.js'
import { StoreCore, type DeskDomain } from './store/core.js'
import { NoteRepository, type CreateNoteInput } from './store/notes.js'
import { TaskRepository, type CreateTaskInput } from './store/tasks.js'
import { GroupRepository, type CreateGroupInput } from './store/groups.js'
import { ScheduleRepository, type CreateScheduleSourceInput, type UpsertScheduleSourceInput } from './store/schedule.js'
import { SessionIndexRepository } from './store/sessions.js'
import { NotebookRepository, type EnsureNoteFileInput, type SaveNoteBaselineInput, type SaveNoteDraftInput } from './store/notebook.js'
import { ReviewRepository, type CreateReviewRecordInput, type MarkReviewSessionInput } from './store/review.js'

export class DeskStore {
  private readonly core: StoreCore
  private readonly notes: NoteRepository
  private readonly tasks: TaskRepository
  private readonly groups: GroupRepository
  private readonly schedule: ScheduleRepository
  private readonly sessions: SessionIndexRepository
  private readonly notebook: NotebookRepository
  private readonly review: ReviewRepository

  private constructor(domain: DeskDomain) {
    this.core = new StoreCore(domain)
    this.groups = new GroupRepository(this.core)
    this.notes = new NoteRepository(this.core)
    this.tasks = new TaskRepository(this.core, this.groups)
    this.schedule = new ScheduleRepository(this.core)
    this.sessions = new SessionIndexRepository(this.core)
    this.notebook = new NotebookRepository(this.core)
    this.review = new ReviewRepository(this.core)
  }


  static async open(ctx: Context): Promise<DeskStore> {
    try {
      const domain = await ctx.storageDomain.open(DESK_DOMAIN)
      const store = new DeskStore(domain)
      await store.core.purgeLegacyRecords(ctx)
      return store
    } catch (error) {
      ctx.logger.warn(
        `${PACKAGE_NAME}: 打开存储域失败：${error instanceof Error ? error.message : String(error)}；已停用插件以免影响 dsh`,
      )
      throw error
    }
  }



  listNotes(query?: string, limit?: number): DeskNote[] { return this.notes.listNotes(query, limit) }

  async createNote(raw: CreateNoteInput): Promise<DeskNote> { return this.notes.createNote(raw) }

  async updateNote(id: string, expectedRevision: number, patch: NotePatch): Promise<DeskNote> { return this.notes.updateNote(id, expectedRevision, patch) }

  async deleteNote(id: string): Promise<boolean> { return this.notes.deleteNote(id) }



  listTasks(query?: string, limit?: number): DeskTask[] { return this.tasks.listTasks(query, limit) }

  async createTask(raw: CreateTaskInput): Promise<DeskTask> { return this.tasks.createTask(raw) }

  async updateTask(id: string, expectedRevision: number, patch: TaskPatch): Promise<DeskTask> { return this.tasks.updateTask(id, expectedRevision, patch) }

  async deleteTask(id: string): Promise<boolean> { return this.tasks.deleteTask(id) }



  listGroups(query?: string, limit?: number): DeskTaskGroup[] { return this.groups.listGroups(query, limit) }

  async createGroup(raw: CreateGroupInput): Promise<DeskTaskGroup> { return this.groups.createGroup(raw) }

  async updateGroup(id: string, expectedRevision: number, patch: GroupPatch): Promise<DeskTaskGroup> { return this.groups.updateGroup(id, expectedRevision, patch) }

  async moveGroup(
    id: string,
    expectedRevision: number,
    toStatus: string,
    toOrder?: number,
  ): Promise<{ group: DeskTaskGroup; tasks: DeskTask[] }> { return this.groups.moveGroup(id, expectedRevision, toStatus, toOrder) }

  async archiveGroup(
    id: string,
    expectedRevision: number,
    archived: boolean,
  ): Promise<{ group: DeskTaskGroup; tasks: DeskTask[] }> { return this.groups.archiveGroup(id, expectedRevision, archived) }

  async deleteGroup(id: string): Promise<boolean> { return this.groups.deleteGroup(id) }



  listScheduleSources(): DeskScheduleSource[] { return this.schedule.listScheduleSources() }

  listCalendars(sourceId?: string): DeskCalendar[] { return this.schedule.listCalendars(sourceId) }

  findScheduleSource(provider: string, channel: string): DeskScheduleSource | undefined { return this.schedule.findScheduleSource(provider, channel) }

  async createScheduleSource(input: CreateScheduleSourceInput): Promise<DeskScheduleSource> { return this.schedule.createScheduleSource(input) }

  getScheduleSource(id: string): DeskScheduleSource | undefined { return this.schedule.getScheduleSource(id) }

  async upsertScheduleSource(input: UpsertScheduleSourceInput): Promise<DeskScheduleSource> { return this.schedule.upsertScheduleSource(input) }

  async setScheduleSyncState(
    id: string,
    patch: { readonly syncState?: 'idle' | 'syncing' | 'error'; readonly lastSyncedAt?: string; readonly lastError?: ScheduleSyncError },
  ): Promise<void> { return this.schedule.setScheduleSyncState(id, patch) }

  async upsertCalendars(source: DeskScheduleSource, drafts: readonly CalendarDraft[]): Promise<DeskCalendar[]> {
    return this.schedule.upsertCalendars(source, drafts)
  }

  async updateCalendar(
    id: string,
    expectedRevision: number,
    patch: { readonly color?: unknown; readonly enabled?: unknown; readonly order?: unknown },
  ): Promise<DeskCalendar> { return this.schedule.updateCalendar(id, expectedRevision, patch) }

  async syncCalendarEvents(calendar: DeskCalendar, drafts: readonly EventDraft[]): Promise<number> {
    return this.schedule.syncCalendarEvents(calendar, drafts)
  }

  async removeScheduleSource(sourceId: string): Promise<void> { return this.schedule.removeScheduleSource(sourceId) }

  listEvents(query: EventQuery): DeskEvent[] { return this.schedule.listEvents(query) }

  countEventsByCalendar(): Map<string, number> { return this.schedule.countEventsByCalendar() }



  async upsertSessionIndexes(drafts: readonly SessionIndexDraft[]): Promise<{ indexed: number; missing: number }> {
    return this.sessions.upsertSessionIndexes(drafts)
  }

  listSessionIndexes(query?: string, limit?: number): DeskSessionIndex[] { return this.sessions.listSessionIndexes(query, limit) }

  findSessionIndex(sessionId: string): DeskSessionIndex | undefined { return this.sessions.findSessionIndex(sessionId) }



  getNotebookConfig(): DeskNotebookConfig | undefined { return this.notebook.getNotebookConfig() }

  async saveNotebookRoot(rootPath: string): Promise<DeskNotebookConfig> { return this.notebook.saveNotebookRoot(rootPath) }

  getNoteFile(id: string): NoteFileRef | undefined { return this.notebook.getNoteFile(id) }

  listNoteFiles(): NoteFileRef[] { return this.notebook.listNoteFiles() }

  async ensureNoteFile(input: EnsureNoteFileInput): Promise<NoteFileRef> { return this.notebook.ensureNoteFile(input) }

  async updateNoteFilePath(id: string, path: string, hash: string): Promise<NoteFileRef> { return this.notebook.updateNoteFilePath(id, path, hash) }

  getNoteDraft(fileId: string): NoteDraft | undefined { return this.notebook.getNoteDraft(fileId) }

  listNoteDrafts(): NoteDraft[] { return this.notebook.listNoteDrafts() }

  async saveNoteDraft(input: SaveNoteDraftInput): Promise<NoteDraft | null> { return this.notebook.saveNoteDraft(input) }

  getNoteBaseline(sessionId: string): NoteBaseline | undefined { return this.notebook.getNoteBaseline(sessionId) }

  listNoteBaselines(): NoteBaseline[] { return this.notebook.listNoteBaselines() }

  async saveNoteBaseline(input: SaveNoteBaselineInput): Promise<NoteBaseline | null> { return this.notebook.saveNoteBaseline(input) }



  listReviewSessions(): ReviewSessionMarker[] { return this.review.listReviewSessions() }

  async markReviewSession(input: MarkReviewSessionInput): Promise<ReviewSessionMarker> { return this.review.markReviewSession(input) }

  async createReviewRecord(input: CreateReviewRecordInput): Promise<ReviewRecord> { return this.review.createReviewRecord(input) }

  listReviewRecords(): ReviewRecord[] { return this.review.listReviewRecords() }

  async deleteReviewRecord(id: string): Promise<void> { return this.review.deleteReviewRecord(id) }




  close(): Promise<void> { return this.core.close() }
}
