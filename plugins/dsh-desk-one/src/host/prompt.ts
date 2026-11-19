import type { Context } from '@deepseek-ai/cordis'

export const TASK_CAPTURE_PROMPT = {
  name: 'desk-one:task-capture',
  order: 9500,
  text: `Desk One task capture (first user input only):
Only when the first user input of a user-facing session clearly describes follow-up work (a task, todo, reminder, follow-up, plan, or deadline), ask once before writing.

Before asking:
- Do not trigger for pure Q&A, explanations, code/file edits, subagent sessions, or when this session is already linked to a task.
- Call desk_task_list with linked_to_current_session=true. If it returns a task, this session is already linked: do nothing.
- If this conversation already created a matching task that is not linked, or the user names an existing task, ask whether to link this session to that task. On consent call desk_task_update with link_current_session=true and the task's current revision; do not create a duplicate.
- If several existing tasks could match, ask the user which one; never guess.
- If no existing task matches, ask whether to create one. On consent call desk_task_add with link_current_session=true, status todo, a title taken from the user's own wording, and a one-sentence body.
Never create a task or change a link without the user's explicit consent. If the user declines, do not ask again in this session.`,
} as const

type SectionRegistry = {
  section(section: typeof TASK_CAPTURE_PROMPT): () => void
}

type PromptScopedContext = {
  get(name: string): SectionRegistry | undefined
  effect(callback: () => () => void, label: string): void
}

export function installTaskCapturePrompt(ctx: Context): void {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['systemPrompt'], (scoped) => {
    const promptContext = scoped as unknown as PromptScopedContext
    const systemPrompt = promptContext.get('systemPrompt')
    if (systemPrompt === undefined) return
    promptContext.effect(() => systemPrompt.section(TASK_CAPTURE_PROMPT), 'dsh-desk-one: task capture prompt')
  })
}
