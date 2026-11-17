

import type { Context } from '@deepseek-ai/cordis'


const CONTENT = `# Desk One（同桌）操作指南

Desk One 是用户的「一张办公桌」，同一份对象存在面板里，工具与界面读写同一批数据。

## 对象

- **便签 note**：墙上的一张便签，适合随手记、想法、提醒；标题可选，正文 Markdown。
- **任务 task**：任务板上的卡片，有泳道状态（todo / doing / done）、可选截止日期、可归入分组；"完成"用 desk_task_complete 或 status=done。
- **分组 group**：任务板某一泳道内的一层分组；整组移动会把组内卡片一起换泳道；只有 done 泳道的分组能归档。
- **日程 schedule**：外部日历的只读镜像，不能写回外部日历；sync 只是重新拉取。
- **笔记页 page / 批注**：文件系统里的笔记与审阅对象，不是 Desk 节点；Desk 只提供只读检索 desk_page_list，AI 用文件工具读 / 改稿，批注由用户在界面里做。工作区由用户在面板顶栏链接或切换，没有对应的写工具。

## 选哪个对象

- 有时限、要跟进、有完成状态 → 任务（不要用便签代替待办）。
- 随手记、想法、不需要跟进 → 便签。
- 成篇内容、要长期维护 → 笔记页（用 desk_page_list 检索，用文件工具读/改，不用 Desk 写工具）。
- 只是想看看外部日历 → 日程只读工具。

## 新会话任务捕获

- 只在用户新会话的第一次输入里判断：如果用户明确要跟踪一件事（任务 / 待办 / 提醒 / 跟进 / 计划 / 截止日期），先问一次是否在任务板建一个待办并挂上本会话；用户拒绝后本会话不再提。纯问答、解释、改代码 / 改文件、或本会话已有任务关联时不问，也不要先建任务再问。
- 用户同意后再调用 desk_task_add：状态默认 todo，标题从用户原话提炼（用户改名就按新名），body 只写一句来源 / 目标；传 link_current_session: true 把本会话挂上。

## 工具

- 便签：desk_note_list → desk_note_add（新建）/ desk_note_update（改）/ desk_note_delete（不可恢复）。
- 任务：desk_task_list → desk_task_add（新建；可传 link_current_session 挂当前会话）/ desk_task_update（改标题正文泳道截止排序分组）/ desk_task_complete（完成）/ desk_task_archive（仅完成列，存档或恢复）。
- 分组：desk_group_list → desk_group_add（新建）/ desk_group_update（改名排序）/ desk_group_move（整组换泳道）/ desk_group_archive（存档或恢复）/ desk_group_delete（删除已归档分组会连卡片一起删）。
- 日程：desk_schedule_list / desk_schedule_sync / desk_schedule_connections（全部只读）。
- 笔记批注（笔记页）：desk_page_list（只读检索标题 / 路径 / 标签 / 缺元数据 / 空笔记，返回相对 root 的路径；root 是当前链接工作区的绝对路径）；读正文、改稿仍用文件工具，不要用 Desk 工具写笔记；链接 / 切换工作区由用户在面板顶栏操作。

## 规则

1. 更新 / 完成 / 存档 / 移动任何已有对象前：先 list 拿 id 和 revision，再把该 revision 作为 expected_revision 传入。报 revision 冲突就重新 list 再改。
2. 同一泳道内分组名唯一；建分组前先 list 查重，能复用就不要新建。
3. 任务归组时，分组泳道必须与 task.status 一致。
4. 删除 / 存档影响多个对象（分组存档连带卡片、删除已归档分组连卡片删除）：先向用户确认再执行。
5. 日程只读：不要声称能修改或写回外部日历。
6. 笔记的批注草稿 / 批注记录由人操作，不要用工具代劳；需要改笔记内容时用文件工具。
7. 只有完成列的任务才能 archive；未完成任务先 complete 或移动到完成列，不要直接存档。`


export const DESK_ONE_SKILL = {
  name: 'desk-one',
  description: 'Operate the user\'s Desk One (同桌): notes wall (便签), task board (任务 / 分组), the read-only schedule mirror, and the read-only page search for the linked notebook (笔记批注). Covers object choice, new-conversation task capture, workspace linking rules, the list→revision→update flow, and archive/delete consequences.',
  whenToUse: 'Use when the user asks to add, find, update, complete, archive or delete 便签/notes, 任务/tasks or task groups, asks about the notes wall, task board, Desk One, its schedule tab, or the linked notebook pages / annotations.',
  source: 'bundled',
  invocation: { modelInvocable: true, userInvocable: true },
  content: CONTENT,
} as const


export function installDeskSkill(ctx: Context): void {

  if (typeof ctx.inject !== 'function') return
  ctx.inject(['skills'], (scoped) => {
    const skills = (scoped as unknown as {
      get(name: string): { register(skill: typeof DESK_ONE_SKILL): () => void } | undefined
    }).get('skills')
    if (skills === undefined) return
    scoped.effect(() => skills.register(DESK_ONE_SKILL), 'dsh-desk-one: operating guide skill')
  })
}
