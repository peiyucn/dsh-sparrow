# 00 · 现状总览 — dsh-desk-one

> 状态：**现状总览**（最后校验 2026-11-14，0.2.2-rc.3 首发前）。本文件描述**已经交付**的形态；目标设计与未实现项写在各模块 spec 里并逐一标注。
> 配套文档：`01-object-model.md`（统一对象模型，本套件的契约核心）、`02-modules.md`（各模块需求明细）、`03-task-board.md`、`04-sessions.md`、`05-schedule.md`、`06-session-index.md`、`07-notebook.md`。

## 定位

DSH Web 里「与 harness 共用一张桌子」的工作套件 **Desk One（同桌）**：默认一个侧栏入口，一个页面组件、**一套统一对象**，把日程、笔记审阅、便签、任务、agent 会话收在一处；每个 tab 可按需固定成独立侧栏入口（动态增删、持久化、重启保留）。Agent 通过一组 `desk_*` 工具读写同一套数据，而不是各模块各存一份。

日程页聚合三条「个人可搞定」的只读线路 + 一个通用订阅通道：

* **企业微信（公司租户）**：CalDAV，服务器 `caldav.wecom.work`，账号为邮箱，密码在手机端「日程 → 日程设置 → 同步至其他日历」获取（每次重新获取会让旧密码失效）。
* **iCloud（个人）**：CalDAV，服务器 `caldav.icloud.com`，账号为 Apple ID，密码用 Apple 官方「App 专用密码」（需先开启双重认证；改 Apple 主密码会让全部专用密码失效）。
* **Outlook（个人账号）**：Microsoft Graph OAuth（浏览器回调 + PKCE 为主，设备码兜底；公共客户端 Client ID 内置；权限 `Calendars.ReadWrite`，refresh token 只进凭据库）；实时、多日历，按镜像窗口拉取（`syncToken` 级增量优化待真机后补）。
* **订阅（ICS，任意服务商）**：provider 无关的只读通道，可添加多条公开 ICS 链接，每条链接即一本日历；URL 存官方凭据库，仅适合外部订阅，不适合个人主日历。Outlook 发布 ICS 通道保留为历史兼容，UI 不再暴露。

> **命名**：标签中文名为「日程」、英文名为 **Schedule**（路由与数据表沿用 `schedule` 前缀）。日历聚合只是这一页的主体；专注 / 倒计时等小控件未做（见 05-schedule）。

## 设计原则

1. **一个对象模型，多个视图**：便签墙是自由坐标、任务板是分组、日程是只读镜像，都不存第二份数据。
2. **核心稳定，扩展靠命名空间**：核心字段少且不轻易变；模块特有状态进 `attrs.<namespace>`，新增能力不改核心 schema。
3. **外部数据只镜像**：外部日程在本地是带来源与版本的镜像对象；写回是显式动作，v1 不做。
4. **本地优先**：断网、令牌失效、同步失败都不阻塞本地记录；每个失败在界面上可见，不静默。
5. **可迁移**：对象由官方 `ctx.storageDomain` 持久化；schema 变化走迁移表（`schema` 字段），旧数据能平滑升级。
6. **单 entry、按需多入口行**：客户端只注册一个 entry；默认只注册基础 main panel，用户固定某个 tab 时才动态注册该 tab 的 `main` + `sidebar.panellist` 行，取消固定即移除（共用同一页面组件、各自初始 tab），模块在页面内路由——宿主 boot 审计把任一 client entry 非 active 当致命失败，入口越少风险越小。

## 模块地图

