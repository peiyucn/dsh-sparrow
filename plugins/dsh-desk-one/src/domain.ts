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
  DESK_NODE_SCHEMA, DOMAIN_NAME, DOMAIN_VERSION, EDGES_TABLE, NODES_TABLE, NOTE_COLORS, TASK_STATUSES,
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
  /** One-level grouping: the group name itself is the key; absent means ungrouped. */
  group: z.string().optional(),
  // "存档" (archive) is a task-board concept; naming chosen to avoid the host's session archive.
  archived: z.boolean().default(false),
  projectId: z.string().optional(),
  laneId: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

const nodeSchema = z.discriminatedUnion('kind', [noteSchema, taskSchema])

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
