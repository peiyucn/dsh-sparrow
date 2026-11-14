# 09 · 界面文案：同桌 ·「和 DSH 一起」

> 状态：**已定稿（2026-11-14）**。本表是这些界面文案的单一真值，实现同步在 `src/client/i18n/` 对应 key；交互与版式见 `08-coauthoring.md`。后续文案变更直接改本表并同步 i18n。
>
> 约束：空态 / 按钮的「预填」是半句指令，用户接着写（中文以「：」结尾，英文以 `: ` 结尾）；菜单的「隐藏预填」是完整请求句。两种情况都不自动发送；按钮 ≤ 8 个汉字；中英同义，英文用界面称谓 DSH。
>
> **菜单即短句（做好榜样）**：菜单行是一句**人话短句**（≤ 10 个汉字，通常不带「帮我」），像你会对助理说的一句话；点选后预填的是**更完整的请求**（隐藏后半段，含范围 / 输出 / 边界）。菜单行不是「理清便签」这类动作标题，隐藏预填也不能写「帮我整理一下」这类开放结果——用户会照着我们的句式说话。

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

## 2. 页头菜单（菜单行是短句，隐藏预填是完整请求）

> 位置：点品牌分段按钮右半的「和我说」后，按当前 tab 出现的菜单。点选某一项 = 把「隐藏预填」原样追加进输入框草稿（不发送）；**悬停或聚焦某一项时，tooltip 显示该行的隐藏预填全文**，让用户先看清会填入什么再点。

| tab · 项 | key（菜单 / 预填） | 菜单文字（中） | 菜单文字（英） | 隐藏预填（中） | 隐藏预填（英） |
|---|---|---|---|---|---|
| 便签 · 第 1 项 | `coauthor.menu.noteMerge` / `coauthor.prompt.noteMerge` | 合并重复的便签 | Merge duplicate notes | 帮我读一遍最近的便签，把重复或相近的说法合并成一条，保留最完整的内容；先给我看合并方案，不要直接改。 | Read my recent notes, merge the duplicate or near-duplicate wording into one note and keep the most complete version; show me the merge plan first, do not edit anything yet. |
| 便签 · 第 2 项 | `coauthor.menu.noteToTask` / `coauthor.prompt.noteToTask` | 把便签变成任务 | Turn notes into tasks | 帮我把最近的便签看一遍，把其中需要跟进的事变成任务放进任务板；先看任务板避免重复，不要改动便签本身。 | Go through my recent notes and turn the follow-ups into tasks on the board; check the board first to avoid duplicates and leave the notes untouched. |
| 任务 · 第 1 项 | `coauthor.menu.taskFromSchedule` / `coauthor.prompt.taskFromSchedule` | 把日程变成待办 | Turn schedule into tasks | 帮我看看今天的日程和任务板，把今天要做的事理出来，缺的补成任务；已经在任务板里的不要重复。 | Check today's schedule and the task board, lay out what I need to do today and add whatever is missing as tasks; do not duplicate what is already on the board. |
| 任务 · 第 2 项 | `coauthor.menu.taskArchiveDone` / `coauthor.prompt.taskArchiveDone` | 把已完成任务存档 | Archive finished tasks | 帮我把任务板「完成」列里已经做完的任务归档：先列出准备归档的清单让我确认，确认后再执行。 | Archive the finished tasks in the Done lane: list what you plan to archive first, and only archive after I confirm. |
| 批注 · 第 1 项 | `coauthor.menu.notebookHighlights` / `coauthor.prompt.notebookHighlights` | 整理最近批注 | Summarize recent annotations | 帮我梳理最近一次批注：先问我或按工作区找到那个文件，再用行号列出批注意见与修订建议；只给清单，先别改文件。 | Summarize the most recent annotations: ask me for the file or find it through the workspace, then list the annotation remarks and revision suggestions with line numbers; list only, do not edit files yet. |
| 批注 · 第 2 项 | `coauthor.menu.notebookFromNotes` / `coauthor.prompt.notebookFromNotes` | 按批注修订 | Revise from annotations | 帮我按最近一次批注逐条修订对应文件：保留没被批注的内容与原有格式，改完列出每处改动对应的批注。 | Revise the relevant file from the most recent annotations: keep everything that was not annotated and preserve the existing format; when done, list each change next to the annotation it resolves. |
| 日程 · 第 1 项 | `coauthor.menu.scheduleToday` / `coauthor.prompt.scheduleToday` | 看看今天有没有冲突 | Check today's conflicts | 帮我看看今天的日程，按时间列出每一件，标出时间冲突、连轴转和需要提前准备的事项；只给提醒，不要改动日程。 | Check my schedule for today, list each item by time, and flag conflicts, back-to-back stretches and anything I should prepare for; reminders only, do not change the schedule. |
| 日程 · 第 2 项 | `coauthor.menu.scheduleWeek` / `coauthor.prompt.scheduleWeek` | 看看这周哪天太满 | Check the heavy days | 帮我梳理本周剩下的日程，按天列出关键事项和时间空档，指出排得太满的日子；建议哪些任务可以放进空档，不要改动日历。 | Review the rest of this week's schedule, list each day's key items and free slots, point out overloaded days, and suggest which tasks could go into the free slots; do not change the calendar. |
| 会话 · 第 1 项 | `coauthor.menu.sessionsArchive` / `coauthor.prompt.sessionsArchive` | 看看哪些会话能归档了 | What can I archive? | 帮我读一下最近两周的会话，找出已经结束或讲同一件事的会话，按主题分组列出；每组给出哪些可以归档的建议和理由，只给建议，先不要动。 | Read my sessions from the last two weeks and find the ones that are finished or cover the same topic; group them by theme and recommend, with reasons, which can be archived — recommendations only, do not change anything yet. |
| 会话 · 第 2 项 | `coauthor.menu.sessionsReview` / `coauthor.prompt.sessionsReview` | 复盘这一周 | Review the week | 帮我读一下最近一周的会话，按主题归纳我做了哪些事、各自进程到哪一步、还有哪些悬而未决；只输出小结，不要动会话。 | Read my sessions from the last week and summarize what I worked on, how far each thread got, and what is still unresolved; output the summary only, do not change any session. |

