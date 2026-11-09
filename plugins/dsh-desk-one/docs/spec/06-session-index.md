# 06 · 会话索引（Session Index）— 统一对象的外键层

> 状态（2026-11-09）：索引节点、刷新逻辑、`desk_session_search` / `desk_session_get` 已实现；
> 任务卡 `sessionIds` → `link` 边的迁移尚未执行（见第 4 节，属于下一步）。

## 1. 定位

会话内容（transcript、事件流）的唯一真相仍是 DSH 会话存储。Desk One 不复制内容，只维护一份
**可搜索、可引用的索引节点**，相当于数据库外键：让 UI 和 agent 能按标题 / 工作区 / 状态找到会话，
再用官方能力读取内容。

## 2. 节点

```ts
interface DeskSessionIndex {
  id: 'session_<sessionId>'   // 确定性 id：索引重建后边不会断
  kind: 'session'
  schema: 1
  sessionId: string           // 唯一外键，指向真实 DSH 会话
  title: string               // 缓存标题（可过期）
  cwd?: string
  parentSessionId?: string
  subagent: boolean
  running: boolean
  availability: 'available' | 'archived' | 'missing'
  updatedAt: number           // 会话自身时间（ms），不是刷新时间
  indexedAt: string           // 最近一次索引刷新
  missingSince?: string       // 会话消失后的墓碑起点
  createdAt: string
  revision: number
}
```

不存消息、transcript、token 明细、完整投影。归档会话同样索引（`availability: 'archived'`），
因为任务卡的历史引用与“以前聊过”的检索都需要它。

## 3. 刷新与生命周期

- 触发：插件启动、`desk_session_search` / `desk_session_get` 调用（5 分钟 TTL）、后续路由可显式 force；
- 数据源：`sessionPersistence.list()` 的 header 事实 + 归档集 + live agent 状态；标题沿用归档树的三档
  （live 投影 → 冷投影缓存 → 有界折叠）；
- 消失：先写 `availability: 'missing'` + `missingSince`，保留 30 天给边/引用解析；超期且无引用才删；
- 刷新失败：记日志并让工具返回错误，不阻塞 UI；索引不是权威数据。

## 4. 任务卡会话引用（下一步迁移）

现状：`DeskTask.sessionIds: string[]` 是裸外键，UI 另拉客户端快照解析标题，AI 无法解析。

目标：统一为 `link` 边：

```ts
edge { type: 'link', from: 'task_<id>', to: 'session_<sessionId>', meta: { relation: 'task-session' } }
```

迁移步骤（先 spec 后代码）：
1. store 暴露边的读写/查询 API；
2. 打开存储时一次性迁移：`sessionIds` → `link` 边，然后把任务记录里的 `sessionIds` 清空；
3. 读取路径兼容：`listTasks` 从边回填派生 `sessionIds`，客户端无需同时改两套；
4. 写入路径（@ 选择器）改为加边/删边；迁移完成后删除兼容分支；
5. agent 通过边遍历任务 ↔ 会话。

## 5. Agent 工具

| 工具 | 行为 |
|---|---|
| `desk_session_search` | 按 `query`（标题 / cwd / sessionId）搜索，默认 20 条；包含归档；返回规范 sessionId 与状态 |
| `desk_session_get` | 按 sessionId 解析索引行；未索引时返回 `SESSION_NOT_INDEXED` |

拿到 sessionId 后，agent 使用现有会话读取能力看内容，不经过第二份副本。

## 6. 验收

- 索引节点与真实会话数量/状态一致（含归档）；
- 索引重建不改变节点 id（边不断）；
- 会话消失后 `missing` 墓碑保留，超期清理；
- `verify` 全绿；纯逻辑（id、记录、upsert 去重、missing 判定）有测试。
