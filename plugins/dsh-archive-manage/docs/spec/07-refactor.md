# 07 · 归档插件重构：官方写通道 + unarchive + 回收站语义统一

> 决策来源（owner，2026-09-01）：归档插件整体重构。背景：社区竞品调查确认「unarchive 是基本款、回收站是通用心智」；AGENTS 三档 seam 规则修订让「私有 seam 依赖」合法化，官方私有写通道（enqueueOperation + requireState + setState）可从机制上消除幽灵问题。

## 目标

1. 归档集变更（加 / 去 id）全部迁移到官方私有写通道，退役自建补偿体系；
2. 新增「取消归档（unarchive）」：官方归档标记的会话回到会话列表原位置；
3. 「备份区」语义统一为「回收站」（UI 文案 + 目录名 + 内部命名），一次性迁移旧目录；
4. 保持既有能力不回归：文件级回收（移出/还原/彻底删除）、subagent 父子原子处理、@ 列表即时移除、live 会话保守拒绝；
5. 卸载语义口径固化：明确「卸载不自动恢复」的技术根因、三种已操作会话的卸载后状态、卸载前收尾步骤，写入 README 与面板提示。

## 范围

**做**：
* host 域写通道迁移（见「通道迁移」）
* 启动能力检查（registry 私有 surface 探测，fail-fast）
* unarchive 路由 + 客户端「取消归档」按钮（全部归档区行，含 live 与非 live）
* 回收站语义统一（文案 / 目录名 / 路由 / locale / 内部变量；sidecar 文件名保留）
* 幽灵补偿退役（见清单）
* 旧备份目录一次性迁移
* 卸载语义口径固化（spec 本节 + README《卸载与残留》重写 + 面板卸载提示）

**不做**（范围控制，后续按需）：
* 回收站容量上限 / 自动过期（dream12347 的 TRASH_LIMIT 模式）
* 搜索 / 预览 / 统计 / 分叉
* 对 live 会话的删除（保留保守拒绝）

## 通道迁移（核心）

* 新增 host 工具函数 mutateArchivedSet(update)：
  * 经 ctx.workspaceRegistry.enqueueOperation 挂官方串行链；
  * 链内 requireState() 读官方内存态 → 计算新集合 → setState(next)（官方持久化写：域 + 内存态一步同步）；
  * 自建 serializeDomainWrite 队列删除；
* 归档方向的「域直写 + registry.archiveSession」双写替换为 mutateArchivedSet（追加 id），sessionKnown 校验保留（面板列出源 = 必然存在的会话，防御性 best-effort）；
* unarchive 方向 = mutateArchivedSet（过滤 id），幂等：不在集合内返回 ok；
* 启动能力检查 assertRegistryMutationApi：探测 enqueueOperation / requireState / setState，缺失即启动报「不支持的 DSH workspace registry（缺少 ...）」——社区 huahai0202 同款。**失败影响面（已查证 cordis 源码）**：cordis 对插件 apply/start 抛错逐插件 try/catch + logger.error（lib/index.js），插件启动失败只让本插件不可用，dsh 本体与其余插件照常启动；本插件路由不注册，面板请求失败走现有错误横幅；
* 同步机制不变：setState 触发官方域变更帧 {type:'archived'}，侧边栏自动更新，插件不手发帧。

## 幽灵补偿退役清单

* 删除：serializeDomainWrite 队列、warnIfRegistryStale 分歧告警（通道迁移后内存态恒同步，分歧不应产生）；
* 简化：readArchivedIds 改为直接读 registry.archivedSessionIds（getter 公开），域直读仅作 fallback；
* 保留（简化版）：启动幽灵清扫 sweepGhostArchivedIds——清历史遗留（旧版本直写时代可能已存在的、不在持久化中的幽灵 id），迁移后不再产生新幽灵，保留一次性防御。

## 保留不变