| # | 模块 | 职责 | 主要对象 | 阶段 |
| :-- | :--- | :--- | :--- | :--- |
| 1 | 面板外壳 Shell | 侧栏入口、面板框架、模块路由、加载与错误态 | — | **S0 已交付** |
| 2 | 笔记 Notebook | 新建/维护笔记的入口与审阅视图：库浏览/搜索 + 在**专用审阅会话**里的审阅 tab（AI 主写、人审阅；无编辑器、不依赖 git） | `notebook-config` + `note-file` + `note-draft` + `review-record` + `review-session` + `note-baseline` | **已交付**（见 `07-notebook.md`） |
| 3 | 待办 Tasks | 收集箱、推进、完成、优先级、估算、排期入口 | `task` + `group` | **S1 已交付**（收集箱/优先级/估算后置） |
| 4 | 日程 Schedule | 日历主页（开始 / 今日 / 近期 + 月历 / 周历 / 日历）+ 连接与日历设置管理页；外部日程只读镜像（v1 不做本地事件） | `event` + `calendar` + `schedule-source` | **S2 已交付**（只读） |
| 5 | 同步 Sync | 企业微信 / iCloud CalDAV、Outlook Graph 与公开 ICS 订阅的连接、拉取、状态与错误 | `event`（镜像）+ `calendar` | **S2 已交付**（只读） |
| 6 | 专注 Focus | 番茄计时，绑定任务，累计实际用时 | `focus` | S3 未开始 |
| 7 | 便签墙 Notes | 快速记录、置顶、颜色、一键转任务 | `note` | **S0 已交付**（一键转任务后置） |
| 8 | 看板 Board | 按项目分泳道、拖拽改状态 | `project` + `task` | 多项目板未做（当前任务板已交付，S3） |
| 9 | 搜索 Search | 跨对象标题/正文/标签检索 | 全部 | S3 未开始（笔记库搜索已交付，见 `07`） |
| 10 | 设置 Settings | 连接配置、同步状态、导入导出、关于 | — | **不单独设页**：连接与日历设置收在日程页「日历设置」子页（S2 已交付）；导入导出/关于未做 |
| 11 | Agent 工具层 | 跨模块工具，读写同一套对象；随包 `desk-one` 操作指南 skill | 全部 | **已交付**（19 个工具 + 随包 skill） |
| 12 | Agent 会话 Sessions | 活跃会话按工作区分组、归档树与归档管理（从归档插件迁移） | 宿主会话目录（非 DeskNode） | **Phase 1–2 已交付**；Phase 3 管理 UI 已交付，归档插件退役待 owner 真机验证首发后执行 |

## 代码结构（按功能模块）

共享一套对象模型，功能按目录隔离；新功能照此扩展，不往便签目录里堆。与 `client/**` / `host/**` 的层次方向见本节末硬约束。

