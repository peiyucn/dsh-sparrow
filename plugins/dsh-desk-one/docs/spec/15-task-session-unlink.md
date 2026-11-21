# 15 · 任务会话解绑（desk_task_update）

> 状态：已实现（2026-11-20）。来源：owner 反馈「工具不能解绑？这个能力得加上吧！」。目标版本：**0.2.2-rc.5**（发布暂缓）。

## 背景

`11-task-session-link.md` 只做了 `link_current_session`，agent 无法清理挂错 / 已不可用的会话 chip；UI 可以点 ×，但 agent 侧没有参数。需要让 agent 也能在不重建任务、不改存储的情况下解绑。

## 决策

- 不新增工具，扩展 `desk_task_update`：
  - `unlink_session_ids?: string[]`：按已知 id 解绑（id 从 `desk_task_list` 的 `sessionIds` 读）。
  - `unlink_current_session?: boolean`：解绑当前工具会话（`exec.agent.id`）。
- 只做解绑；任意 session id 的**补挂**仍非目标（补挂只挂当前会话，见 11）。
- `expected_revision` 语义不变；一次 update 可以同时解绑并 `link_current_session`，用于替换。
- 不改存储 schema、不改 UI；UI 的 × 入口保持。

## 行为

- `unlink_session_ids` trim / 去重后移除全部列出的 id；空数组 / 非字符串数组明确报错；任一 id 未关联 -> 整体报错，不部分删除。
- `unlink_current_session` 要求 `exec.agent`；当前会话未关联 -> 明确报错。
- `link_current_session` 与 `unlink_current_session` 同时传 -> 明确报错。
- `link_current_session` + `unlink_session_ids` 可同次；若 unlink 列表包含当前会话 -> 报错，避免同一 id 既删又加。
- 不传任何会话参数 -> 原有 `desk_task_update` 行为不变；解绑后 `sessionIds` 可为空。
- 摘要与更新摘要合并：`已解绑本会话` / `已解绑 N 个会话`。

## 数据与边界

- 复用 `sessionIds`，不新增字段；`MAX_TASK_SESSIONS` 不变。
- 只删关联，不删会话、不改任务其他字段；解绑不影响任务历史与任务卡其余内容。
- 会话删除 / 归档不会自动解绑；运行时不可用的 chip 需要显式传 id 或走 UI ×。
- 不做通用 `session_ids` 覆盖参数，避免 agent 无意识地整体替换。

## 涉及文件

- `src/host/tasks/tools.ts`：参数 / 执行 / 摘要。
- `src/host/skill.ts`：agent 指南补充解绑。
- `test/host/tasks/tools.test.ts`：解绑正常 / 错误路径。
- spec 02 / 03 / 11、CHANGELOG 中英。
- `test/structure/docs.test.ts`：REQUIRED_SPECS 加入本文件。

## 验收

1. `unlink_session_ids` 移除指定 id，保留其他 id。
2. `unlink_current_session` 移除当前会话。
3. 指定 id 未关联 / 空数组 / 缺 agent 上下文 / 同时 link + unlink current -> 明确报错，不落库。
4. `unlink_session_ids` + `link_current_session` 可一次替换。
5. 不传会话参数 -> 原有 update 行为不变。
6. UI 仍可用 × 解绑；agent 工具与 UI 读写同一 `sessionIds`。

## 非目标

- 任意已知 session id 的补挂。
- 通用 `session_ids` 覆盖参数。
- 自动清理会话删除 / 归档后的关联。
- 调整 `MAX_TASK_SESSIONS`。
