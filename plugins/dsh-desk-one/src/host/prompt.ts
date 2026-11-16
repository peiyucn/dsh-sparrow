/**
 * Always-on task-capture nudge.
 *
 * A skill alone cannot own this trigger: the model only loads a skill when its catalog description
 * matches the request, so a new conversation that merely sounds like a task would never see the
 * rule. This short prompt section is the trigger; the detailed playbook stays in the bundled
 * `desk-one` skill, and the `desk_task_add` tool owns the actual session link.
 */

import type { Context } from '@deepseek-ai/cordis'

/** Section name; stable so a host can shadow or replace it deliberately. */
export const DESK_ONE_PROMPT_NAME = 'dsh-desk-one:task-capture'

/** Keep this short: it is assembled into every request. */
const CONTENT = `Desk One task capture: on the first user message of a new user-facing session (never in a subagent session), if the request is a trackable task, todo, reminder, follow-up, plan or deadline — not merely the word "任务" — ask once whether to add a todo card on the Desk One board and link this conversation. If the user agrees, call desk_task_add with status "todo" and link_current_session: true. If they decline, never ask again in this session. Skip pure questions, explanations, code/file edits, and sessions that already have a task linked to this conversation.`

/** Prompt section accepted by the optional system-prompt service. */
export const DESK_ONE_PROMPT = {
  name: DESK_ONE_PROMPT_NAME,
  order: 700,
  text: CONTENT,
} as const

/** Register the capture nudge through the optional system-prompt service. */
export function installDeskPrompt(ctx: Context): void {
  // Stripped hosts and test doubles may not implement the optional-dependency fork.
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['systemPrompt'], (scoped) => {
    const systemPrompt = (scoped as unknown as {
      get(name: string): { section(section: typeof DESK_ONE_PROMPT): () => void } | undefined
    }).get('systemPrompt')
    if (systemPrompt === undefined) return
    scoped.effect(() => systemPrompt.section(DESK_ONE_PROMPT), 'dsh-desk-one: task-capture prompt')
  })
}
