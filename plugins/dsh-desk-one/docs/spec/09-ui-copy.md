# 09 · 界面文案：同桌 ·「和 DSH 一起」

> 状态：**已定稿（2026-11-14）**。本表是这些界面文案的单一真值，实现同步在 `src/client/i18n/` 对应 key；交互与版式见 `08-coauthoring.md`。后续文案变更直接改本表并同步 i18n。
>
> 约束：预填提示是「半句指令」，用户接着写——中文以「：」结尾，英文以 `: ` 结尾，不自动发送；按钮 ≤ 8 个汉字；中英同义，英文用界面称谓 DSH。
>
> **菜单即句子（做好榜样）**：logo 菜单里每一行本身就是一句可以直接发出去的话（第一人称「帮我…」、写明对象与期望结果），不是「理清便签」这种动作标题；点选后把这句**原样**预填进输入框，没有隐藏的后半段。用户会照着我们的句式说话，提示词本身就是教学。

## 1. 页头与 info 浮层

| 场景 | key | 中文 | 英文 |
|---|---|---|---|
| 品牌分段按钮右半（所有 tab 常驻，左半是「✦」同桌徽标） | `coauthor.entry` | 和我说 | Talk to Me |
| 页头副标题 | `page.subtitle` | 与 harness 共用的一张办公桌 | One desk for you and harness |
| info 按钮的无障碍名 | `page.introLabel` | 关于同桌 | About Desk One |
| info 浮层首段 | `page.introDetail` | 碳硅同席：两种生命，一张桌子。你出灵感，harness 出力；便签、任务、会话与日程，一起完成。 | Carbon and silicon, one desk. You bring the spark, harness does the work; notes, tasks, sessions and schedule, done together. |
| info 浮层「两种用法」 | `coauthor.introUsage` | 自己操作，或者直接对我说。 | Do it yourself, or just tell me. |
| info 示例 ① | `coauthor.example.note` | 「帮我记一条便签：…」 | "Note this down: …" |
| info 示例 ② | `coauthor.example.task` | 「帮我加一个任务：…」 | "Add a task: …" |
| info 示例 ③ | `coauthor.example.plan` | 「把今天的日程整理成任务。」 | "Turn today's schedule into tasks." |

## 2. 页头菜单（每行就是一句可直接发送的话）

> 位置：点品牌分段按钮右半的「和我说」后，按当前 tab 出现的菜单。点选某一项 = 把这句原样追加进输入框草稿（不发送）。

| tab · 项 | key | 句子（中） | 句子（英） |
|---|---|---|---|
| 便签 · 第 1 项 | `coauthor.prompt.noteClarify` | 帮我把便签里重复的说法合并 | Merge the duplicate wording in my notes |
| 便签 · 第 2 项 | `coauthor.prompt.noteCleanup` | 帮我挑出已经没用的便签 | Pick out the notes I no longer need |
| 任务 · 第 1 项 | `coauthor.prompt.taskFromSchedule` | 帮我把今天的日程变成待办 | Turn today's schedule into tasks |
| 任务 · 第 2 项 | `coauthor.prompt.taskFromNotes` | 帮我把便签里的事收成待办 | Collect the tasks buried in my notes |
| 笔记 · 第 1 项 | `coauthor.prompt.notebookAudit` | 帮我列出笔记库里缺元数据的页 | List the notebook pages missing metadata |
| 笔记 · 第 2 项 | `coauthor.prompt.notebookFromNotes` | 帮我把值得留的便签写成笔记 | Turn my keeper notes into a notebook page |
| 日程 · 第 1 项 | `coauthor.prompt.scheduleToday` | 帮我看看今天有没有时间冲突 | Flag any time conflicts in today's schedule |
| 日程 · 第 2 项 | `coauthor.prompt.scheduleWeek` | 帮我看看这周哪天排得太满 | Show me which days this week are overloaded |
| 会话 · 第 1 项 | `coauthor.prompt.sessionsDuplicates` | 帮我找出最近的重复会话 | Find my duplicate sessions from recent weeks |
| 会话 · 第 2 项 | `coauthor.prompt.sessionsReview` | 帮我复盘这一周做了哪些事 | Summarize what I did this week |

## 3. 空状态

| 场景 | key | 中文 | 英文 |
|---|---|---|---|
| 便签墙空态 · 主提示 | `wall.tip` | 双击空白处新建便签 | Double-click empty space |
| 便签墙空态 · 副提示 | `wall.tipAlt` | 或点击顶栏「+便签」，也可以直接对我说 | or click "+ Note" in the top bar, or just tell me |
| 便签墙空态 · 按钮 | `wall.askDesk` | 「帮我记一条便签…」 | "Note this down: …" |
| 任务 · 进行中 / 完成 空列 | `task.emptyLane` | 暂无任务 | No tasks |
| 任务 · 待办空列 主提示 | `task.emptyTip` | 双击空白处新建任务 | Double-click empty space |
| 任务 · 待办空列 副提示 | `task.emptyTipAlt` | 或点击顶栏「+任务」，也可以直接对我说「帮我加一个任务…」 | or click "+ Task" in the top bar, or just tell me "add a task: …" |
| 笔记库未链接说明 | `notebook.welcomeBody` | 笔记库 = DSH 工作区，你审阅批注，其余的交给 harness。也可以直接对我说「帮我新建一篇笔记…」。 | The library = a DSH workspace: you review and annotate, harness handles the rest. You can also just tell me "start a new note…". |
