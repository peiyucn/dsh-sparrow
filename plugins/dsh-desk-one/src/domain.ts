/**
 * Storage domain declaration (`ctx.storageDomain`): node schemas are zod, names follow the
 * official UNIT_NAME_RE rule. Layout is `per-record`: each object is its own record, which suits
 * the desk's sparse, individually-editable nodes.
 *
 * Kinds share one `nodes` table (adding a kind extends the schema only). A malformed or unknown
 * record must never brick the domain: the discriminated union reads each record by its `kind`.
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import {
  DESK_NODE_SCHEMA, DOMAIN_NAME, DOMAIN_VERSION, EDGES_TABLE, MAX_TASK_SESSIONS, NODES_TABLE, NOTE_COLORS,
  SCHEDULE_CHANNELS, SCHEDULE_COLORS, SCHEDULE_PROVIDERS, TASK_STATUSES,
} from './constants.js'
import type { DeskEdge, DeskNode } from './contract.js'

/** Shared base fields of every Desk node (kept explicit per schema for readable validation errors). */
const noteSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note'),
  schema: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  color: z.enum(NOTE_COLORS),
  pinned: z.boolean(),
  // Old records predate the trash field; default false keeps them readable without migration.
  trashed: z.boolean().default(false),
  // Optional wall geometry / layer: absent fields fall back to defaults, so no migration is needed.
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
  /** Membership is a group id; the group entity owns name / lane / order. */
  groupId: z.string().optional(),
  // Linked DSH sessions (opaque ids). Old records default to [] without migration.
  sessionIds: z.array(z.string().min(1)).max(MAX_TASK_SESSIONS).default([]),
  // "存档" (archive) is a task-board concept; naming chosen to avoid the host's session archive.
  archived: z.boolean().default(false),
  projectId: z.string().optional(),
  laneId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

/** One-level task group: a real entity (can be empty, renamed, reordered) owned by a lane. */
const groupSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('group'),
  schema: z.number().int().positive(),
  name: z.string().min(1),
  status: z.enum(TASK_STATUSES),
  order: z.number().int().nonnegative(),
  // Groups can be archived as a unit; old records default to false without migration.
  archived: z.boolean().default(false),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

/** Sync failure details kept on the source / calendar record (never credentials). */
const scheduleErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  at: z.string().min(1),
})

/** One connection per provider+channel; the secret lives in `ctx.credentials`, not here. */
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

/** One remote calendar under a source; v1 is always read-only. */
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

/** One mirrored event instance (recurring events are expanded to instances in the mirror window). */
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

const nodeSchema = z.discriminatedUnion('kind', [
  noteSchema, taskSchema, groupSchema, scheduleSourceSchema, calendarSchema, eventSchema,
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
  tables: {
    [NODES_TABLE]: domainTable<string, DeskNode>(nodeSchema),
    [EDGES_TABLE]: domainTable<string, DeskEdge>(edgeSchema),
  },
})

/** Node schema version referenced once so it stays in sync with record validation (migrations in spec). */
export const SUPPORTED_NODE_SCHEMA = DESK_NODE_SCHEMA
