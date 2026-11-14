# 09 · 界面文案：同桌 ·「和 DSH 一起」（评审稿）

> 状态：**评审中（2026-11-14）**。owner 在每张表的「反馈」列填写意见（写「改成…」「删掉」「太生硬」都可以，留空表示保持）。
> **定稿方式**：讨论结束后，agent 删除本状态说明、「反馈」列和「待定项」小节，只保留三张终稿文案表；终稿表是这些界面文案的单一真值，实现以终稿为准同步到 i18n。
> 范围：本版「和 DSH 一起」联动入口（见 `08-coauthoring.md`）涉及的页头、菜单、预填提示、空状态与 info 浮层，含被触及的原有文案。

## 0. 约束

- 预填提示是「半句指令」，用户接着写：中文以「：」结尾，英文以 `: ` 结尾；不自动发送。
- 菜单项尽量 ≤ 8 个汉字（英文 ≤ 4 个词），按钮 ≤ 8 个汉字；同层级保持同一语气（动词开头，不写「请」）。
- 中英同义；英文用界面当前称谓 DSH，不写 Desk One 以外的产品名。
- `key` 列是 `src/client/i18n/` 里的键，便于定稿后逐条替换。

## 1. 页头与 info 浮层

| 场景 | key | 现在中文 | 现在英文 | 反馈 |
|---|---|---|---|---|
| 页头入口按钮（所有 tab 常驻）    | `coauthor.entry`        | 和 DSH 说                                           | Talk to DSH                                                                                                                        | 能否和logo结合一下，logo本身就是一个按钮，[「✦」同桌\|和我说 ]，按钮前半部分不变，后半部分是白线框，不填充背景，就是反色一下。 |
| 页头副标题（原有） | `page.subtitle` | 与 harness 共用的一张办公桌 | One desk for you and harness | |
| info 按钮的无障碍名 | `page.introLabel` | 关于同桌 | About Desk One | |
| info 浮层首段（原有 slogan） | `page.introDetail`      | 碳硅同席：两种生命，一张桌子。你出灵感，harness 出算力；便签、任务、会话与日程，一起完成。 | Carbon and silicon, one desk. You bring the spark, harness brings the compute; notes, tasks, sessions and schedule, done together. | 算力是用户出的……哈哈，得优化一下用词。                                                   |
| info 浮层「两种用法」        | `coauthor.introUsage`   | 两种用法：自己点，或者直接对我说。                                 | Two ways: click it yourself, or just tell me.                                                                                      | 自己操作，或者直接对我说。                                                          |
| info 示例 ① | `coauthor.example.note` | 「帮我记一条便签：…」 | "Note this down: …" | |
| info 示例 ② | `coauthor.example.task` | 「帮我加一个任务：…」 | "Add a task: …" | |
| info 示例 ③ | `coauthor.example.plan` | 「整理一下我今天的安排。」 | "Sort out my plan for today." | |

## 2. 页头菜单与预填提示

> 位置：点页头「和 DSH 说」后按当前 tab 出现的菜单；选中某一项即把「预填」列的文字追加进输入框草稿，不发送。