## 3. 空状态

| 场景 | key | 中文 | 英文 |
|---|---|---|---|
| 便签墙空态 · 主提示 | `wall.tip` | 双击空白处新建便签 | Double-click empty space |
| 便签墙空态 · 副提示 | `wall.tipAlt` | 或点击顶栏「+便签」，也可以直接对我说 | or click "+ Note" in the top bar, or just tell me |
| 便签墙空态 · 按钮 | `wall.askDesk` | 「帮我记一条便签…」 | "Note this down: …" |
| 任务 · 进行中 / 完成 空列 | `task.emptyLane` | 暂无任务 | No tasks |
| 任务 · 待办空列 主提示 | `task.emptyTip` | 双击空白处新建任务 | Double-click empty space |
| 任务 · 待办空列 副提示 | `task.emptyTipAlt` | 或点击顶栏「+任务」，也可以直接对我说「帮我加一个任务…」 | or click "+ Task" in the top bar, or just tell me "add a task: …" |
| 批注空态说明 | `annotation.workspaceHint` | 批注对象是工作区里的文件。还没有工作区，先建一个（和官方「新建工作区」同一套流程）。 | Annotations live in workspace files. Create a workspace first (same flow as the official “New workspace”). |

## 4. 「…」菜单（许愿）

> 菜单最后一行永远是「许个愿」（以后有溢出 tab 时排在它们后面），行首用 **Desk One 自己的徽标字形**（「✦」，品牌蓝）区分；下方小字说明去 GitHub 提 issue。点选 = 预填下面的请求，不发送；由我先起草 issue 标题 / 正文，人确认后再发。

| 场景 | key | 中文 | 英文 |
|---|---|---|---|
| 许愿行 | `tabs.wish` | 许个愿 | Make a wish |
| 行下小字 | `tabs.wishHint` | 去 GitHub 提 feature issue，我帮你整理 | File a feature issue on GitHub; I will draft it |
| 隐藏预填 | `coauthor.prompt.wish` | 我想给同桌增加一个功能：XXXXX（替换成你的想法）<br><br>帮我把它整理成一条 GitHub feature issue（仓库 https://github.com/peiyucn/dsh-sparrow）：先给我看标题和正文草稿，不要自动发布，也不要包含我的私人内容。 | I want to add a feature to Desk One: XXXXX (replace with your idea)<br><br>Turn it into a GitHub feature issue for https://github.com/peiyucn/dsh-sparrow: show me the title and body first, do not publish automatically, and do not include my private content. |
