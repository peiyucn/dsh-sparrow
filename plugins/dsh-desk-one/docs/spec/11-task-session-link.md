# 11 · 已有任务补挂当前会话

> 状态：**已实现（2026-11-18）**。来源：任务板卡「Desk One 任务支持 agent 补挂会话」。host 半改动需重启 DSH 后在新会话生效；UI 关联 / 取消关联入口不变。

## 背景

`desk_task_add` 已支持 `link_current_session: true`，但只在新建任务时挂当前会话。已有任务目前只能由用户在任务卡 UI 里点「@」补挂，agent 没有对应工具参数。结果是 agent 能建带会话的任务，却无法把本会话补挂到一张已经存在的任务上。

## 决策

- **采用卡片的选项 1**：`desk_task_update` 增加 `link_current_session: true`，只挂**当前会话**（从工具上下文 `exec.agent.id` 解析）；不新增单独工具，不开放任意 `session_id` 入参。
- **上限沿用 `MAX_TASK_SESSIONS`（当前 10）**：代码、UI 选择器、存储 schema 与测试都用同一常量。任务卡里写的「最多 5 个」与现状不符，本切片不改成 5；改成 5 需要迁移已有 >5 会话的任务，另开任务处理。
- 补挂复用任务已有的 `sessionIds` 字段与 `normalizeSessionIds`（trim / 去重 / 上限校验）；重复补挂不产生重复 id。
- `expected_revision` 语义不变：先 `desk_task_list` 拿 revision，再带 revision 更新；补挂可以和其他 patch 同一次提交。
- UI 不新增入口：任务卡 chip 仍从 `task.sessionIds` 渲染，工具更新后由现有刷新 / 重新进入面板显示。

## 行为

- `link_current_session: true` 且当前会话已关联：提交的 `sessionIds` 仍是去重后的同一份，不重复追加；revision 仍按 `desk_task_update` 的正常语义更新。
- 已有任务达到 `MAX_TASK_SESSIONS` 且当前会话不在其中：明确报错「一张任务卡最多关联 N 个会话」，不静默截断。
- 没有工具会话上下文（`exec.agent` 缺失）：明确报错，不假装关联。
- 任务不存在：明确报错，不创建新任务。
- 不传 `link_current_session`：`desk_task_update` 的原有行为不变。

## 数据与边界

- 不新增存储字段、不改 `sessionIds` 的 schema、不改 UI 交互。
- 会话删除 / 归档后关联保留的既有规则不变。
- 不做任意会话补挂与 agent 侧取消关联（UI 的取消关联保持原样）；需要时另开切片。
- 不改变新会话任务捕获的触发规则（见 `10-task-capture.md`）。

## 涉及文件

- `src/host/tasks/tools.ts`：`desk_task_update` 参数 / 执行 / 摘要。
- `src/model.ts`：导出 `normalizeSessionIds` 供工具复用。
- `src/host/skill.ts`：agent 指南补充「已有任务补挂」。
- `status: spec 03 / 10 的工具与上限说明`。
- `test/host/tasks/tools.test.ts`：补挂、重复、缺上下文、缺任务、超上限、原有更新行为。

## 验收

- `desk_task_update` 传 `link_current_session: true` 后，已有任务 `sessionIds` 增加当前会话 id，返回的 task 带新数组。
- 重复补挂同一会话：数组不出现重复 id。
- 当前任务已有 `MAX_TASK_SESSIONS` 个会话时再补挂：明确报错，任务不落库。
- 缺少会话上下文时报错，不调用 store 更新。
- 不传新参数时，原有 `desk_task_update` 行为与测试不变。
- UI：不新增代码路径；任务刷新后 chip 仍按 `sessionIds` 显示（由现有 `TaskCard` / `withLinkedSessions` 测试覆盖）。

## 非目标

- 任意已知 `session_id` 的补挂 / 解绑工具。
- 调整任务卡上限为 5、或迁移既有 6–10 会话的任务。
- 改变任务捕获的「先问再做」规则。
