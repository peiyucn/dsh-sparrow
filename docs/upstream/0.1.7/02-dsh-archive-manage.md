# 02 · dsh-archive-manage — **部分退役**

## 1) 定位与结论

归档会话管理：把会话移入/移出归档、删除（含整棵子会话树）、回收站、备份。
**结论：官方 alpha.2 补上了「归档查看 + 取消归档」，本插件那半边应退役；「删除 / 备份 / 回收站 / 子会话树」官方明确不做，保留。**

## 2) 现状（真机 + 源码双证）

| 半边 | 状态 | 证据 |
|---|---|---|
| host | ❌ 自停用（会话格式门只支持 v0/v3） | 真机启动日志：`当前 dsh 的会话格式为 v4，本插件仅支持 v0 / v3`；`packages/core/session/src/types.ts:89` |
| client | ❌ `sidebar.footer.action` entry 抛 #130（图标改名） | 真机 console：`slot entry crashed in 'sidebar.footer.action'`；`src/client/ArchiveDock.tsx:7` 引用的 `IconArchiveOutline20` / `IconCloseOutline16` 在 alpha.2 已不存在 |

**官方新增（决定退役范围的证据）**：

* 侧栏工作区支持三种筛选 + 撤销 + 「停止并归档」（`packages/client/ui-workspace/README.zh.md:52`）；搜索结果里可取消归档（`:46`）。
* 官方**已在自己注册**会话行 action：`sidebar.workspaces.session.menu.item` 与 `…row.action` 各有 `id: 'archive'` 条目（`ui-workspace/src/client/index.ts:274,277`）。
* 官方明确不做：「**没有 Session 删除**」（`ui-workspace/README.zh.md:208`）。

### 2.1 官方「归档」到底是什么（源码 + 真机逐条核过）

* **存储**：注册表全局 id 集合 `archivedSessionIds`（`packages/workspace/workspace/src/index.ts:340`），随 workspace 状态持久化（`workspace/src/spec.ts:62`）。
* **不动工作区归属**：archive 只写集合 + 把该 id 从 pinned 里剔除（`:361-383`）；unarchive 只从集合移除，注释明说「记账槽位从未被动过，会话回到原记录位置」（`:385-405`）。
* **UI 表现 = 原位灰显 + 默认隐藏 + 不可打开**（`ui-workspace/src/client/tree.ts:62-63`「shown grayed in place and not openable」；文案「已归档」「已归档对话暂时无法查看，请取消归档后查看」）。
* **显隐靠筛选，没有「已归档」容器**：真机点开 View options，菜单就三组开关 —— **Group by**（WorkSpace / Workspace Tree / In one list）、**Order by**（Manual / Last updated）、**Filter sessions**（**Show archived / Archived only**）。侧栏里的 **「未分组 / Ungrouped」是「不属于任何已注册工作区」的会话分组**（`tree.ts:449-470` 的 `groupByWorkspace(..., view.ungroupedOrder)`），**与归档无关** —— 归档不会把会话搬进它。
* **入口**：会话行 hover 按钮（order 100）+ "…" 菜单（order 400）；有在跑工作时走「停止并归档」确认（`ui-workspace/src/client/locales.ts:61-75`）。
* **归档还是宿主硬门**：archived 会话及其 subagent 后代不能再跑模型步（`api/session-controller/src/archived-session-gate.ts:27-31,43-55`）→ 官方归档 = **停用 + 藏起来**，不只是分类。

### 2.2 官方归档**没覆盖**的面（这是缺口，也是我方价值位）

* **`@` 会话引用列表完全不过滤归档**：`@` 的会话候选由宿主 `session-reference` 提供，实现是 `ctx.sessionQuery.listSessions()` **全量列举**，只做「排除自己 + 查询串匹配 + cwd 亲缘排序」，**全文没有读 `archivedSessionIds`**（`context/session-reference/src/index.ts:190-223`）；客户端只是把 remote 结果渲染成行（`ui-reference/src/client/index.ts:71-75`）。→ **被归档的会话照样出现在 `@` 里。**
* 其它走 `listSessions` 的面拿到的也是全量（`api/session-controller/src/list.ts:128` 的会话列表 API）；是否过滤取决于各自 UI —— 侧栏搜索**跟随** archived 筛选（`tree.ts:541-542`），`@` 不跟随。
* 结论：**官方归档是半套语义** —— 只管「侧栏藏 + 停模型步」，引用/提及等列表照旧。