```text
src/
  constants.ts contract.ts host.ts index.ts notebook-contract.ts   # 常量 / 契约 / 入口 / 笔记契约
  session-admin.ts tree.ts trust.ts compat.ts                      # 会话管理 REST 契约 / 会话树 / 信任栅栏 / 兼容门
  model.ts model/{errors,fields,groups}.ts                         # 对象模型分层（model.ts 再导出）
  host/
    domain.ts gates.ts http.ts router.ts store.ts                  # 存储域 / 能力门 / HTTP 基础 / 前缀路由 / 存储门面
    skill.ts skill-catalog.ts                                     # 随包 desk-one 指南 skill / 可选技能目录
    store/{core,notes,tasks,groups,schedule,sessions,notebook,review}.ts   # 按领域拆的仓库；store.ts 只做转发
    tools/shared.ts                                               # 工具公共 helper（文本输出 / 错误包装）
    notes/{routes,tools}.ts                                       # 便签 host 半
    tasks/{routes,tools,group-routes,group-tools}.ts              # 任务板 host 半（含分组）
    sessions/**                                                   # 会话目录 + 归档管理 host 半（Phase 1–2 + Phase 3 管理 UI）
    schedule/{host,connections,sync,outlook-oauth,caldav,ical,xml,records,routes,tools,types}.ts
    schedule/providers/{graph,outlook-ics}.ts                     # Outlook Graph / 历史 ICS 通道
    notebook/{host,scan,library,files,frontmatter,skills,routes,tools}.ts   # 笔记库索引 / 文件身份 / 草稿 / 审阅记录
  client/
    index.ts install.ts panel.ts pin.ts brand.tsx compat.ts http.ts styles.ts tabIcons.tsx
    app/**                                                        # 面板外壳：页头 / tab / 动作 / 图标 / 样式 / 工具
    i18n.ts i18n/{app,notebook,review,notes,action,tasks,schedule,sessions}.ts  # 双语字典按功能拆片，i18n.ts 聚合
    notes/**                                                      # 便签墙（NotesWall / useNoteWall / 卡片 / 垃圾面板）
    tasks/**                                                      # 任务板（看板 / 卡片 / 拖拽 / 排序 / 存档 / 会话 chip）
    schedule/{ScheduleView,shared,toolbar,panels,boards,event-card,utils,api,styles}.ts(x)
    schedule/sources/**                                           # 日历设置子页（来源卡 / Outlook Graph 卡 / ICS 订阅卡）
    sessions/**                                                   # 会话目录与归档管理 UI
    notebook/                                                     # 笔记库入口页 + 审阅
      NotebookView.tsx HeaderActions.tsx DocReviewAction.tsx ReviewPromptDock.tsx ReviewSessionIcon.tsx ReviewSessionTrailingIcon.tsx
      hooks/{useNotebookPage,useNotebookLibrary,useNotebookRows,useNotebookActions}.ts
      review/ReviewTab.tsx
      review/components/{ReviewHeader,ReviewCodeView,ReviewDocumentView,ReviewLayers,ReviewSubmitBar,AnnotationCard}.tsx
      review/hooks/{useReviewSession,useReviewDocument,useReviewInteraction}.ts
      review/{changes,format,page,sessions,tab-memory,types}.ts   # 行级 diff / 提交格式 / 视图 / 会话复用 / tab 备忘
      review-bridge.ts api.ts faces.ts paging.ts page-types.ts register.ts workspaces.ts styles.ts review-styles.ts
test/
  shared/{model,task-model,trust}.test.mjs                         # 跨半纯逻辑
  host/{notes,notebook,schedule,sessions,skill*}/**                 # host 半：路由 / 适配器 / 纯逻辑 / 迁移
  client/**                                                        # client 纯逻辑与组件契约
  structure/**                                                     # 结构守卫：入口槽位 / 功能契约 / 分层 / i18n / 文档 / 打包
```

* 约定：**新功能 = `src/client/<feature>/` + `src/host/<feature>/` + `test/<layer>/<feature>/`**；只有真正跨功能的东西才放在 `src/` 根或 `client/app/`。
* **层次方向（硬约束）**：`client/**` 不得 import `host/**`，`host/**` 不得 import `client/**`；两半共用的类型放 `src/` 根（`contract.ts`、`notebook-contract.ts`、`session-admin.ts`），测试见 `test/structure/layering.test.mjs`。客户端构建链与宿主运行环境不同，反向依赖会同时破坏类型边界和打包体积。
* **能力门分工**：client half 用告警版 `warnMissingCapabilities`（不抛错，缺能力就惰性停用）；host half 用抛错版 `assertCapabilities`，启动时缺服务即自停用、不影响宿主与其它插件。
* 日程页的 client 半按职责分文件：`shared`（标题回退 / 日期标签 / provider key）、`toolbar`（导航与视图切换）、`panels`（开始 / 今日 / 近期）、`boards`（列表 / 月 / 周）、`event-card`（浮动详情）、`sources/`（日历设置子页）。新增视图放进对应文件，不造巨型组件文件。
* CSS：外壳在 `client/app/styles.ts`、功能在 `client/<feature>/styles.ts`，由 `client/styles.ts` 聚合；任务板样式按区域拆在 `client/tasks/styles/`，审阅样式单独 `client/notebook/review-styles.ts`。
* 测试发现：仓库 `scripts/verify.mjs` 使用 `test/**/*.test.mjs`；测试首行必须 `// @ts-check`（根 `check:test-ts-check` 守卫）。

