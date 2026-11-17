

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import {
  DOMAIN_NAME, DOMAIN_VERSION, EDGES_TABLE, MAX_TASK_SESSIONS, NODES_TABLE,
  NOTE_COLORS, SCHEDULE_CHANNELS, SCHEDULE_COLORS, SCHEDULE_PROVIDERS, TASK_STATUSES,
} from '../constants.js'
import type { DeskEdge, DeskNode } from '../contract.js'


const noteSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note'),
  schema: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  color: z.enum(NOTE_COLORS),
  pinned: z.boolean(),

  trashed: z.boolean().default(false),

  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  z: z.number().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

const taskSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('task'),
  schema: z.number().int().positive(),
  title: z.string().min(1),
  body: z.string(),
  tags: z.array(z.string()),
  status: z.enum(TASK_STATUSES),
  color: z.enum(NOTE_COLORS),
  due: z.object({
    date: z.string().min(1),
    timezone: z.string().optional(),
  }).optional(),
  order: z.number().int().nonnegative(),

  groupId: z.string().optional(),

  sessionIds: z.array(z.string().min(1)).max(MAX_TASK_SESSIONS).default([]),

  archived: z.boolean().default(false),
  projectId: z.string().optional(),
  laneId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const groupSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('group'),
  schema: z.number().int().positive(),
  name: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  order: z.number().int().nonnegative(),

  archived: z.boolean().default(false),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const scheduleErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  at: z.string().min(1),
})


const scheduleSourceSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('schedule-source'),
  schema: z.number().int().positive(),
  provider: z.enum(SCHEDULE_PROVIDERS),
  channel: z.enum(SCHEDULE_CHANNELS),
  account: z.string().optional(),
  credentialRef: z.string().optional(),
  enabled: z.boolean().default(true),
  syncState: z.enum(['idle', 'syncing', 'error']),
  lastSyncedAt: z.string().optional(),
  lastError: scheduleErrorSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const calendarSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('calendar'),
  schema: z.number().int().positive(),
  sourceId: z.string().min(1),
  provider: z.enum(SCHEDULE_PROVIDERS),
  channel: z.enum(SCHEDULE_CHANNELS),
  remoteId: z.string().min(1),
  displayName: z.string(),
  color: z.enum(SCHEDULE_COLORS),
  order: z.number().int().nonnegative(),
  enabled: z.boolean().default(true),
  readOnly: z.literal(true),
  syncToken: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  lastError: scheduleErrorSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const eventSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('event'),
  schema: z.number().int().positive(),
  calendarNodeId: z.string().min(1),
  provider: z.enum(SCHEDULE_PROVIDERS),
  channel: z.enum(SCHEDULE_CHANNELS),
  calendarRemoteId: z.string().min(1),
  externalId: z.string().min(1),
  uid: z.string().min(1),
  recurrenceId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  organizer: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean(),
  timezone: z.string().min(1),
  busy: z.boolean(),
  url: z.string().optional(),
  rrule: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

const sessionIndexSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('session'),
  schema: z.number().int().positive(),
  sessionId: z.string().min(1),
  title: z.string(),
  cwd: z.string().optional(),
  parentSessionId: z.string().optional(),
  subagent: z.boolean(),
  running: z.boolean(),
  availability: z.enum(['available', 'archived', 'missing']),
  updatedAt: z.number(),
  indexedAt: z.string().min(1),
  missingSince: z.string().optional(),
  createdAt: z.string().min(1),
  revision: z.number().int().nonnegative(),
})


const annotationSchema = z.object({
  id: z.string().min(1),
  quote: z.string(),
  text: z.string(),
  scope: z.literal('document').optional(),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  createdAt: z.string().min(1),
})


const notebookConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('notebook-config'),
  schema: z.number().int().positive(),
  rootPath: z.string().min(1),


  skillName: z.string().min(1).nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const noteFileSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note-file'),
  schema: z.number().int().positive(),
  rootPath: z.string().min(1),
  path: z.string().min(1),
  hash: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const reviewRecordSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('review-record'),
  schema: z.number().int().positive(),
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  fileId: z.string().min(1),
  fileTitle: z.string(),
  pathSnapshot: z.string().min(1),
  annotations: z.array(annotationSchema),
  bytes: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
})


const noteDraftSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note-draft'),
  schema: z.number().int().positive(),
  rootPath: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  path: z.string().min(1),
  fileId: z.string().min(1).optional(),
  drafts: z.array(annotationSchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})


const legacyAnnotationSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('annotation'),
  schema: z.number().int().positive(),
}).passthrough()
const legacyReviewSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('review'),
  schema: z.number().int().positive(),
}).passthrough()

const noteBaselineSchema = z.object({
  kind: z.literal('note-baseline'),
  schema: z.number().int().positive(),
  sessionId: z.string().min(1).optional(),
  fileId: z.string().min(1),
  rootPath: z.string().min(1),
  body: z.string(),
  at: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

const reviewSessionSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('review-session'),
  schema: z.number().int().positive(),
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

const nodeSchema = z.discriminatedUnion('kind', [
  noteSchema, taskSchema, groupSchema, scheduleSourceSchema, calendarSchema, eventSchema, sessionIndexSchema,
  notebookConfigSchema, noteFileSchema, reviewRecordSchema, noteDraftSchema, noteBaselineSchema, reviewSessionSchema,
  legacyAnnotationSchema, legacyReviewSchema,
])


const edgeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  createdAt: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const DESK_DOMAIN = defineDomain({
  name: DOMAIN_NAME,
  version: DOMAIN_VERSION,
  layout: 'per-record',



  invalidRecords: 'backup-and-skip',
  tables: {
    [NODES_TABLE]: domainTable<string, DeskNode>(nodeSchema as unknown as z.ZodType<DeskNode>),
    [EDGES_TABLE]: domainTable<string, DeskEdge>(edgeSchema),
  },
})
