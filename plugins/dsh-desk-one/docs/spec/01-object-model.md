# 01 · 统一对象模型 — dsh-desk-one

> 本套件的契约核心：模块、界面、Agent 工具、同步通道都只通过这套模型读写数据。
> 目标不是「一个插件装五个小工具」，而是**一套对象 + 一个查询层**，让五个视图天然一致、未来可扩展。

## 设计目标

1. **统一**：待办、便签、日程、专注、项目都是同一类对象的不同 `kind`，共享 id / 时间 / 来源 / 扩展位。
2. **可扩展**：新增对象类型只加注册项，不改核心；新增字段进命名空间 `attrs`，不破坏旧数据。
3. **可迁移**：对象自带 `schema` 版本，迁移函数顺序执行；未知字段原样保留（前向兼容）。
4. **可同步**：外部对象是「镜像」，来源与版本显式记录；写回是显式动作。
5. **可被 Agent 消费**：同一套查询与工具面，模型看到的是结构化的对象，而不是渲染后的文本。

## 核心概念

| 概念 | 说明 |
| :--- | :--- |
| **Node（对象）** | 一切可被引用、查询、链接的东西：任务、便签、日程、专注、项目。 |
| **Edge（关系）** | 类型化有向边，独立存储；关系不污染对象字段。 |
| **View（视图）** | Node + Edge 的查询投影：总览、任务板、便签墙、搜索。视图不落库。 |
| **Provider（来源）** | 生成镜像 Node 的外部通道：企业微信 CalDAV / iCloud CalDAV / Outlook 个人发布 ICS（Graph 后置）/ 本地。 |
| **Store（仓库）** | 单一持久化层 + 内存索引；所有写入走它，保证一致性与事件广播。 |

## Node 基础字段

```ts
type DeskKind = 'task' | 'note' | 'event' | 'calendar' | 'focus' | 'project' | 'group'

interface DeskNode {
  id: string                 // `${kind}_${ulid}`，创建后不可变
  kind: DeskKind
  schema: number             // 对象级 schema 版本，迁移用
  title: string
  body?: string              // Markdown；便签正文、任务/日程描述
  tags?: string[]
  payload: TaskPayload | NotePayload | EventPayload | CalendarPayload | FocusPayload | ProjectPayload
  attrs?: Record<string, Record<string, unknown>>   // 命名空间扩展
  source: SourceRef
  revision: number           // 乐观并发；每次写入 +1
  createdAt: string          // ISO 8601 UTC
  updatedAt: string
  deletedAt?: string         // 软删除；同步删除必须可回溯
  createdBy: 'user' | 'agent' | 'sync'
}
```

* **`payload` 按 `kind` 判别**，模块字段只放这里，核心字段保持稳定。
* **`attrs` 只放带命名空间的扩展**（如 `dsh.desk`、`memory`），模块只能写自己的命名空间。
* **`deletedAt` 软删除**：外部删除、回收站、恢复都靠它；物理清理单独做。

### 各 kind 的 payload

