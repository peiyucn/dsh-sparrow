# 00 · 需求总览 — dsh-desk-one

> 状态：**设计稿**（2026-11-05），评审通过后再开工；实现完成后按仓库惯例收敛为「现状总览」。
> 配套文档：`01-object-model.md`（统一对象模型，本套件的契约核心）、`02-modules.md`（各模块需求明细）。

## 定位

DSH Web 里「与 harness 共用一张桌子」的工作套件 Desk One：一个侧栏入口、一个面板、**一套统一对象**，把待办、日程、专注、便签、看板收在一处；Agent 通过一组工具读写同一套数据，而不是各模块各存一份。

日程来自两条真实线路，都是「个人可搞定」的通道：

* **Outlook（个人账号）**：Microsoft Graph 委托权限，设备码登录，用自己的 Azure 应用，不需要企业管理员同意。
* **企业微信（公司租户）**：CalDAV，服务器 `caldav.wecom.work`，账号为邮箱，密码在手机端「日程 → 日程设置 → 同步至其他日历」获取（每次重新获取会让旧密码失效）。

## 设计原则

1. **一个对象模型，多个视图**：总览是查询、任务板是分组、便签墙是排序，都不存第二份数据。
2. **核心稳定，扩展靠命名空间**：核心字段少且不轻易变；模块特有状态进 `attrs.<namespace>`，新增能力不改核心 schema。
3. **外部数据只镜像**：外部日程在本地是带来源与版本的镜像对象；写回是显式动作，v1 默认只读。
4. **本地优先**：断网、令牌失效、同步失败都不阻塞本地记录；每个失败在界面上可见，不静默。
5. **可迁移**：对象可导出为 JSON Lines；schema 变化走迁移表，旧数据能平滑升级。
6. **单入口**：客户端只注册一个 entry，模块在面板内路由——宿主 boot 审计把任一 client entry 非 active 当致命失败，入口越少风险越小。

## 模块地图

| # | 模块 | 职责 | 主要对象 | 阶段 |
| :-- | :--- | :--- | :--- | :--- |
| 1 | 面板外壳 Shell | 侧栏入口、面板框架、模块路由、加载与错误态 | — | S0 |
| 2 | 总览 Overview | 跨模块汇总（内容与联动规则待设计；S0 空白占位） | 全部 | 待设计 |
| 3 | 待办 Tasks | 收集箱、推进、完成、优先级、估算、排期入口 | `task` | S1 |
| 4 | 日程 Calendar | 月/周/议程视图、本地事件增删改、外部镜像展示与冲突提示 | `event` | S2（只读） |
| 5 | 同步 Sync | Outlook Graph 与企业微信 CalDAV 的连接、拉取、状态与错误 | `event`（镜像） | S2（只读） |
| 6 | 专注 Focus | 番茄计时，绑定任务，累计实际用时 | `focus` | S3 |
| 7 | 便签墙 Notes | 快速记录、置顶、颜色、一键转任务 | `note` | S0 |
| 8 | 看板 Board | 按项目分泳道、拖拽改状态 | `project` + `task` | S1 |
| 9 | 搜索 Search | 跨对象标题/正文/标签检索 | 全部 | S3 |
| 10 | 设置 Settings | 连接配置、同步状态、导入导出、关于 | — | S0（连接卡 S2 补） |
| 11 | Agent 工具层 | 跨模块工具，读写同一套对象 | 全部 | S0 起随模块 |

## 代码结构（按功能模块）

共享一套对象模型，功能按目录隔离；新功能（任务板 / 日程 / 专注）照此扩展，不往便签目录里堆。

```text
src/
  constants.ts contract.ts domain.ts model.ts trust.ts   # 共享：统一对象模型与安全基线
  host.ts index.ts                                        # host 入口 / 公共再导出
  host/
    gates.ts http.ts router.ts                            # 装配：能力门 / HTTP 基础 / 前缀路由（含信任栅栏）
    store.ts                                              # 共享对象存储（nodes 表按 kind 判别）
    notes/{routes,tools}.ts                                # 便签功能的 host 半（路由表由 router 挂载）
    tasks/{routes,tools,group-routes,group-tools}.ts       # 任务板功能的 host 半（含分组实体，S1）
  client/
    index.ts install.ts panel.ts icon.tsx compat.ts       # 入口与客户端装配
    i18n.ts locale.d.ts                                   # 共享文案（键按功能命名空间）
    app/{DeskOnePage.tsx,types.ts,utils.ts,styles.ts}      # 面板外壳：页头 / 标签 / 空态 / 外壳样式
    notes/{api.ts,components/*,hooks/*,styles.ts}          # 便签功能的 client 半
    tasks/{api.ts,types.ts,components/*,hooks/*,styles.ts}  # 任务板功能的 client 半（S1）
    styles.ts                                             # 聚合注入：app + 各功能 CSS
test/
  shared/{model,task-model,trust}.test.mjs
  host/notes/{host,routes}.test.mjs
  client/compat.test.mjs
  structure.test.mjs                                      # 结构守卫（拼接全部 client 源码）
```

