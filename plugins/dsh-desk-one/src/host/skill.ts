/**
 * Bundled Desk One operating guide.
 *
 * Tool names already say what they do (explicit verbs per object). What a per-tool description
 * cannot carry is the shared knowledge: which object a request belongs to, the list→revision→update
 * sequence, and what archiving/deleting cascades to. This one short runtime skill holds those rules.
 *
 * Registered through the optional skill service: a host without it simply gets no guide (the tools
 * still work), and the registration is disposed with this plugin.
 */

import type { Context } from '@deepseek-ai/cordis'

/** The skill body: object model, routing rules, and the revision workflow. */
const CONTENT = `# Desk One（同桌）操作指南

Desk One 是用户的「一张办公桌」，同一份对象存在面板里，工具与界面读写同一批数据。

## 对象

- **便签 note**：墙上的一张便签，适合随手记、想法、提醒；标题可选，正文 Markdown。
- **任务 task**：任务板上的卡片，有泳道状态（todo / doing / done）、可选截止日期、可归入分组；"完成"用 desk_task_complete 或 status=done。
- **分组 group**：任务板某一泳道内的一层分组；整组移动会把组内卡片一起换泳道；只有 done 泳道的分组能归档。
- **日程 schedule**：外部日历的只读镜像，不能写回外部日历；sync 只是重新拉取。
- **工作区文件 / 批注**：工作区里的 Markdown / 文本文件，不是 Desk 对象；AI 用文件工具读写，批注由用户在「批注」视图里做，不走 Desk 工具。

## 选哪个对象

- 有时限、要跟进、有完成状态 → 任务（不要用便签代替待办）。
- 随手记、想法、不需要跟进 → 便签。
- 成篇内容、要长期维护 → 工作区里的 Markdown / 文本文件（用文件工具读 / 改；批注由用户在界面里做）。
- 只是想看看外部日历 → 日程只读工具。

## 工具

- 便签：desk_note_list → desk_note_add（新建）/ desk_note_update（改）/ desk_note_delete（不可恢复）。
- 任务：desk_task_list → desk_task_add（新建）/ desk_task_update（改标题正文泳道截止排序分组）/ desk_task_complete（完成）/ desk_task_archive（存档或恢复）。
- 分组：desk_group_list → desk_group_add（新建）/ desk_group_update（改名排序）/ desk_group_move（整组换泳道）/ desk_group_archive（存档或恢复）/ desk_group_delete（删除已归档分组会连卡片一起删）。
- 日程：desk_schedule_list / desk_schedule_sync / desk_schedule_connections（全部只读）。

## 规则

1. 更新 / 完成 / 存档 / 移动任何已有对象前：先 list 拿 id 和 revision，再把该 revision 作为 expected_revision 传入。报 revision 冲突就重新 list 再改。
2. 同一泳道内分组名唯一；建分组前先 list 查重，能复用就不要新建。
3. 任务归组时，分组泳道必须与 task.status 一致。
4. 删除 / 存档影响多个对象（分组存档连带卡片、删除已归档分组连卡片删除）：先向用户确认再执行。
5. 日程只读：不要声称能修改或写回外部日历。
6. 批注草稿 / 批注记录由人操作，不要用工具代劳；需要改工作区文件内容时用文件工具。`

/** Runtime skill registration accepted by the optional skill service. */
export const DESK_ONE_SKILL = {
  name: 'desk-one',
  description: 'Operate the user\'s Desk One (同桌): notes wall (便签), task board (任务 / 分组), and the read-only schedule mirror. Covers which object to use, the list→revision→update flow, and archive/delete consequences.',
  whenToUse: 'Use when the user asks to add, find, update, complete, archive or delete 便签/notes, 任务/tasks or task groups, or asks about the notes wall, task board, Desk One, or its schedule tab.',
  source: 'bundled',
  invocation: { modelInvocable: true, userInvocable: true },
  content: CONTENT,
} as const

/**
 * Register the guide through the optional skill service.
 * @param ctx - DSH plugin context.
 */
export function installDeskSkill(ctx: Context): void {
  // Test doubles and stripped hosts may not implement the optional-dependency fork.
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['skills'], (scoped) => {
    const skills = (scoped as unknown as {
      get(name: string): { register(skill: typeof DESK_ONE_SKILL): () => void } | undefined
    }).get('skills')
    if (skills === undefined) return
    scoped.effect(() => skills.register(DESK_ONE_SKILL), 'dsh-desk-one: operating guide skill')
  })
}
