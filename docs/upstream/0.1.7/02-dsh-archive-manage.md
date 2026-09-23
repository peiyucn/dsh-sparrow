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

## 5) 验收口径 / 未核实项

* 真机验收：移动/删除整棵子会话树（含后代任意深度）、live 会话拒绝处理、回收站记账 sidecar、恢复后 header 版本一致。
* 未核实：alpha.2 `enqueueOperation` 新增的 `recoverPendingMutation()` 前置（`packages/workspace/workspace/src/index.ts:888`）与我方写序列是否冲突 —— 需要在 P0 真机阶段验一次。