## 模块协同（已实现 / 设计预留）

**已实现**

* **统一对象**：便签 / 任务 / 分组 / 日程镜像 / 日历源 / 会话索引 / 笔记审阅对象族同库同域（`desk_one` 的 `nodes` 表），工具与界面读写同一批记录。
* **任务 ↔ 会话**：任务卡存不透明 `sessionIds`；标题 / 运行状态由客户端从宿主会话服务实时解析，不落库、不外发；界面支持一对多关联与预览。
* **日程页联动**：今日卡四枚计数（日程 / 便签 / 未完成任务 / 活跃会话）可点击跳到对应 tab；日程页的开始卡（+ 笔记 / + 便签 / + 任务）直接切页并打开新建态。
* **笔记审阅 → 会话**：提交批注把编号批注插入该审阅会话的输入框（不自动发送）；批注记录 / 轮次基线按审阅会话保存。

**设计预留（尚未实现，见 01 的 Edge 定义）**

* **便签 → 任务**（`derivedFrom` 边）、**任务 → 日程**（`scheduledAs` 边）、**专注 → 任务**（`workedOn` 边）：`edges` 表已声明，但当前功能尚未写入关系边；跨对象「总览」页也未做。
* **看板 Board**（`project`）、跨对象搜索、记忆系统（`attrs.memory` + `references` 边）均为后续版本预留。

## 非目标

* 团队协作、共享日历写权限、多人权限。
* 项目依赖图/甘特图；看板只做状态泳道。
* 邮件、企业微信管理端能力、日程以外的工作流对象。
* v1 的日程只读：不创建本地事件、不写回外部日历、不提供自有日历的 iCalendar 发布/导出（订阅外部公开 ICS 已支持，见 05-schedule）。
* 替代 Outlook / 企业微信 / Apple 日历客户端；本套件是「汇总与安排」，不是它们的镜像客户端。

## 分期与验收（小步快跑，每步独立可发布）

| 步 | 内容 | 状态 / 验收 |
| :-- | :--- | :--- |
| **S0** | 插件骨架 + 对象模型核心（Node/Store/迁移/扩展位）+ 便签墙 + 文档与登记 | **已交付**；断网可新增/编辑/置顶便签，刷新不丢 |
| **S1** | 任务模型 + 看板视图 + 分组实体 | **已交付**；卡片拖拽改状态与列表一致 |
| **S2** | 日程聚合（企微/iCloud CalDAV + Outlook Graph + ICS 订阅，只读）+ 会话归档 host 迁移 + 管理 UI | **已交付**；真实外部账号联调以 owner 真机为准（见 05） |
| **S3** | 专注 + 跨对象搜索 + 日程写回（本地事件、写回外部、发布订阅源）+ 多项目看板 | **未开始** |
| **笔记审阅** | AI 主写、人审阅；专用审阅会话 + 逐行批注 + 本轮改动 + 会话级基线 | **已交付**（2026-11-14，见 07） |

> 每一步合并前：插件目录 `npm run verify` + 根 `pnpm run check` 全绿；文档与守卫同步更新（活跃插件四件套 + 登记 + 市场索引），不把守卫留到下一步。
> **首发**：desk-one 从未发布过；历史 `[0.2.2-rc.1]`（2026-11-06）只是准备阶段条目，已并入 `0.2.2-rc.3` 首发段（见 CHANGELOG）。

## 风险与待验证

