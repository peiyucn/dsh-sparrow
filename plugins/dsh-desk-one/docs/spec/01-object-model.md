# 01 · 统一对象模型 — dsh-desk-one

> 本套件的契约核心：模块、界面、Agent 工具、同步通道都只通过这套模型读写数据。
> 目标不是「一个插件装五个小工具」，而是**一套对象 + 一个查询层**，让五个视图天然一致、未来可扩展。

## 设计目标

1. **统一**：待办、便签、日程、专注、项目、批注状态都是同一存储域里的对象，共享 id / 时间 / revision / 扩展位（批注对象族的字段形态见下文）。
2. **可扩展**：新增对象类型只加注册项，不改核心；新增字段进命名空间 `attrs`，不破坏旧数据。
3. **可迁移**：对象自带 `schema` 版本，迁移函数顺序执行；未知字段原样保留（前向兼容）。
4. **可同步**：外部对象是「镜像」，来源与版本显式记录；写回是显式动作。
5. **可被 Agent 消费**：同一套查询与工具面，模型看到的是结构化的对象，而不是渲染后的文本。

## 核心概念

| 概念 | 说明 |
| :--- | :--- |
| **Node（对象）** | 一切可被引用、查询、链接的东西：任务、便签、分组、日程镜像、日历源、会话索引，以及批注对象族（库配置、文件身份、批注草稿、批注记录、轮次基线、批注会话标记）。 |
| **Edge（关系）** | 类型化有向边，独立存储；关系不污染对象字段。`edges` 表已声明，当前功能尚未写入关系边（见〈模块协同〉）。 |
| **View（视图）** | Node 的查询投影：任务板、便签墙、日程页、笔记页文件列表。视图不落库。 |
| **Provider（来源）** | 生成镜像 Node 的外部通道：企业微信 CalDAV / iCloud CalDAV / Outlook 个人 Microsoft Graph（`graph` 通道）/ 公开 ICS 订阅（`ics` 通道，含 Outlook 发布 ICS 历史兼容）/ 本地。 |
| **Store（仓库）** | 单一持久化层 + 内存索引；所有写入走它，保证一致性与事件广播。`DeskStore` 是门面，按领域拆在 `host/store/`。 |

## Node 基础字段

