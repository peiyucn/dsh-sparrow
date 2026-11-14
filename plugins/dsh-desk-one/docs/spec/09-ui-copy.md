# 09 · 界面文案：同桌 ·「和 DSH 一起」

> 状态：**已定稿（2026-11-14）**。本表是这些界面文案的单一真值，实现同步在 `src/client/i18n/` 对应 key；交互与版式见 `08-coauthoring.md`。后续文案变更直接改本表并同步 i18n。
>
> 约束：预填提示是「半句指令」，用户接着写——中文以「：」结尾，英文以 `: ` 结尾，不自动发送；菜单项 ≤ 8 个汉字（英文 ≤ 4 个词），按钮 ≤ 8 个汉字；中英同义，英文用界面称谓 DSH。

## 1. 页头与 info 浮层

| 场景 | key | 中文 | 英文 |
|---|---|---|---|
| 品牌分段按钮右半（所有 tab 常驻，左半是「✦」同桌徽标） | `coauthor.entry`        | 和我说                                              | Talk to Me                                                                                                                    |
| 页头副标题 | `page.subtitle` | 与 harness 共用的一张办公桌 | One desk for you and harness |
| info 按钮的无障碍名 | `page.introLabel` | 关于同桌 | About Desk One |
| info 浮层首段 | `page.introDetail` | 碳硅同席：两种生命，一张桌子。你出灵感，harness 出力；便签、任务、会话与日程，一起完成。 | Carbon and silicon, one desk. You bring the spark, harness does the work; notes, tasks, sessions and schedule, done together. |
| info 浮层「两种用法」 | `coauthor.introUsage` | 自己操作，或者直接对我说。 | Do it yourself, or just tell me. |
| info 示例 ① | `coauthor.example.note` | 「帮我记一条便签：…」 | "Note this down: …" |
| info 示例 ② | `coauthor.example.task` | 「帮我加一个任务：…」 | "Add a task: …" |
| info 示例 ③ | `coauthor.example.plan` | 「把今天的日程整理成任务。」 | "Turn today's schedule into tasks." |

## 2. 页头菜单与预填提示

> 位置：点品牌分段按钮右半的「和我说」后，按当前 tab 出现的菜单；选中某一项即把「预填」列的文字追加进输入框草稿，不发送。

| tab · 项 | 菜单 key / 预填 key | 菜单文字（中） | 菜单文字（英） | 预填文案（中） | 预填文案（英） |
|---|---|---|---|---|---|
| 便签 · 第 1 项 | `coauthor.menu.noteAdd` / `coauthor.prompt.noteAdd` | 记一条便签 | Note something down | 帮我记一条便签： | Note this down: |
| 便签 · 第 2 项 | `coauthor.menu.noteTidy` / `coauthor.prompt.noteTidy` | 整理最近的便签 | Tidy recent notes | 帮我整理一下最近的便签，看看哪些值得保留。 | Tidy up my recent notes and tell me which ones are worth keeping. |
| 任务 · 第 1 项 | `coauthor.menu.taskFromSchedule` / `coauthor.prompt.taskFromSchedule` | 日程变任务 | Turn schedule into tasks | 帮我看看今天的日程，把需要行动的事项整理成任务放进任务板；先查一下任务板，已有的不要重复创建。 | Check my schedule for today and turn the actionable items into tasks on the board; check the board first so no task is created twice. |
| 任务 · 第 2 项 | `coauthor.menu.taskFromNotes` / `coauthor.prompt.taskFromNotes` | 便签变任务 | Turn notes into tasks | 帮我看看最近一周的便签，把需要跟进的事项整理成任务放进任务板；先查一下任务板，已有的不要重复创建。 | Look at my notes from the last week and turn the actionable ones into tasks on the board; check the board first so no task is created twice. |
| 笔记 · 第 1 项 | `coauthor.menu.notebookNew` / `coauthor.prompt.notebookNew` | 新建一篇笔记 | Start a note | 帮我新建一篇笔记： | Start a new note: |
| 笔记 · 第 2 项 | `coauthor.menu.notebookBrowse` / `coauthor.prompt.notebookBrowse` | 看看笔记库 | Browse the notebook | 帮我看看笔记库里最近的内容。 | Show me what is recent in my notebook library. |
| 日程 · 第 1 项 | `coauthor.menu.scheduleToday` / `coauthor.prompt.scheduleToday` | 看看今天的安排 | Check today's schedule | 帮我看看今天的日程安排，有哪些需要注意的。 | Check my schedule for today and tell me what needs attention. |
| 日程 · 第 2 项 | `coauthor.menu.scheduleUpcoming` / `coauthor.prompt.scheduleUpcoming` | 梳理近期日程 | Review upcoming events | 帮我梳理一下近期的日程。 | Review my upcoming schedule. |
| 会话 · 第 1 项 | `coauthor.menu.sessionsTidy` / `coauthor.prompt.sessionsTidy` | 整理最近的会话 | Tidy recent sessions | 帮我整理一下最近的会话，看看哪些可以归档。 | Tidy my recent sessions and tell me which ones can be archived. |

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
