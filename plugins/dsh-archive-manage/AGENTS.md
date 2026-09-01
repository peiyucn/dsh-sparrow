# 项目指令 — dsh-archive-manage（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记本插件专属约束与 seam 特例。

## 项目概况

DSH Web 插件：归档会话管理 —— 侧边栏 footer 动作区一个入口按钮 + 弹窗列出归档会话（归档区 / 回收站）。已实现：取消归档（移除官方归档标记，会话回列表；live 会话同样可操作）、移入回收站（可逆）、彻底删除（不可逆）、还原（单个 / 全部）、彻底删除（单个 / 全部）、旧格式条目收纳（仅列出 / 彻底删除）、旧备份目录一次性迁移（2026-09-01 重构）。2026-09-01 发布前包名由 `@dsh-sparrow/dsh-archive-session` 更名为 `@dsh-sparrow/dsh-archive-manage`（旧名从未发布）；改名只记内部文档，不进 README/CHANGELOG。

> 路线 A（轻量标题 TTL 缓存）已退役：dsh 0.1.2-alpha.1 起官方 `sessionProjectionCache` 已覆盖 @ 候选标题读取的昂贵解码路径，插件再包一层 TTL 意义不大。

> 入口槽位查证结论（dsh ≥ 0.1.1-rc.2）：`ui-workspace` 没有可注入的工具栏 slot；采用 `ui-sidebar` 公开 slot `sidebar.footer.action`（`packages/client/ui-sidebar/src/client/index.ts:52`）。

## seam 特例（需项目 owner 认可，已定案）

* **允许**：直接移动（移入回收站，可逆）或删除（彻底删除，不可逆）「会话日志目录」。当前只对 `SessionPersistence.locate(meta)` 返回 `kind: 'jsonl'` 且父目录明显为单会话目录的路径执行；其他后端返回 `BACKEND_UNSUPPORTED`。
* **设计依据（官方行为，源码查证）**：官方 @ 候选三层链路均不过滤归档标记——客户端 `packages/client/ui-reference/src/client/index.ts:48-73`（候选直通远端结果渲染，本地会话快照只用于取 `updatedAt`）；host `packages/context/session-reference/src/index.ts:167-202`（`listCandidates` 仅排除自身，候选上限 `DEFAULT_CANDIDATE_LIMIT = 50`，见同包 `config.ts:6`）；数据源 `packages/session-query/session-query/src/corpus.ts:58-77`（`listSessions` = 持久化全量会话头 + live）。归档标记只让侧边栏隐藏会话，@ 候选的输入是持久化清单——**文件级搬移（移入回收站/彻底删除）是让会话离开 @ 的唯一可逆手段**，本特例的存在理由即在此。（2026-09-01 复核 alpha.4：`listCandidates` / `listSessions` 不过滤归档标记的机制不变；行号引用随版本漂移。）
* **边界**：
  * 移入回收站档只移动（移入插件回收站目录，默认 `$DSH_HOME/.sessions-recycle-bin/`；旧目录 `sessions-archived-backup` 首次使用时一次性 rename 迁移，失败继续用旧目录并面板提示；配置键 `trashRoot` 优先、旧键 `backupRoot` 回退兼容）；彻底删除档允许 `rm`，并须输入完整会话标题强确认。**父会话的 subagent 会话（`SessionHeader.origin === 'subagent'` 且 `parentSession` 指向该父会话）一并处理**：移入时子目录随父目录移入回收站条目 `subagents/` 子目录，彻底删除时一并 `rm`；任一子会话仍被进程占用或后端不支持文件级处理时整次动作拒绝（`SESSION_LIVE` / `BACKEND_UNSUPPORTED`），避免留下处理一半的子会话（2026-08-31）。
  * 动作前二次确认；活动会话（本次 dsh 运行中驻留，**未释放**）**无法卸载**：`AgentHandle.dispose` 是官方 session-controller 持有且被丢弃的 teardown 能力，dsh 无公开「结束会话」API（查证 0.1.2-alpha.1 源码：session / agent 常驻 live store 至进程退出）。host 侧生成中直接拒绝、未释放的一律 `SESSION_LIVE`；面板在归档区内把这些会话分组前置（小标题「未释放（n）」、行内状态角标「未释放」用警示色），仅置灰移入回收站/彻底删除按钮（悬停提示），下次启动 dsh 后再操作；「取消归档」只动归档集、不碰文件，live 会话可直接执行（2026-08-30；取消归档 2026-09-01）。此前走 `fiber.dispose` + 轮询等待卸载的路线已废弃：dispose 只拆 agent 作用域、不解除 live store 登记，会留下僵尸 agent。
  * 动作后同步 `workspace` 记账：`WorkspaceEntity.detachSession()`（移入回收站/彻底删除）/ `attachSession()`（还原）；归档集变更一律走官方写通道（见下条）。域变更经 workspace-controller 的 `{type:'archived'}` follow 帧同步客户端侧边栏会话列表（`packages/api/workspace-controller/src/feed.ts:112-115`，插件不手发帧；@ 提及候选列表不受该帧影响，见上文「设计依据」）。
  * **归档集写通道（私有 seam 依赖，2026-09-01 起）**：加 / 去归档 id 一律经官方 WorkspaceRegistry 的 `enqueueOperation` + `requireState` + `setState`（TS private，JS 运行时真实存在；社区 huahai0202/dsh-better-archive 同款）。理由：官方无公开 unarchive，且 registry 内存态不订阅域变更——直写域后官方后续任何 workspace 写操作会把已移除 id 复活为幽灵条目；官方写通道使域与内存态一步同步，从机制上消除幽灵。护栏：不替换 / 不包装官方方法；启动能力检查 `assertRegistryMutationApi` 缺方法即 fail-fast「不支持的 DSH workspace registry」（cordis 逐插件捕获启动错误，不影响 dsh 本体）；已对 dsh-v0.1.2-alpha.4 源码复核（workspace 包零 commit、方法签名不变）；运行期实测待本地 alpha.4 验证，启动能力检查先行把关。历史域直写补偿（`serializeDomainWrite` 队列 / `warnIfRegistryStale` 告警）已随通道迁移退役；`sweepGhostArchivedIds` 保留简化版，只清旧版本可能遗留的历史幽灵。
  * 移入回收站/彻底删除后**失效官方投影缓存行**（`storageDomain.get('session_projcache').table('sessions').delete(id)`；派生数据可安全删除，官方服务常驻打开该域，未加载则跳过）。
  * 移入回收站/彻底删除成功后**补发官方公开事件 `api-session/removed`**（session-controller 的 cordis Events 公开声明、@mode emit）：会话目录已移走，客户端会话列表据此即时移除条目，避免侧边栏「未分组」残留（2026-08-30）。
  * **启动清扫删除孤儿 subagent 会话**（`origin === 'subagent'` 且父会话已不在持久化中）：目录 `rm` + 投影行失效 + 工作区记账清理；父/子任一侧仍被进程占用时跳过。与彻底删除档同属目录级 `rm` 特例；jsonl 后端 `list()` 按目录枚举，删目录即从持久化清单消失（2026-08-31 查证 `packages/session/session-persistence-jsonl/src/index.ts`）。
  * 回收站条目目录写 `dsh-archive-manage.json` sidecar（原路径 / 标题 / workspaceIds，version 2 另含 subagents 清单：各自原路径 / 标题 / workspaceIds），还原时父目录与子目录一并移回并 `WorkspaceEntity.attachSession()`；无 sidecar 的旧格式目录按「仅列出/彻底删除」收纳，不尝试还原；version 1 sidecar 照常还原（视为无 subagents）。