```ts
/** 经典 desk 对象（payload 分层是目标形态；当前代码字段平铺，见下）。 */
type DeskKind = 'task' | 'note' | 'event' | 'calendar' | 'focus' | 'project' | 'group'

/** 批注对象族（文件系统派生；当前代码已在 DeskNode 判别联合中）。 */
type NotebookKind =
  | 'note-file'        // 文件身份：工作区根 + 相对路径 + 内容 sha256（惰性分配）
  | 'note-draft'       // 每个文件身份一条未提交批注草稿箱
  | 'review-record'    // 每次提交一条批注记录（会话 + 文件快照元信息 + 批注）
  | 'note-baseline'    // 每个批注会话一条本轮基线正文
  | 'review-session'   // 每个批注会话一条持久标记（侧栏图标 / 复用判定）

/** 代码里的判别联合 = 经典 kind + 批注 kind + 会话索引（见 contract.ts）。 */
type DeskNodeKind = DeskKind | NotebookKind | 'session' | 'schedule-source'

interface DeskNode {
  id: string                 // `${kind}_${ulid}`，创建后不可变
  kind: DeskNodeKind
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

* **`payload` 按 `kind` 判别**，模块字段只放这里，核心字段保持稳定。批注对象族不走 `payload` 分层：它们是**文件系统派生索引 + 批注状态记录**，字段直接平铺在记录上（`id` / `kind` / `schema` + 各自字段），由 `src/notebook-contract.ts` 定义、`host/domain.ts` 校验。
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
  /** 日历颜色：首次同步按 8 色板自动分配，用户可在日历源栏改；事件条目沿用该颜色。 */
  color?: string
  enabled: boolean          // 是否参与聚合展示（多日历逐个勾选）
  /** 同 provider 内的显示顺序（源 → 日历两级组织，见 05-schedule.md）。 */
  order: number
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
> **实现口径（2026-11-14）**：当前代码把经典 kind 的字段**平铺在记录上**（便签 / 任务 / 日程一致），`payload` 分层是后续重构目标；本文件描述目标模型，字段语义与实现一致。
> `group` 是独立 Node（kind `group`），分组名 / 泳道 / 顺序持久化在记录字段里；任务只存 `groupId`，改名是单条 group patch，空分组也能存在。
> 关系一律走 Edge，不在 payload 里重复存 id；`FocusPayload.taskId` 只作渲染快照，权威关系是 `workedOn` 边（当前尚未写入）。

### 批注对象族（annotation kinds）

工作区文件不是「再把文件复制进 nodes」：**文件系统是内容真值，nodes 只存文件身份、草稿、批注记录与基线**。实现在 `src/notebook-contract.ts` + `src/host/notebook/` + `src/host/store/notebook.ts|review.ts`。

| kind | 一条记录代表 | 关键字段 | 上限 / 淘汰 |
| :--- | :--- | :--- | :--- |
| `notebook-config` | 笔记页当前链接的工作区根（单条，固定 id `notebook_config`） | `rootPath`（可指向工作区或其子目录）、`skillName?`（旧字段，仅兼容） | 单条 |
| `note-file` | 一个文件的**惰性身份**（首次批注分配；工作区根 + 相对路径 + 内容哈希；改名按哈希重挂） | `rootPath`、`path`、`hash`(sha256) | 一个文件一条 |
| `note-draft` | 该文件的未提交批注草稿箱 | `fileId`、`drafts: DraftAnnotation[]` | 每箱 `NOTEBOOK_MAX_DRAFTS = 100` 条批注 |
| `review-record` | 一次提交（一轮批注），不存正文快照 | `sessionId`、`workspaceId?`、`fileId`、`fileTitle`、`pathSnapshot`、`annotations`、`bytes` | 按文件 / 会话查询；历史占用有阈值提示 |
| `note-baseline` | 某一个**批注会话**的本轮基线正文 | `sessionId`、`fileId`、`rootPath`、`body`、`at` | 正文 ≤ `NOTEBOOK_BASELINE_MAX_CHARS`（1 MiB）；最多 200 条按 `updatedAt` 淘汰；超限删宿主记录、只留内存基线 |
| `review-session` | 某一个会话是「批注会话」的持久标记 | `sessionId`、`workspaceId?`、`fileId?` | 最多 500 条按 `updatedAt` 淘汰（侧栏图标 / 复用判定） |

* **正文不在 nodes 里**：阅读走 host 的只读 open 接口；写正文仍用 agent 的文件工具（Desk 工具不写工作区文件）。
* **文件身份随内容走**：`note-file` 只存路径 + 内容哈希；文件改名后按哈希重关联（host 有候选数与时间预算上限），因此批注记录 / 基线不会因改名而丢。
* **草稿箱 = 文件级、非会话级**：同一文件在任意批注会话里的未提交批注都落在同一 `note-draft`（带乐观并发 revision）；提交后清空。
* **批注历史是提交记录**：批注本身随会话消息走；`review-record` 只是「独立批注对象」的历史留档（文件快照元信息 + 批注，不存被审正文）。
* **迁移兼容**：早期「工作区文件 + 批注线程」版本的 `annotation` / `review` 两个 kind 只保留 schema 解析，打开存储域时清理，不参与业务；`notebook-config` 是**活记录**（链接工作区），旧记录直接沿用。域声明 `invalidRecords: 'backup-and-skip'`：遇到本版不认识的记录时备份、告警并跳过，而不是让整个域（连带所有插件路由）打不开。

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

**note / event / calendar / project**：note 用 `trashed` 布尔（垃圾桶）；event 无用户状态（镜像同步状态在 `source.syncState`）；calendar 的同步状态在自身记录里（连接级），project 用 `archived`（未实现，命名待定）。

**批注对象族**：没有用户可见状态机——`note-file` 是惰性身份（改路径即更新）、`note-draft` 的「草稿 → 提交」由 `review-record` 留档、`note-baseline` 按批注会话一条并在超限时淘汰、`review-session` 标记随会话存在。删除批注记录是物理删除；笔记库「断开链接」只删 `notebook-config`，不删文件。

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
* **只读镜像（v1）**：外部事件 `payload` 可显示、可复制，但更新/删除在界面上禁用，并标明来源；不提供本地事件创建（写回、自有日历发布/导出属 S3，且本地事件与订阅/导出能力必须同批设计）。**订阅外部公开 ICS** 已支持（只读通道，见 05）。
* **写回**（S3）：仅当 provider/channel 声明可写；写回前人工确认；失败记录 `syncState: 'error'` + `lastError`，逐条可见。Outlook 发布 ICS 通道永远只读，且 UI 不再暴露。
* **冲突策略**（S3）：默认远端优先；冲突写入 `attrs['dsh.desk'].conflicts` 供界面提示，不静默覆盖。
* **删除语义**：远端删除 → 软删本地镜像（`deletedAt`）；v1 不做本地删除镜像，因为镜像由同步重新拉回。

## Store 与持久化

* **单一存储**：一个对象快照 + 边集合，启动加载进内存索引；所有模块通过 Store API 读写。
* **存储域布局（2026-11-14 现状）**：`desk_one` 域，`nodes`（统一对象表，按记录形状校验）+ `edges`（关系表）两张表，`per-record` 布局；`nodes` 的判别联合当前含：`note` / `task` / `group` / `schedule-source` / `calendar` / `event` / `session`（会话索引）+ 六个 notebook kind，另保留两个仅解析的历史 kind（`annotation` / `review`，打开时清理）。**不加表、不 bump domain version**（旧记录照常解码；回滚到旧版时新记录读作不存在而非报错）。
* **记录 key**：`note_<uuid>` / `task_<uuid>` / `event_<uuid>` / `calendar_<uuid>` / `review_record_<uuid>` / `review_session_<sessionId>` 等，只含 `[a-zA-Z0-9_-]`；远端 id（含 `/`、`+`、`=`）与相对路径一律进记录字段，绝不作 key。
* **写入**：原子写（临时文件 + rename），防抖合并（默认 500ms），进程退出前 flush；`KvTable` 无批量写，首同步按批 `put` 并在界面显示进度。
* **启动索引**：加载后建 `Map<(provider, calendarId, externalId) → nodeId>` 供幂等 upsert；日程区间查询走内存索引，不每次全表扫。
* **规模假设**：个人规模 < 10k 对象；日程镜像窗口 `[-6, +3]` 个月（约 600–1,000 条事件 + 日历记录）；列表查询 < 50ms，启动 < 200ms。
* **位置**：profile 级，经官方 `ctx.storageDomain` 持久化，不硬编码目录。
* **导出/导入**：JSON Lines（每行一个 node 或 edge），可备份、跨机迁移；导入不覆盖已有 id；导出不含凭据与订阅链接。

## 查询层（View）

| 视图 | 查询定义 |
| :--- | :--- |
| 任务板 | 按 `status` 分组；一层分组按 `group` 记录在泳道块序列中穿插；排序视图（手动 / 创建 / 截止）是查询投影 |
| 便签墙 | `note` 按 pinned、updatedAt 排序；坐标 / 尺寸 / 层级为可选字段，缺省时界面兜底 |
| 日程 | 时间区间内的 `event`，按开始时间排序；按 `calendarNodeId` 关联来源与颜色；近期 / 日视图是同一查询的两种投影 |
| 笔记页 | **派生视图**：扫描工作区根的 `.md/.markdown/.txt` 得到的文件索引（标题 / 类型 / 日期 / 标签 / 缺元数据）+ 草稿箱 / 批注记录计数；四档视图与搜索都在这份索引上做，分页每页 20 条；不落第二份正文 |

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

**现状**：上面的 `DeskApi` 是模块内 Store / 查询层的目标形态视图；对外数据面是插件自己的前缀路由（全部过信任栅栏）：便签 / 任务 / 分组在 `/api/desk-one/*`，日程在 `/api/desk-one/schedule/*`，会话归档在 `/api/desk-one/sessions/*`，笔记库在 `/api/desk-one/notebook/*`（state / root / skill / search / list / page / file / create / draft / baseline / history / review-sessions）。客户端不直接接触存储。

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
| `desk_note_add` / `desk_note_list` / `desk_note_update` / `desk_note_delete` | 便签：新建 / 查询 / 更新 / 永久删除 | 低 |
| `desk_task_add` / `desk_task_list` / `desk_task_update` / `desk_task_complete` / `desk_task_archive` | 任务：新建 / 查询 / 更新（含状态与排序）/ 完成 / 存档或恢复（仅完成列可存档） | 低 |
| `desk_group_add` / `desk_group_list` / `desk_group_update` / `desk_group_move` / `desk_group_archive` / `desk_group_delete` | 分组：新建 / 查询 / 改名排序 / 整组移动 / 存档或恢复 / 删除 | 中（移动、存档、删除会影响组内卡片） |
| `desk_schedule_list` / `desk_schedule_sync` / `desk_schedule_connections` | 日程镜像查询 / 手动同步 / 连接状态（只读，不写回） | 低 |
| `desk_page_list` | 笔记批注页只读检索（当前链接工作区）：标题 / 路径 / 标签 / 缺元数据 / 空笔记；返回相对 root 的路径与元信息 | 低 |

* **一个工具一个动作**：工具名即意图（add / update / complete / move / archive / delete），不把语义不同的动作合并成通用 `save`；更新类工具要求显式 `expected_revision`。
* **常驻可见（2026-11-14 决策）**：19 个工具保持每个请求全量可见，**不做** skill 激活式惰性加载。实测 wire schema 约 11.1k 字符（≈2.8–3.7k tokens/请求）；对比官方 `tool-office` 的「skill 加载后激活」模式，我们更重视发现性——用户随口说「记一下」时工具必须已经在上下文里；同时激活态会在 resume / fork / 热重载 / 子 agent 上引入额外状态机与「工具明明装了却不可见」的支持成本。工具面显著膨胀（>30 个）时再评估，届时候选是「只惰性化低频工具」而非全量。
* **笔记批注页是文件系统对象**：`desk_page_list` 只做只读检索；正文读取与改稿仍用文件工具，Desk 工具不写笔记文件。
* 写工具返回结构化结果 + 一句人类可读摘要；跨外部源的写操作必须带确认。
* 工具与界面共用同一 Store API，禁止绕过 Store 直接写文件。

### 随包操作指南 skill

插件随包注册一个 `desk-one` skill（来源 `bundled`，模型与 `/` 用户命令都可见，默认开启、无配置开关），
内容只讲工具描述装不下的部分：对象选择（便签 / 任务 / 笔记批注页）、`list → id + revision → update` 顺序、
归档/删除的连带影响、日程只读、批注由人操作，以及「工作区由用户在面板顶栏链接 / 切换，`desk_page_list`
只读检索当前链接工作区」这一边界。

技能服务是可选依赖（`ctx.inject(['skills'], …)`）：宿主没有该服务时不注册、工具照常可用；禁止直接读
`ctx.skills`（cordis 会抛错并让整只插件停用、全部路由 404）。

## 纯逻辑与测试边界

以下逻辑必须纯函数化并补单测（仓库 G8）：

* Node 校验（字段、kind/payload 匹配、时间区间合法性、calendar 唯一键）。
* 状态机迁移（task / focus）。
* 边唯一性与级联删除。
* 视图查询（任务板 / 便签墙 / 日程 / 笔记页文件索引的定义）。
* 冲突判定（半开区间、时区、全天事件）。
* schema 迁移与未知字段保留。
* 同步 upsert 的唯一键与冲突策略；RRULE 窗口展开（EXDATE / RECURRENCE-ID / DST）；ICS / CalDAV / Graph 映射纯函数。
* 批注纯逻辑：frontmatter 解析（title / type / date / tags）、路径安全与文件身份哈希、改名重挂、批注草稿合并、批注记录 bytes 计算。
* 批注纯逻辑：行级 diff（前后缀裁剪 + 有界编辑搜索）、批注提交消息格式、会话复用选择（工作区 / 归档 / 轮数优先）、tab 参数恢复、每会话基线校验。