* 文件级回收：rename 移入回收站 / 还原搬回原位 / rm 彻底删除（官方仍无删除 API，特例不变）
* sidecar（dsh-archive-manage.json，字段不变）+ 恢复逻辑
* subagent 父子原子处理 + 孤儿清扫
* 投影缓存行失效、api-session/removed 补发、WorkspaceEntity.detach/attach 记账
* live 会话置灰 + SESSION_LIVE 保守拒绝
* 备份位置面板明示 + 卸载指引

## 回收站语义统一（改名）

* 目录：sessions-archived-backup → .sessions-recycle-bin（默认 $DSH_HOME 下）；启动/首次使用时检测旧目录存在 → 一次性 rename 迁移；rename 失败继续用旧目录 + 面板提示
* 路由：/api/archive-manage/backup-dir → /api/archive-manage/trash-dir（同包客户端同步）
* locale / 内部变量 / 函数名：backup* → trash* 对齐（zh/en 全量）
* UI 文案：
  * 「备份区」→「回收站」（Trash）
  * 「备份」→「移入回收站」（Move to trash）
  * 回收站「恢复」→「还原」（Restore）
  * 「删除」→「彻底删除」（Delete permanently）
  * 归档区新增「取消归档」（Unarchive）——与回收站「还原」区分，避免同名混淆
* sidecar 文件名不动；README/AGENTS/CHANGELOG 同步

## 卸载语义（口径固化）

**技术根因**：插件从 DSH profile 移除后，下次启动不再加载其代码——卸载没有执行时机，「卸载时自动恢复」技术上不存在。卸载语义 = 卸载前显式收尾 + 卸载后诚实残留。

| 用户已做操作 | 卸载后状态 | 口径 |
| --- | --- | --- |
| 移入回收站 | 会话目录 + sidecar 留在回收站目录 | 自愈：sidecar 自含原路径 / 标题 / 工作区归属，重装插件即可继续还原 / 彻底删除 |
| 取消归档 | 文件从未移动，仅归档标记移除 | 零残留：会话回到官方原生列表状态 |
| 彻底删除 | 已 rm | 不可逆：强确认设计如此，README 诚实记录 |

* **卸载前收尾**（README《卸载与残留》写入）：① 面板回收站区「全部还原」或「清空回收站」一步处理完；② 再卸载插件
* **面板提示**：回收站非空时区块内显示「卸载插件前请先还原或清空回收站；卸载后仅能通过重新安装继续操作」
* **不做**：卸载时自动恢复（技术不存在，不做假的「卸载清理」承诺）

## 兼容性

* 已发布 alpha.2 用户的旧回收目录：自动迁移（如上），sidecar 格式不变，零数据丢失；
* unarchive 为纯新增能力，无历史兼容负担；
* 私有 seam 依赖 dsh 版本：能力检查 fail-fast + AGENTS 记录适配版本（>= 0.1.2-alpha.x，待实现时实测确认）。

## 验收标准

1. 归档区任一会话（live 与非 live）点「取消归档」→ 侧边栏立即重现（原工作区位置），无需重启；
2. 重复取消归档幂等；
3. 归档 / 取消归档 / 移入回收站 / 还原 / 彻底删除五条链全部走官方串行通道，域与 registry 内存态无分歧；
4. 旧目录 sessions-archived-backup 存在时：首次启动自动迁移为 .sessions-recycle-bin，数据完整、面板路径显示新目录；
5. 启动能力检查：故意用缺方法的 mock registry 时，插件明确报「不支持的 DSH workspace registry」；
6. 回归：@ 列表移除、subagent 原子、live 置灰、投影缓存失效、api-session/removed 全部保持；
7. npm run verify 通过（新增单测：集合变更纯函数、unarchive 幂等、迁移决策函数、能力检查）；
8. README《卸载与残留》与本节口径一致（卸载前收尾 + 重装自愈 + 取消归档零残留 + 删除不可逆），面板回收站非空时显示卸载提示。

## 测试

* 纯函数导出：mutateArchivedSet 的新集合计算（追加/过滤/幂等）、迁移目录决策（旧在/新在/双在）、能力检查（缺方法清单）；
* host 测试：仿现有 host.test.mjs 模式，mock registry 的私有方法验证串行链调用次序；
* 结构测试不新增断言。