| 风险 | 影响 | 对策 |
| :--- | :--- | :--- |
| client entry 非 active 会导致整页加载失败 | 套件做大了反而拖垮宿主 | 单 entry；能力门用告警 + return（不抛错）；模块按需渲染 |
| 真实外部服务未联调（企微/iCloud/Outlook） | 协议细节与真机不一致 | 按 RFC 与公开观察实现 + 真机探针；owner 配置凭据后联调；失败逐条可见 |
| 企业微信 CalDAV 密码每次重新获取都会作废旧密码 | 同步周期性失效 | 提示重新获取 + 保存失败状态；不自动重试到死循环 |
| 企业微信 CalDAV 的日历家目录、非 IANA TZID、增量方式 | 解析错位或拉不全 | 真机探针确认 `/calendar/` 家目录与 VTIMEZONE；iCal 解析保留 VTIMEZONE 处理 |
| iCloud CalDAV 分片主机、REPORT 限制、频率限额 | 拉取失败或限流 | 分片主机白名单校验、窗口按 366 天/400 条切分、60 读/分钟限流；真机探针先验证 |
| iCloud 共享 / 家庭日历是否出现在 CalDAV 集合里 | 看不到共享日历 | **未验证**；只展示服务端返回的日历集合，提供逐个勾选，不假设可见性 |
| Outlook Graph 令牌过期 / 回调注册 | 连接失效或登录失败 | refresh token 进凭据库自动续期；回调地址非法时明确报错；过期登录流程自动清理 |
| 宿主没运行时不同步（无后台守护进程） | 用户以为实时 | 打开面板即同步 + 15 分钟定时；UI 明示上次同步时间 |
| 首次同步写入放大（per-record 存储逐条 put） | 首同步慢 | 镜像窗口 `[-6, +3]` 个月、分批写入 + 进度提示、ETag/syncToken 未变跳过写 |
| 时区与夏令时 | 今日边界、冲突判定错位 | 统一存 UTC + 原始时区；「今日」边界按用户时区计算；测试覆盖 DST |
| 笔记库 = 用户网盘同步目录 | 扫描竞态 / 大目录 | 索引派生 + 30s TTL 单飞缓存；扫描有文件数 / 深度 / 超时上限；不可读文件不阻塞 |
| 个人规模假设 | 对象过万后查询变慢 | 目标 < 10k 对象；列表分页；必要时再换 SQLite |

## 宿主能力核对（2026-11-14，按官方 0.2.2-rc.3 核对）

> 结论：rc.3 对 desk-one **无破坏性接口变更**（11-13 新增的官方 `Menu` 用法只用未变的 `anchor/items/selectedId`；primitives / 槽位 / sessions·workspaces·uiWorkspace 面未变），依据仓库 `docs/upstream/0.2.2-rc.3.md`。

| 能力 | 状态 |
| :--- | :--- |
| 侧栏入口与主面板槽位 | 已用（默认 1 组；固定 tab 时动态增加，`client/install.ts` + `panel.ts` + `pin.ts`） |
| 持久化 seam | 已用（`ctx.storageDomain`，域 `desk_one` = `nodes` + `edges` 两表，per-record） |
| Agent 工具注册 | 已用（`ctx.tools`，19 个 `desk_*` 工具：便签 / 任务 / 分组 / 日程 / 笔记页检索） |
| 随包 skill | 已用（可选 `skills` 服务经 `ctx.inject` fork 注册 `desk-one` 操作指南；缺服务时工具照常） |
| 凭据 | 已用：`ctx.credentials` 的 `ref`（CalDAV 密码 / ICS 订阅链接）与 `record`（Graph refresh token）；值不进日志 / HTML |
| 设置页注册 | v1 不注册宿主设置页；连接与日历设置收在面板内「日历设置」子页（单入口原则） |
| 通知/提醒通道 | 未使用（S3 专注提醒时再查） |
| 宿主 HTTP 数据面 | 已用（`ctx.webServer.register` 前缀路由 + 信任栅栏；`/api/desk-one`、`/api/desk-one/sessions`、`/api/desk-one/schedule`） |
| 右侧栏 / 会话槽 | 已用（`sidebar.right.pane.tab`、`sidebar.right.tab.document.actions`、`sidebar.session.row.leading/trailing`、`conversation.input.overlay`） |
| 会话 / 工作区 / 导航服务 | 已用（`ctx.inject(['sessions','workspaces','uiWorkspace',…])` 可选 fork；缺服务降级隐藏相关 UI） |

