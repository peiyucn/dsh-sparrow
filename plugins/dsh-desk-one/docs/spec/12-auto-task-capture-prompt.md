# 12 · 会话识别任务：常驻 system prompt + 已有任务补挂

> 状态：**已实现（2026-11-19），待 owner 真机验收。**目标版本：**0.2.2-rc.5**（与 rc5 适配、归档/五色板一起发；发布暂缓到 spec 与证据齐全）。
> 前置：`10-task-capture.md`（Phase 1：skill + 工具）、PR #9（`desk_task_update` 可给已有任务补挂当前会话）。

## 背景与问题

Phase 1 只有 desk-one skill + 工具，触发依赖模型是否加载 skill，不能保证「新会话第一次输入像任务时一定问一次」。Phase 2 原计划加常驻 system prompt，现按 owner 讨论结果落地：

- **常驻短 system prompt** 负责稳定触发；
- **先问后建**，不静默写任务；
- **先查本会话是否已挂任务**，避免重复；
- **已有任务但没挂会话**时，先问是否补挂到已有任务，不新建重复卡。

## 决策（owner 已确认）

| # | 决策 | 取值 |
| :-- | :--- | :--- |
| 1 | 触发层 | 常驻 system prompt section（不是 dynamic context，也不是仅 skill） |
| 2 | 触发后动作 | 先问后建 / 先问后补挂；绝不静默创建或改写关联 |
| 3 | 去重 | `desk_task_list` 增加「当前会话已关联」过滤 |
| 4 | 已有未挂任务 | 先问是否把本会话补挂到已有任务；同意后用 PR #9 的 `desk_task_update` + `link_current_session`，不新建卡 |
| 5 | 版本 | 并入 `0.2.2-rc.5`；发布继续暂缓到 spec / 证据齐全，且 owner 当次确认 |
| 6 | 上限 | 沿用 `MAX_TASK_SESSIONS`（当前 10）；不改成 5 |

## 触发规则

- 只看**面向用户的主会话的第一条用户输入**；后续轮次不再主动问。
- 不在 subagent 会话触发。
- 只认可跟踪事项：任务 / 待办 / 提醒 / 跟进 / 计划 / 截止日期 / 明确要记下来的事。
- 不因出现「任务」二字就触发；纯问答、解释、改代码 / 改文件、Desk One 用法提问不触发。
- 本会话已挂任务 → 不再问。
- 用户拒绝后本会话不再问。
- 用户明确要求建任务 / 补挂时，直接执行，不再问一遍。

## Prompt section

- 注册名：`desk-one:task-capture`（唯一；重复注册会失败）。
- 排序：`order: 9500`（外部贡献可用任意有限 order；位于 deliverable refs `9000` 之后、structured output `9900` 之前，不占用官方命名槽位）。
- 形态：静态文本，每个请求重复；不随会话变化，KV cache 稳定。
- 语言：模型侧英文（与官方 system prompt 一致；用户输入中文不影响触发）。
- 文本草案：

```text
Desk One task capture (first user input only):
Only when the first user input of a user-facing session clearly describes follow-up work (a task, todo, reminder, follow-up, plan, or deadline), ask once before writing.

Before asking:
- Do not trigger for pure Q&A, explanations, code/file edits, subagent sessions, or when this session is already linked to a task.
- Call desk_task_list with linked_to_current_session=true. If it returns a task, this session is already linked: do nothing.
- If this conversation already created a matching task that is not linked, or the user names an existing task, ask whether to link this session to that task. On consent call desk_task_update with link_current_session=true and the task's current revision; do not create a duplicate.
- If several existing tasks could match, ask the user which one; never guess.
- If no existing task matches, ask whether to create one. On consent call desk_task_add with link_current_session=true, status todo, a title taken from the user's own wording, and a one-sentence body.
Never create a task or change a link without the user's explicit consent. If the user declines, do not ask again in this session.
```

## 工具改动

### `desk_task_list`：当前会话过滤

新增可选参数 `linked_to_current_session: boolean`：

- `true`：只返回 `sessionIds` 包含当前会话 id 的任务；当前会话 id 从 `exec.agent.id` 解析。
- 没有 `exec.agent` 上下文时明确报错，不返回空列表假装「没挂」。
- 与 `status` / `query` / `group_id` / `include_archived` 按 AND 组合。
- 不传时行为不变。

