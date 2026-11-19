# 10 · 新会话任务捕获

> 状态：**Phase 1 + Phase 2 已实现（2026-11-19）——skill + 工具 + 常驻 system prompt。** host 半改动需要重启 DSH 后生效；真实新会话验收待重启后补。Phase 2 的完整规则见 `12-auto-task-capture-prompt.md`。

## 背景

Desk One 的任务板已经能挂会话（任务卡显示会话 chip，可跳回会话），但用户要自己想起来去建任务。目标是在**新会话第一次输入**看起来是“要跟踪的一件事”时，主动问一次是否建待办并挂上本会话，把“随手聊的事”接到任务板。

Phase 1 不加常驻提示词，`desk-one` skill 只在被模型加载时生效。Phase 2 已加常驻 system prompt 作为稳定触发层，skill 保留为详细操作指南。

## 触发规则

- 只看新会话的**第一次用户输入**；不在后续轮次反复触发。
- 只在面向用户的主会话问，**不在 subagent 会话**问。
- 只认“可跟踪事项”：任务 / 待办 / 提醒 / 跟进 / 计划 / 截止日期 / 明确要记下来的事。
- 不因出现「任务」二字就触发；纯问答、解释、改代码 / 改文件、Desk One 自身用法提问、本会话已有任务关联，都不问。
- 用户拒绝后本会话不再问；**先问再做**，不先建任务再补问。

## 交互

1. 助手用一句话提议：「要不要在任务板建个「XXX」待办，并把本会话挂上？」
2. 用户同意 → 调用 `desk_task_add`：
   - 标题：从用户原话提炼；用户改名用新名。
   - 状态：默认 `todo`。
   - body：只写一句来源 / 目标，不复述整段对话。
   - `link_current_session: true`：工具从 `exec.agent.id` 取当前会话 id 写入 `sessionIds`，模型不需要猜 id。
3. 用户拒绝或没回应 → 不建任务，本会话不再提。
4. 用户明确要求建任务 → 直接建，不再问一遍。

## 实现分工（Phase 1 + Phase 2）

| 层 | 职责 |
|---|---|
| `src/host/skill.ts` | `desk-one` skill 里的“新会话任务捕获”小节：触发边界（首轮 / 可跟踪事项 / 拒绝后不再问 / 纯问答不问）+ 同意后的建卡流程、标题 / 状态 / body 规则 |
| `src/host/tasks/tools.ts` | `desk_task_add` 新增 `link_current_session`；从工具上下文的 agent id 取当前会话 |
| `src/host/prompt.ts` | Phase 2 常驻 system prompt：首轮触发、先查本会话、已有未挂任务先问补挂、不静默建卡 |
| `src/host/tasks/tools.ts` | `desk_task_list` 新增 `linked_to_current_session`；补挂复用 `desk_task_update.link_current_session` |

**Phase 2（已实现，spec 12）**：owner 已确认常驻 system prompt 作为触发层；触发边界、先问后建、已有任务补挂与去重见 `12-auto-task-capture-prompt.md`。待重启 DSH 做真机验收。

## 数据与边界

- 不新增存储字段；复用任务已有的 `sessionIds`。
- 会话关联仍受单任务最多 `MAX_TASK_SESSIONS`（当前 10）的约束；已有任务的补挂见 `11-task-session-link.md`。
- 任务状态不会随会话 running / idle 自动变化；会话 chip 只是关联与跳转。
- 不做跨会话记忆；每个新会话独立判断一次。
- Phase 2 已加常驻提示词；skill 仍保留为详细操作指南，两者规则一致。

## 验收

- 新会话第一次输入「帮我记一下，周三要交报告」→ 只问一次；同意后建 `todo`，任务卡出现本会话 chip。
- 新会话第一次输入「解释一下这个报错」→ 不问。
- 第一次输入「任务板怎么用？」→ 不问。
- 用户拒绝后，本会话后续不再问。
- `desk_task_add` 不传 `link_current_session` 时行为不变；传了但无 agent 上下文时明确报错，不假装关联。
- host 半不注册常驻 system prompt（Phase 1 边界）。

## 非目标

- 不做“会话每轮自动更新任务状态 / 进度”。
- 不自动建任务、不自动补截止日期、不自动分组。
- 不做跨会话去重（是否已有同主题任务由用户判断）。