> 查证方式按仓库 AGENTS：先 grep 官方源码（本机 checkout `~/.dsh-launcher-panel/source`，`DSH_SOURCE` 可覆盖），禁止凭记忆写 API。

## 已确认决策

### 2026-11-06

1. 产品名：中文 **同桌**、英文 **Desk One**；面板标签依次为 **日程 / 笔记 / 便签 / 任务 / 会话**（笔记在第二位，日程页的开始卡按「笔记 / 便签 / 任务」顺序给创建入口）；每个 tab 可「固定到左栏」为独立入口。
2. 数据放 **profile 级**（跟人走、跨工作区），经官方 `ctx.storageDomain`（域 `desk_one`，表 `nodes` / `edges`）持久化。
3. S0 已落地：骨架 + 统一对象模型 + 便签墙；日程只读放 S2，写回放 S3。
4. 首发版本号跟随官方线：**`0.2.2-rc.3`**（desk-one 从未发布；历史 rc.1 条目并入 rc.3 首发段）。

### 2026-11-09 增补

5. 模块命名：代码目录 / 路由前缀沿用 `schedule`，agent 工具 `desk_schedule_*`；产品标签中文「日程」、英文 **Schedule**（对外英文统一 Schedule，不再用 Time / Calendar）。理由：以后不只有日历，还会有日程列表与可排期的待办，并与便签、任务板、会话联动；底层远端日历对象仍按 provider 记录。
6. 日程支持三源只读：企业微信 CalDAV、iCloud CalDAV（Apple App 专用密码）、Outlook **个人账号 Microsoft Graph OAuth**；另加 provider 无关的公开 ICS 订阅通道。**Graph 已落地（2026-11-09）**；Outlook 发布 ICS 仅保留历史兼容、UI 不再暴露。
7. v1 不创建本地事件、不写回外部日历、不提供自有日历的导出/订阅发布；订阅外部公开 ICS 已支持。将来做本地事件时必须**同时提供订阅/导出能力**，否则用户迁移日历的成本无法回收。
8. 归档插件退役：Desk One 首发包含归档管理 UI、并经 owner 真机验证后，由 owner 执行 npm deprecate；README / CHANGELOG / AGENTS 等工程文件由 agent 维护。退役不早于会话管理 UI 上线。
9. 第二阶段路线：A1 归档 host 迁移 → B 日程 v1 → A2 会话管理 UI + Desk One 首发 → 归档插件退役。**A1/A2/B 均已交付（2026-11-14）**，退役待 owner 真机验证首发版本后执行。
10. 日程页**必须分区**：固定「开始（创建入口）+ 今日 + 近期（1–14 天滑杆）+ 主视图（月 / 周 / 列表）+ 日历设置（源 → 日历两级，显隐/颜色/同步）+ 事件详情」几块；多源多日历必须按「源 → 日历」组织，颜色可辨、筛选持久化。实现见 `05-schedule.md`。

## 当前进度（2026-11-14）

* **已交付**：S0 / S1 / S2 + 笔记审阅（07）+ 会话目录与归档管理（04，Phase 1–2 + Phase 3 管理 UI）+ 19 个 agent 工具与随包操作指南 skill。插件 `npm run verify`（typecheck / build / test / package）与根 `pnpm run check` 为合并门禁。
* **已重构（2026-11-14）**：审阅模块拆分（`client/notebook/review/`）、notebook controller 拆 hook、`host/store/` 按领域拆仓库、schedule host 拆 `connections/sync/outlook-oauth`、i18n 拆功能片段、共享工具 helper 收敛；行为保持不变，测试全绿。
* **未验证**：企业微信 / iCloud / Outlook 真实账号联调（等 owner 凭据真机验证）；归档插件退役未执行（等首发验证）。
* **未开始**：S3（专注、跨对象搜索、日程写回、多项目看板）。