### 已有任务补挂

复用 PR #9 的 `desk_task_update` + `link_current_session: true`；不新增工具、不开放任意 `session_id` 补挂；解绑见 15。

## 数据与边界

- 不新增存储字段；复用任务 `sessionIds`。
- 不自动改任务状态、截止日期、分组、颜色。
- 不跨会话自动扫描 / 自动匹配任务；跨会话任务只能由用户点名后补挂。
- 不静默创建任务、不静默改关联；读 `desk_task_list` 可以发生在询问之前。
- 不改变 `10-task-capture.md` 的 Phase 1 触发语义，只补常驻提示层与去重能力。
- system prompt 服务是可选的：宿主没有 `systemPrompt` 服务时退化为 skill-only，不影响插件启动。
- 需要为 desk-one 增加 `@deepseek-ai/dsh-system-prompt` 的 peer/devDependency（rc.4 版本线）。

## 涉及文件

- `plugins/dsh-desk-one/package.json`：`@deepseek-ai/dsh-system-prompt` peer/devDependency。
- `plugins/dsh-desk-one/src/host.ts` / `src/index.ts`：可选的 `ctx.inject(['systemPrompt'], ...)` 注册与清理。
- `plugins/dsh-desk-one/src/host/tasks/tools.ts`：`desk_task_list` 的 `linked_to_current_session`；复用 update 的 `link_current_session`（PR #9）。
- `plugins/dsh-desk-one/src/host/skill.ts`：补「已有任务未挂会话时先问补挂」的 agent 指南，与 prompt 不重复冲突。
- `plugins/dsh-desk-one/test/host/tasks/tools.test.ts`：过滤、缺上下文、组合查询、原行为不变。
- `plugins/dsh-desk-one/test/structure/...`：prompt section 注册与文本关键句的守卫。
- `plugins/dsh-desk-one/docs/spec/10-task-capture.md`：Phase 2 状态改为已决策并指向本文。
- `AGENTS.md`：只在实现后补一句 phase 2 已启用（如需要）。

## 验收

1. 新会话第一条输入「帮我记一下，周三要交报告」→ 只问一次；同意后建 `todo`，任务卡出现本会话 chip；无重复。
2. 同一会话后续轮次 → 不再主动问。
3. 「解释一下这个报错」「任务板怎么用？」→ 不问。
4. 本会话已挂任务 → 不问。
5. 本会话里已建过任务但未挂会话 → 问「补挂到已有任务」；同意后用 `desk_task_update` 补挂，不新建卡。
6. 存在多个候选任务 → 问用户选哪个，不猜。
7. 用户拒绝 → 本会话不再问。
8. subagent 会话 → 不问。
9. `desk_task_list` 无 `exec.agent` 上下文且传 `linked_to_current_session` → 明确报错。
10. 不传 `linked_to_current_session` 时 `desk_task_list` 行为不变；不传 `link_current_session` 时 `desk_task_update` 行为不变。
11. 宿主没有 `systemPrompt` 服务时插件正常启动，skill 仍可用。
12. 全仓 `npm run verify` 通过；结构守卫覆盖 prompt section 的名称/排序/关键规则。

**不满足即不算完成：** 任何路径静默建卡或静默改关联；对已挂会话重复问；对纯问答触发；缺 `exec.agent` 时假装查询成功。

## 非目标

- 静默自动建卡 / 自动挂会话。
- 自动补截止日期、状态、分组、颜色。
- 跨会话自动搜索并匹配已有任务。
- 任意 `session_id` 的补挂 / 解绑工具。
- 把任务上限从 10 改成 5（另开迁移任务）。
- UI 新入口；任务卡 chip 渲染沿用现有实现。

## 证据与发布

- 结构测试 + 工具单测；真实会话行为需要 owner 或 agent 在重启后的 DSH 中按验收 1–8 手工跑一遍，记录对话。
- prompt token 成本：以实际 system prompt 增量记录（当前估算 < 200 tokens/请求）；KV cache 不因该 section 每次变化而失效。
- 并入 rc5；`latest` + `next` 都发；发布前仍走 E17 owner 当次确认。