* **卸载透明**（2026-08-30 起；卸载语义 2026-09-01 口径固化）：回收站位置在归档面板顶部提示中明示（`GET /api/archive-manage/trash-dir`，点击复制）；回收站语义提示（不再出现在 @ 列表）放在回收站内；卸载影响与恢复指引只在 README《卸载与残留》章节。**卸载语义（2026-09-01）**：插件从 profile 移除后代码不再加载，卸载没有执行时机，「卸载时自动恢复」技术上不存在——卸载 = 卸载前显式收尾（面板「全部还原」/「全部彻底删除」一步处理，回收站非空时面板内有提示）+ 卸载后诚实残留（回收站目录 + sidecar 保留，重装即可继续还原/彻底删除；取消归档零残留；彻底删除不可逆）；还原逻辑只经本插件，不做假的「卸载清理」承诺。
* **仍禁止**：monkey-patch 核心、读 / 改会话日志内容、动会话目录以外的内部文件（附件 / 存储域 / 凭据等一律走官方服务）。

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块。
* 一切副作用在 apply 内注册并配 `ctx.effect` 清理；不泄漏定时器 / watcher / AbortController。

## 关键文件速查

    src/host.ts              — host half 入口（REST 路由 + 清理链 + 官方写通道 + 目录迁移 + 记账/事件同步）
    src/archive.ts           — 纯逻辑（配置归一化双键 shim / 迁移决策 / sidecar 解析 / 路径掩码 / 确认强度）
    src/client/index.ts      — client half 入口（locale 字典 + API 封装 + sidebar slot 注册）
    src/client/ArchiveDock.tsx — 归档面板（归档区/回收站区块卡、确认弹窗、样式注入）
    test/archive.test.mjs    — 纯逻辑单测
    test/host.test.mjs       — host 纯函数单测（路径守卫 / 单会话目录判定）
    cordis.patch.yml         — 组合补丁（npm 安装路径）
    dev.patch.yml            — 开发补丁（--patch 加载本地 TS，内含本机绝对路径）
    docs/spec/               — 设计文档

## 测试

* Node 内置 test runner，用例在 `test/*.test.mjs`；命名 `<模块名>.test.mjs`，AAA 结构，it 描述「输入条件 应该 期望结果」。
* 清理链纯逻辑（活动会话拒绝判定、移动 / 彻底删除、记账清理、同步帧、确认强度判定、迁移决策）必须可单测。