**我方依赖面（都已核实未变，业务代码不用改）**：`webServer` / `sessions` / `agents` / `workspaceRegistry` / `sessionPersistence`（`list()` 形状逐字段一致、`locate()` 仍在）/ `sessionQuery` / `storageDomain` 服务名与形状未变；WorkspaceRegistry 私有写通道 `enqueueOperation` / `requireState` / `setState` 仍在（`packages/workspace/workspace/src/index.ts:874,879,884`）。

## 3) 改动清单

1. `src/compat.ts:21` `SUPPORTED_SESSION_FORMAT_VERSIONS = [0, 3]` → 加 `4`；并按 `docs/persistence-changes/2026-09-16-session-format-v4.zh.md` 复核读写面（移动/删除前逐 header 校验的做法保留）。
2. `src/client/ArchiveDock.tsx:7` 图标改名（`IconArchiveOutline20` → `IconArchiveOutlineRegular`、`IconCloseOutline16` → `IconCloseOutlineRegular`），保持原 `size` 观感；补产物级结构测试。
3. 依赖升线（见 `00-共同面与验收.md`）。
4. 退役自建「归档列表 + 恢复」面（范围见 §4 第 1 条）。
5. 入口改造（若继续保留面板）：可挂官方会话行 action 槽位（`sidebar.workspaces.session.menu.item` / `…row.action`，kind/scope 未变：`ui-workspace/src/client/contract/slots.ts:133,148`）。
   ⚠️ **官方已占 `archive` 这个 id** —— list 槽「同 id 同优先级占位即抛」（`ui-slots/src/index.ts:1229-1236`），我方**必须换 id** 或让位。
6. 自停用时 client half 也要停（共同面 §3 第 3 条）：避免「界面在、接口 404」。

## 4) 结论（owner 拍板）

> 待讨论，逐条记结论。

1. **退役到哪**：官方接走「归档查看 + 取消归档」后，我方保留集合建议为「**删除（整棵子会话树）/ 备份 / 回收站**」。是否同意？另外「移动进归档」这个动作用官方入口即可，我方是否**彻底不再提供**归档移动（避免两套语义）？
2. **入口放哪**：(a) 挂官方会话行 action（省事、跟随官方 UI 演进）vs (b) 保留现有 `sidebar.footer.action` 面板（一屏看全部归档会话 + 批量操作）。我倾向 (a) 做单会话动作 + (b) 保留为「回收站/批量」入口，但这会让插件有两处入口，需要你定。
3. **命名**：官方 `archive` = 归档会话；我方的「移动/删除」语义若继续叫「归档」，会与官方入口混淆 —— 是否把插件定位改名为「会话清理 / 回收站」类语义（影响 README、包名不改）。
4. **回收站与备份是否仍要**：官方完全没有；这两块是纯我方价值，但也意味着长期维护成本。保留 / 砍掉（砍掉即整插件退役，只留删除）。
5. **（新，来自 §2.2）要不要补官方这个缺口**：`@` 引用列表不认归档（源码已确证），其它 `listSessions` 消费面同理。两个选项 —— (a) **补缺**：让归档在全链路一致（至少 `@` 不再列出已归档会话）—— 需要包装/替换官方 `sessionReferenceResolver` 的候选，属于「包装公开 seam」这一档，要么走官方上游提 issue/PR； (b) **不碰官方引用面**，插件只做删除/回收站/备份。我倾向先 (b)，把 (a) 作为「官方归档一致性」单独提案（含上游 issue），避免我们替官方背引用面的维护。
6. **你观察到的「未分组承载」**：按代码归档不搬动会话（§2.1），若你实测确实看到已归档会话落在「未分组」下，请把当时 View options 的 **Group by / Filter sessions** 两档选择告诉我，我按同样路径复现确认（我这边隔离实例是空会话，没法走完归档动作）。

## 5) 验收口径 / 未核实项

* 真机验收：移动/删除整棵子会话树（含后代任意深度）、live 会话拒绝处理、回收站记账 sidecar、恢复后 header 版本一致。
* 未核实：alpha.2 `enqueueOperation` 新增的 `recoverPendingMutation()` 前置（`packages/workspace/workspace/src/index.ts:888`）与我方写序列是否冲突 —— 需要在 P0 真机阶段验一次。