| tab · 项 | 菜单 key / 预填 key | 菜单文字（中） | 菜单文字（英） | 预填文案（中） | 预填文案（英） | 反馈 |
|---|---|---|---|---|---|---|
| 便签 · 第 1 项 | `coauthor.menu.noteAdd` / `coauthor.prompt.noteAdd` | 记一条便签 | Note something down | 帮我记一条便签： | Note this down: | |
| 便签 · 第 2 项 | `coauthor.menu.noteTidy` / `coauthor.prompt.noteTidy` | 整理最近的便签 | Tidy recent notes | 帮我整理一下最近的便签，看看哪些值得保留。 | Tidy up my recent notes and tell me which ones are worth keeping. | |
| 任务 · 第 1 项 | `coauthor.menu.taskAdd` / `coauthor.prompt.taskAdd` | 加一个任务 | Add a task | 帮我加一个任务： | Add a task: | |
| 任务 · 第 2 项 | `coauthor.menu.taskPlan` / `coauthor.prompt.taskPlan` | 把今天的安排整理成任务 | Turn today's plan into tasks | 帮我把今天的安排整理成任务，放进任务板。 | Turn my plan for today into tasks on the board. | |
| 笔记 · 第 1 项 | `coauthor.menu.notebookNew` / `coauthor.prompt.notebookNew` | 新建一篇笔记 | Start a note | 帮我新建一篇笔记： | Start a new note: | |
| 笔记 · 第 2 项 | `coauthor.menu.notebookBrowse` / `coauthor.prompt.notebookBrowse` | 看看笔记库 | Browse the notebook | 帮我看看笔记库里最近的内容。 | Show me what is recent in my notebook library. | |
| 日程 · 第 1 项 | `coauthor.menu.scheduleToday` / `coauthor.prompt.scheduleToday` | 看看今天的安排 | Check today's schedule | 帮我看看今天的日程安排，有哪些需要注意的。 | Check my schedule for today and tell me what needs attention. | |
| 日程 · 第 2 项 | `coauthor.menu.scheduleUpcoming` / `coauthor.prompt.scheduleUpcoming` | 梳理近期日程 | Review upcoming events | 帮我梳理一下近期的日程。 | Review my upcoming schedule. | |
| 会话 · 第 1 项 | `coauthor.menu.sessionsTidy` / `coauthor.prompt.sessionsTidy` | 整理最近的会话 | Tidy recent sessions | 帮我整理一下最近的会话，看看哪些可以归档。 | Tidy my recent sessions and tell me which ones can be archived. | |

## 3. 空状态

| 场景 | key | 现在中文 | 现在英文 | 反馈 |
|---|---|---|---|---|
| 便签墙空态 · 主提示（原有） | `wall.tip` | 双击空白处新建便签 | Double-click empty space | |
| 便签墙空态 · 副提示（本次改）         | `wall.tipAlt`          | 或点顶栏的 + 号；也可以直接对我说                                   | or click + in the top bar; or just tell DSH                                                                                  | 或点击顶栏「+便签」，也可以直接对我说 |
| 便签墙空态 · 按钮（本次新增）         | `wall.askDesk`         | 让 DSH 记一条                                            | Let DSH note it                                                                                                              |    |
| 任务空泳道 · 文字（原有） | `task.emptyLane` | 暂无任务 | No tasks | |
| 任务空板 · 按钮（本次新增，仅整板为空时出现） | `task.askDesk` | 让 DSH 建任务 | Let DSH add a task | |
| 笔记库未链接说明（尾部为本次新增句） | `notebook.welcomeBody` | 笔记库就是一个 DSH 工作区目录：AI 在里面写，你在这里审。也可以直接对我说「帮我新建一篇笔记…」。 | The library is a DSH workspace folder: the AI writes there, you review here. You can also just tell DSH "start a new note…". | |

## 4. 待定项（版式，非文案）

文案定稿时一起拍板；定稿后本节删除。

| 编号 | 事项 | 选项 | 当前倾向 | 反馈 |
|---|---|---|---|---|
| P1 | info 小标位置 | A 身份左、工具右｜B info 贴标题、入口靠右｜C 去掉 info 并入菜单 | B（info 回标题旁，「和 DSH 说」靠右、在页面动作左侧） | |
| P2 | 入口是否保留「✦」符号 | 保留 / 去掉 | 保留（logo 徽标已改为「✦」引号框字形，入口星形与品牌线索一致） | |
| P3 | 窄面板下入口表现 | 文字 + 图标 / 仅图标（tooltip 补文字） | 仅图标（需补一条容器查询，待实现） | |

## 5. 定稿后的动作（本节最终删除）

1. 删除「反馈」列、「状态」说明、第 4 节与本第 5 节，只留三张终稿表。
2. 按终稿逐条替换 `src/client/i18n/app.ts`、`notes.ts`、`tasks.ts`、`notebook.ts` 中的对应 key（中英同步）。
3. 若 P1/P2/P3 有改动，一并落到 `DeskHeader.tsx` / `DeskAskMenu.tsx` / `app/styles.ts`，并更新 `08-coauthoring.md`。
4. 跑插件 `verify`（含 i18n 键集一致性测试）与根 `pnpm run check`，按仓库规范提交。