```ts
interface GroupPayload {
  name: string                             // 组名；同一泳道内唯一
  status: 'todo' | 'doing' | 'done'        // 分组属于某个泳道
  order: number                            // 组在该泳道块序列中的位置（与未分组卡片共享）
  archived: boolean                        // 整组存档（仅完成列）；存档时组内卡片一起归档
}

interface TaskPayload {
  status: 'todo' | 'doing' | 'done'        // S1 固定三泳道；inbox / cancelled 后置
  due?: { date: string; timezone?: string } // S1 只到天（date 必填，YYYY-MM-DD）
  order: number                            // 未分组时 = 泳道级块顺序；在分组内 = 组内顺序
  groupId?: string                         // 一层分组 id；缺省未分组
  sessionIds?: string[]                    // 关联的 DSH 会话 id（多对多；标题/状态实时解析，不落库）
  color?: string                           // 卡片颜色条，复用便签五色板
  archived: boolean                        // 存档（避开宿主「会话归档」命名）
  projectId?: string                       // 预留：多板后启用
  laneId?: string                          // 预留：自定义泳道后启用
}

interface NotePayload {
  pinned: boolean
  color?: string
  trashed: boolean
  /** 便签墙自由位置（px）：x/y 缺省时由界面按序号兜底摆放，用户拖动后才落库。 */
  x?: number
  y?: number
  /** 便签尺寸（px）：缺省用默认尺寸，用户拖右下角改过的才写回。 */
  width?: number
  height?: number
  /** 贴纸层级（越大越靠上）：点/拖后抬到最大 + 1 并写回；缺省按列表顺序兜底。 */
  z?: number
}

interface EventPayload {
  start: string             // ISO 8601 UTC
  end: string
  timezone: string          // IANA，如 Asia/Shanghai
  allDay: boolean
  location?: string
  attendees?: string[]      // v2
  busy: boolean
  /** 所属远端日历（本地 kind:calendar 节点的 id）；v1 所有事件都挂在某个远端日历下。 */
  calendarNodeId: string
  /** 重复事件的主 RRULE（原样保留）；镜像窗口滚动时据此重展开，实例本身按实例展开后存储。 */
  rrule?: string
  /** 重复事件实例的 RECURRENCE-ID（原值，如 20261110T010000Z）；非重复事件缺省。 */
  recurrenceId?: string
  /** 远端事件当前状态；cancelled 的实例按软删处理。 */
  status?: 'confirmed' | 'tentative' | 'cancelled'
  /** 打开原始客户端的链接（可选）。 */
  url?: string
}

/**
 * 一个远端日历（同步源），不是日程条目本身。
 * 唯一键 `(provider, remoteId)`；`readOnly` 在 v1 恒为 true（写回属 S3）。
 */
interface CalendarPayload {
  provider: 'wecom' | 'icloud' | 'outlook'
  remoteId: string          // 远端日历 id（CalDAV 的 URL/路径，或 ICS 文件里的 X-WR-CALNAME 对应项）
  displayName: string
  color?: string
  enabled: boolean          // 是否参与聚合展示（多日历逐个勾选）
  readOnly: true            // v1 恒只读
  syncState: 'idle' | 'syncing' | 'error'
  syncToken?: string        // ctag / sync-token / ICS ETag
  lastSyncedAt?: string
  lastError?: { code: string; message: string; at: string }
  /** 凭据引用名（`ctx.credentials` 的 ref）——只存名字，绝不存密码或链接本身。 */
  credentialRef?: string
  /** 非密账号标识（邮箱 / Apple ID），用于界面显示。 */
  account?: string
}

interface FocusPayload {
  taskId?: string           // 与 workedOn 边二选一？不：边是唯一关系来源，这里只做快照引用
  plannedMin: number
  state: 'running' | 'paused' | 'done' | 'cancelled'
  startedAt?: string
  endedAt?: string
  interruptions: number
}

interface ProjectPayload {
  color?: string
  archived: boolean
  columns?: string[]        // 默认 todo / doing / done
}
```

> S1 实现范围以 `03-task-board.md` 为准；`priority` / `estimateMin` / 时刻级 `at` / 多板 / 自定义泳道后置。
> `group` 是独立 Node（kind `group`），分组名 / 泳道 / 顺序持久化在 `payload` 里；任务只存 `groupId`，改名是单条 group patch，空分组也能存在。
> 关系一律走 Edge，不在 payload 里重复存 id；`FocusPayload.taskId` 只作渲染快照，权威关系是 `workedOn` 边。

## Edge（关系）

```ts
type EdgeType =
  | 'scheduledAs'   // task → event：任务被排进日程
  | 'workedOn'      // focus → task：专注在哪个任务上
  | 'derivedFrom'   // task → note：任务由便签转化而来
  | 'belongsTo'     // task → project：看板项目归属
  | 'childOf'       // task → task：子任务（v2）
  | 'references'    // 任意 → 任意：通用引用（记忆系统挂载点）

interface DeskEdge {
  id: string
  type: EdgeType
  from: string
  to: string
  createdAt: string
  meta?: Record<string, unknown>
}
```

* Edge 独立集合，可加索引（from、to、type）。
* 删除 Node 时级联删除相关边；恢复时按软删记录恢复。
* 同一 `(type, from, to)` 唯一，重复链接幂等。

## 状态机

**task**

| 当前 \ 动作 | 推进 | 回退 | 取消 | 重开 |
| :--- | :--- | :--- | :--- | :--- |
| `inbox` | → `todo` | — | → `cancelled` | — |
| `todo` | → `doing` | → `inbox` | → `cancelled` | — |
| `doing` | → `done` | → `todo` | → `cancelled` | — |
| `done` | — | — | — | → `todo` |
| `cancelled` | — | — | — | → `inbox` |

**focus**：`running ⇄ paused`，任一状态可 `done` / `cancelled`；同一时刻全局只允许一个 `running` 或 `paused` 会话。

