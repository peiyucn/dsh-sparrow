/**
 * 存储域声明（`ctx.storageDomain`）：对象 schema 是 zod，域 / 表名走官方 `UNIT_NAME_RE` 口径。
 * 布局用 `per-record`：便签是「稀疏、单条可能较大、可单独备份」的记录，正好符合官方对该布局的定位。
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import {
  DESK_NODE_SCHEMA, DOMAIN_NAME, DOMAIN_VERSION, EDGES_TABLE, NODES_TABLE, NOTE_COLORS,
} from './constants.js'
import type { DeskEdge, DeskNote } from './contract.js'

const noteSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note'),
  schema: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  color: z.enum(NOTE_COLORS),
  pinned: z.boolean(),
  // 垃圾桶：老记录没有该字段，解析时补默认 false（存档语义已废弃，旧字段被 zod 丢弃）。
  trashed: z.boolean().default(false),
  // 便签墙自由位置：老记录没有这两个字段也能通过校验（向后兼容，无需迁移）。
  x: z.number().optional(),
  y: z.number().optional(),
  // 便签尺寸：同上，缺省即默认尺寸。
  width: z.number().optional(),
  height: z.number().optional(),
  // 贴纸层级：越大越靠上，同属可选字段（老记录按列表顺序兜底）。
  z: z.number().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().positive(),
})

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
    [NODES_TABLE]: domainTable<string, DeskNote>(noteSchema),
    [EDGES_TABLE]: domainTable<string, DeskEdge>(edgeSchema),
  },
})

/** 对象级 schema 版本常量在这里被引用一次，提醒它与 record 校验保持同行（迁移入口见 spec）。 */
export const SUPPORTED_NODE_SCHEMA = DESK_NODE_SCHEMA
