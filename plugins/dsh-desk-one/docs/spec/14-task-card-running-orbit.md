# 14 · 任务卡整体 running orbit（任一会话运行）

> 状态：**已实现（2026-11-19），待 owner 真机验收。**目标版本：**0.2.2-rc.5**（发布暂缓）。
> 来源：owner 新要求。与 13（任务卡折叠）同属任务卡视觉层，不改任务数据。

## 决策（owner 已确认）

| # | 决策 | 取值 |
| :-- | :--- | :--- |
| 1 | 触发条件 | 任务卡关联的会话里**至少一个** `availability === 'available' && running === true` |
| 2 | 运行色 | **跟任务卡五色 accent**（default / yellow / green / blue / pink），不用统一 success green |
| 3 | 生效范围 | 展开态 + compact 态 + 归档视图条目 |
| 4 | 数量 | 多个 running 会话也只画一圈，不叠加 |
| 5 | 动效 | conic-gradient orbit 旋转；`prefers-reduced-motion` 下停转为静态环 |
| 6 | 数据 | 纯客户端派生；不写任务记录、不写 localStorage、不发请求 |

## 派生

- 看板：`TaskColumn` 已有 `sessionChips={sessionsFor(task.sessionIds)}`；在 `TaskCard` 内派生：
  `const running = sessionChips.some(chip => chip.availability === 'available' && chip.running)`。
- 归档视图：`TaskArchiveView` 目前只收到 tasks/groups，没有会话数据；由 `TaskBoard` 计算
  `runningTaskIds = new Set(tasks.filter(hasRunningSession).map(id))` 传入，归档行按 id 取 running。
- 会话服务缺失、session 未解析、`availability !== 'available'`、`running` 缺失都按 false 处理；不报错。
- 只有「已关联且可用的会话」参与判定；已归档 / 不可用会话不触发。

## 视觉

- 客户端给 `.dsh-task-card` / `.dsh-task-archive-row` 加 `data-running="true"`；`data-color` 已存在。
- 每色映射一个 ring 变量：

```css
.dsh-task-card[data-color='default'] { --dsh-task-running-accent: var(--dsh-desk-color-default-accent); }
.dsh-task-card[data-color='yellow']  { --dsh-task-running-accent: var(--dsh-desk-color-yellow-accent); }
.dsh-task-card[data-color='green']   { --dsh-task-running-accent: var(--dsh-desk-color-green-accent); }
.dsh-task-card[data-color='blue']    { --dsh-task-running-accent: var(--dsh-desk-color-blue-accent); }
.dsh-task-card[data-color='pink']    { --dsh-task-running-accent: var(--dsh-desk-color-pink-accent); }
```

- 有效环色：`color-mix(in srgb, var(--dsh-task-running-accent) 78%, var(--dsw-alias-label-primary, currentColor))`，借官方 label token 让浅色主题略微压暗、深色主题略微提亮；不硬编码绿/蓝。
- 环用 `::after`（或等价独立伪元素）绘制：`inset: -1px`、`border-radius: inherit`、`padding: 1px`、`conic-gradient` + `mask: ... exclude`，不旋转元素本身；`pointer-events: none`，内容仍在环上层。
- 不修改 `.dsh-task-card` 的 `border-left`（五色条）与 `data-due-soon` / `data-overdue` 的边框；ring 只叠加在卡片外沿。
- compact 态复用同一 ring（13 的 compact 只改内容布局，不动 ring）。
- 归档行用同一色/动画，但环贴合行圆角；颜色点、标题、操作不遮挡。
- `@property --dsh-task-card-orbit-angle` + keyframes；周期约 3s，线性无限。
- `@media (prefers-reduced-motion: reduce)`：`animation: none`，保留 `color-mix(... 55% ...)` 的静态环；不只靠动画区分状态。

## 行为与边界

- 会话 running → idle 时环立即消失（session snapshot 驱动）。
- 卡片被拖拽时环继续/不闪烁；`data-dragging` 仍只降低透明度。
- 整卡折叠（13）与描述折叠不影响 running 判定；compact 仍能看到环。
- 无会话服务时卡片照常可用，不显示环、不报错。
- 不把 ring 做成可点击入口；不改变会话 chip 的现有动画。
- 性能：动画只改 CSS 自定义属性角度；不触发布局；一张卡最多一个 ring 伪元素。

## 涉及文件

- `src/client/tasks/components/TaskCard.tsx`：`running` 派生 + `data-running`。
- `src/client/tasks/components/TaskColumn.tsx` / `TaskBoard.tsx`：把 running 派生结果传给归档视图（看板已有 sessionChips）。
- `src/client/tasks/components/TaskArchiveView.tsx`：归档行 `data-running` + 传入的 runningTaskIds。
- `src/client/tasks/styles/card.ts` + `styles/archive.ts`：ring 变量、伪元素、reduced-motion、compact 适配。
- `src/client/tasks/taskCardUtils.ts` 或现有 session 工具：纯函数 `hasRunningSession(chips)`，便于测试。
- `test/client/task-card-running.test.ts`：available+running、idle、archived、unavailable、缺服务、空列表。
- `test/structure/feature-tasks.test.ts`：结构守卫（data-running / 动画 / reduced-motion 存在）。

## 验收

1. 一张卡挂 2 个会话，其中 1 个 running → 整卡出现与卡片颜色一致的 orbit；两个都 running 仍只有一圈。
2. 会话全部 idle → 无 orbit；会话列表服务缺失 → 无 orbit、卡片可用。
3. 已归档 / 不可用的关联会话不算 running。
4. 黄/绿/蓝/粉/default 五种卡各显示对应色环；浅色与深色主题下均可辨认。
5. compact 卡同样有环；展开/收起整卡不改变环状态。
6. 归档视图对应行有同一 ring；恢复/删除行为不变。
7. `prefers-reduced-motion: reduce` 下环不转，静态可见。
8. 拖拽、编辑、点操作不因环受影响；环不拦截点击。
9. 左边五色条、截止/逾期边框不变；环叠加不覆盖文字。
10. `npm run verify` 全绿；中英文无需新增文案（如需 tooltip 再补）。

## 非目标

- 每个 running 会话各画一圈。
- 用 ring 表示 idle / archived / unavailable。
- 把 running 状态写入任务记录或 localStorage。
- 改变现有会话 chip 的 running 动效。
- 归档视图改成完整任务卡（保持现有行形态）。

## 证据与版本

- 单测覆盖 running 派生纯函数；结构守卫覆盖视觉入口。
- 浅色 / 深色各截「running 卡」「idle 卡」「compact running」「归档 running」对比图；reduced-motion 手测记录。
- 并入 rc5；发布 `latest` + `next`，发布暂缓到所有 spec / 证据齐全并经 owner 当次确认。