**note / event / calendar / project**：note 用 `trashed` 布尔（垃圾桶）；event 无用户状态（镜像同步状态在 `source.syncState`）；calendar 的同步状态在自身 `payload`（连接级），project 用 `archived`（命名待定）。

## 时间模型

* 所有时刻存 UTC ISO 8601，同时保留原始时区（`timezone`），显示时按用户时区换算。
* 全天的 `event` 用 `start`/`end`（当日 00:00 本地）加 `allDay: true`，但**跨时区比较时按本地日期区间**处理。
* 冲突判定 = 半开区间重叠 `[start, end)`；`busy: false` 的事件不参与冲突。
* 重复事件（v1 只读展示）：同步时把 RRULE 在**镜像窗口内展开成实例**，每个实例存一条 `event`（`payload.rrule` 保留主规则、`payload.recurrenceId` 标实例）；窗口滚动时重展开并裁剪，避免查询期做 RRULE 展开与无限膨胀。展开逻辑必须纯函数化并覆盖 DST / EXDATE / RECURRENCE-ID 覆盖。

## 来源与同步

```ts
interface SourceRef {
  provider: 'local' | 'wecom' | 'icloud' | 'outlook'
  channel?: 'caldav' | 'ics' | 'graph'   // 同一 provider 的接入通道；local 缺省
  calendarId?: string       // 远端日历 id
  externalId?: string       // 远端事件 id；重复事件实例 = `${UID}#${RECURRENCE-ID}`
  etag?: string             // 远端版本号（若提供）
  syncState: 'synced' | 'pending' | 'error'
  lastSyncedAt?: string
  lastError?: string
}
```

* **唯一键**：`(provider, calendarId, externalId)`；重复拉取按此 upsert，不产生重复对象。`externalId` 永不用作存储 key（per-record key 只允许 `[a-zA-Z0-9_-]`）。
* **只读镜像（v1）**：外部事件 `payload` 可显示、可复制，但更新/删除在界面上禁用，并标明来源；不提供本地事件创建（写回、订阅属 S3，且本地事件与订阅能力必须同批设计）。
* **写回**（S3）：仅当 provider/channel 声明可写；写回前人工确认；失败记录 `syncState: 'error'` + `lastError`，逐条可见。Outlook 个人 ICS 通道永远只读。
* **冲突策略**（S3）：默认远端优先；冲突写入 `attrs['dsh.desk'].conflicts` 供界面提示，不静默覆盖。
* **删除语义**：远端删除 → 软删本地镜像（`deletedAt`）；v1 不做本地删除镜像，因为镜像由同步重新拉回。

## Store 与持久化

* **单一存储**：一个对象快照 + 边集合，启动加载进内存索引；所有模块通过 Store API 读写。
* **存储域布局（S0 已落地，S2 只扩 kind）**：`desk_one` 域，`nodes`（统一对象表，按记录形状校验）+ `edges`（关系表）两张表，
  `per-record` 布局；S2 在 `DeskKind` 追加 `event` / `calendar`，**不加表、不 bump domain version**（旧记录照常解码；回滚到旧版时新记录读作不存在而非报错）。
* **记录 key**：`event_<uuid>` / `calendar_<uuid>`，只含 `[a-zA-Z0-9_-]`；远端 id（含 `/`、`+`、`=`）一律进 `payload`，绝不作 key。
* **写入**：原子写（临时文件 + rename），防抖合并（默认 500ms），进程退出前 flush；`KvTable` 无批量写，首同步按批 `put` 并在界面显示进度。
* **启动索引**：加载后建 `Map<(provider, calendarId, externalId) → nodeId>` 供幂等 upsert；日程区间查询走内存索引，不每次全表扫。
* **规模假设**：个人规模 < 10k 对象；日程镜像窗口 `[-6, +3]` 个月（约 600–1,000 条事件 + 日历记录）；列表查询 < 50ms，启动 < 200ms。
* **位置**：profile 级，经官方 `ctx.storageDomain` 持久化，不硬编码目录。
* **导出/导入**：JSON Lines（每行一个 node 或 edge），可备份、跨机迁移；导入不覆盖已有 id；导出不含凭据与订阅链接。

## 查询层（View）

| 视图 | 查询定义 |
| :--- | :--- |
| 总览 | `note` 最近项与条数；本地日期区间内 `event`（按来源标记）；到期/逾期 `task`；后续接入 `running` 的 `focus` |
| 待办 | 按 `status` 与 `due` 分组；收集箱 = `inbox` |
| 日程 | 时间区间内的 `event`，按开始时间排序；按 `calendarNodeId` 关联来源与颜色 |
| 看板 | 指定 `project` 的 `task`，按 `status` 分组 |
| 便签墙 | `note` 按 pinned、updatedAt 排序 |
| 搜索 | title / body / tags 的子串或分词匹配，带结果上限 |

## API 面（host 服务，符号名待实现期对齐官方 seam）

```ts
interface DeskApi {
  list(query: DeskQuery): Promise<{ items: DeskNode[]; nextCursor?: string }>
  get(id: string): Promise<DeskNode | null>
  create(input: DeskNodeInput): Promise<DeskNode>
  update(id: string, patch: DeskNodePatch, expectedRevision: number): Promise<DeskNode>
  remove(id: string): Promise<void>
  link(from: string, to: string, type: EdgeType): Promise<DeskEdge>
  unlink(edgeId: string): Promise<void>
  view(view: ViewName, params: ViewParams): Promise<ViewResult>
  sync(provider?: 'wecom' | 'icloud' | 'outlook'): Promise<SyncReport>
  /** 连接级操作：保存 / 测试 / 断开；凭据只经 ctx.credentials，返回值永不回传密钥。 */
  connections(): Promise<ConnectionView[]>
  saveConnection(input: ConnectionInput): Promise<ConnectionView>
  testConnection(input: ConnectionInput): Promise<ProbeResult>
  removeConnection(id: string): Promise<void>
  export(): AsyncIterable<string>
  import(lines: AsyncIterable<string>): Promise<ImportReport>
  subscribe(listener: (event: StoreEvent) => void): () => void
}
```

**错误约定**：`404 NOT_FOUND`、`409 CONFLICT`（revision 不匹配）、`422 INVALID_NODE`（字段校验失败）、`409 SYNC_AUTH_EXPIRED`（凭据失效，需重新获取/生成，不自动重试）、`503 PROVIDER_UNAVAILABLE`（同步通道不可用）。错误一律带 `code` 与人类可读 `message`。

**边界**：列表分页（默认 50，上限 500）；搜索上限 200；`sync` 并发上限 1（同一 provider 串行，跨 provider 总并发 ≤ 2）；外网请求 connect 10s / 整体 30–60s，宿主卸载时中止在飞请求。

## 扩展机制

1. **新增 kind**：注册表项 `{ kind, label, icon, defaults, views }`；核心 Store 不感知具体 kind，只做校验分发。
2. **新增字段**：进 `attrs.<namespace>`；读旧数据缺字段时用默认值，不迁移也能跑。
3. **schema 迁移**：`migrations: Record<number, (node) => node>` 顺序执行；迁移失败保留原对象并告警。
4. **未知字段**：读取时保留、写入时原样带回（前向兼容），界面与查询忽略。
5. **记忆系统接入示例**：外部在 `attrs.memory` 写摘要、用 `references` 边指向对象；模型、查询、导出无需改动。

## 给 Agent 的工具面

| 工具 | 作用 | 风险 |
| :--- | :--- | :--- |
| `desk_task_add` / `desk_task_list` / `desk_task_update` / `desk_task_complete` | 待办增查改完成 | 低 |
| `desk_overview` | 总览摘要 | 低 |
| `desk_schedule_list` | 区间日程（三源镜像，只读） | 低 |
| `desk_schedule_sync` | 手动触发日程同步，返回每源报告 | 中 |
| `desk_schedule_connections` | 连接状态摘要（不含凭据） | 低 |
| `desk_focus_start` / `desk_focus_stop` / `desk_focus_status` | 专注计时 | 低（v2） |
| `desk_note_add` / `desk_note_search` | 便签 | 低（v2） |
| `desk_board_list` / `desk_board_move` | 看板 | 低（v2） |
| `desk_export` | 导出 JSONL | 低 |

* 写工具返回结构化结果 + 一句人类可读摘要；跨外部源的写操作必须带确认。
* 工具与界面共用同一 Store API，禁止绕过 Store 直接写文件。

## 纯逻辑与测试边界

以下逻辑必须纯函数化并补单测（仓库 G8）：

* Node 校验（字段、kind/payload 匹配、时间区间合法性、calendar 唯一键）。
* 状态机迁移（task / focus）。
* 边唯一性与级联删除。
* 视图查询（总览/任务板/搜索/日程的定义）。
* 冲突判定（半开区间、时区、全天事件）。
* schema 迁移与未知字段保留。
* 同步 upsert 的唯一键与冲突策略；RRULE 窗口展开（EXDATE / RECURRENCE-ID / DST）；ICS / CalDAV 映射纯函数。