* 约定：**新功能 = `src/client/<feature>/` + `src/host/<feature>/` + `test/<layer>/<feature>/`**；只有真正跨功能的东西才放在 `src/` 根或 `client/app/`。
* CSS：外壳在 `client/app/styles.ts`、功能在 `client/<feature>/styles.ts`，由 `client/styles.ts` 聚合；结构测试按功能文件读取。
* 测试发现：仓库 `scripts/verify.mjs` 使用 `test/**/*.test.mjs`，支持按功能分子目录。

## 模块协同（关键路径）

* **便签 → 任务**：`derivedFrom` 边；转任务后原便签保留可回溯。
* **任务 → 日程**：任务带到期时间，排期后生成 `event`，用 `scheduledAs` 边关联（v2 写回时同一个事件）。
* **专注 → 任务**：`focus` 通过 `workedOn` 边绑定任务，实际用时由专注会话汇总，不落冗余字段。
* **总览**：`note`（最近项与条数） ∪ 后续接入的 `task` / `event` / `focus`。
* **看板**：`task` 按 `status` 分组，按 `projectId` 过滤；看板不是独立数据。
* **记忆系统（未来）**：在 `attrs.memory` 与 `references` 边上挂载，不需要改核心模型。

## 非目标

* 团队协作、共享日历、多人权限。
* 项目依赖图/甘特图；看板只做状态泳道。
* 邮件、企业微信管理端能力、日历以外的工作流对象。
* 替代 Outlook / 企业微信客户端；本套件是「汇总与安排」，不是它们的镜像客户端。

## 分期与验收（小步快跑，每步独立可发布）

| 步 | 内容 | 产出 / 验收 |
| :-- | :--- | :--- |
| **S0** | 插件骨架 + 对象模型核心（Node/Edge/Store/迁移/扩展位）+ 便签墙 + 文档与登记 | 能装、`verify` 绿；断网可新增/编辑/置顶便签，刷新不丢 |
| **S1** | 任务模型 + 看板视图（+ 简单列表） | 卡片拖拽改状态与列表一致；「总览」先出任务版 |
| **S2** | 日历聚合：企业微信 CalDAV + Outlook Graph（只读），并入「总览」 | 两源事件合并展示、冲突标记；令牌/密码失效有提示 |
| **S3** | 专注 + 搜索 + 日程写回 | 番茄绑定任务、跨对象搜索、写回失败逐条反馈 |

每一步合并前：插件目录 `npm run verify` + 根 `pnpm run verify` 全绿；文档与守卫同步更新（活跃插件四件套 + 登记 + 市场索引），不把守卫留到下一步。

## 风险与待验证

| 风险 | 影响 | 对策 |
| :--- | :--- | :--- |
| client entry 非 active 会导致整页加载失败 | 套件做大了反而拖垮宿主 | 单 entry；能力门用告警 + return（不抛错）；模块按需渲染 |
| 个人 Microsoft 账号注册 Azure 应用要先有 Azure 账号 | Graph 线路在 v1 可能延期 | 先做 CalDAV（企业微信），Graph 单独一条线，互不阻塞 |
| 企业微信 CalDAV 密码每次重新获取都会作废旧密码 | 同步周期性失效 | 提示重新获取 + 保存失败状态；不自动重试到死循环 |
| 时区与夏令时 | 今日边界、冲突判定错位 | 统一存 UTC + 原始时区；「总览」里的今日边界按用户时区计算；测试覆盖 DST |
| 存储 API 未查证 | 数据层可能返工 | 先 grep 官方源码确认 seam，再定存储实现（见下） |
| 个人规模假设 | 对象过万后查询变慢 | 目标 < 10k 对象；列表分页；必要时再换 SQLite |

## 宿主能力假设（实现前必须查证，**当前未查证**）

* 侧栏入口与主面板的槽位/路由方式。
* 设置页注册方式与存储域。
* `ctx.tools` 注册 agent 工具的方式。
* 凭据读取（只走官方凭据服务，不落明文）。
* 通知/提醒通道、以及 host 与 client 的数据面（HTTP 路由或事件流）。
* 持久化 seam（官方 storage 或工作区/配置目录，按官方能力选）。

> 查证方式按仓库 AGENTS：先 grep 官方源码（本机 checkout `~/.dsh-launcher-panel/source`，`DSH_SOURCE` 可覆盖），禁止凭记忆写 API。

## 已确认决策（2026-11-06）

1. 产品名：中英文统一为 **Desk One**；面板标签为 总览 / 便签墙 / 任务板 / 日程 / 专注（标签名描述「怎么用」，不追求后缀整齐）。
2. 数据放 **profile 级**（跟人走、跨工作区），经官方 `ctx.storageDomain`（域 `desk_one`，表 `nodes` / `edges`）持久化。
3. S0 已落地：骨架 + 统一对象模型 + 便签墙；日程只读放 S2，写回放 S3。
4. 首发版本号跟随官方线 `0.2.2-rc.1`，与仓库其他插件一致。
