

import type { Context } from '@deepseek-ai/cordis'
import { PREFIX } from './constants.js'
import { assertHostGates } from './host/gates.js'
import { createDeskRequestHandler } from './host/router.js'
import { DeskStore } from './host/store.js'
import { NotebookHost } from './host/notebook/host.js'
import { installDeskSkill } from './host/skill.js'
import { installTaskCapturePrompt } from './host/prompt.js'
import { ScheduleHost } from './host/schedule/host.js'
import { registerScheduleTools } from './host/schedule/tools.js'
import { registerNotebookTools } from './host/notebook/tools.js'
import { installSessionsHost, hasSessionServices, type SessionsConfig } from './host/sessions/install.js'
import { registerDeskTools } from './host/notes/tools.js'
import { registerGroupTools } from './host/tasks/group-tools.js'
import { registerTaskTools } from './host/tasks/tools.js'

export const name = 'dsh-desk-one'
export const inject = [
  'webServer', 'storageDomain', 'tools',


  'sessions', 'agents', 'workspaceRegistry', 'sessionPersistence', 'sessionQuery',
]


export async function apply(ctx: Context, config: SessionsConfig = {}): Promise<void> {


  assertHostGates(ctx)
  const store = await DeskStore.open(ctx)
  ctx.effect(() => () => store.close(), 'dsh-desk-one: storage domain')



  const sessions = hasSessionServices(ctx) ? await installSessionsHost(ctx, store, config) : undefined

  const schedule = new ScheduleHost(ctx, store)
  const notebook = new NotebookHost(store)
  const handler = createDeskRequestHandler({ ctx, store, schedule, sessions, notebook })
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler,
  }), 'dsh-desk-one: REST routes')

  registerDeskTools(ctx, store)
  registerTaskTools(ctx, store)
  registerGroupTools(ctx, store)
  registerScheduleTools(ctx, schedule)
  registerNotebookTools(ctx, notebook)


  installDeskSkill(ctx)
  installTaskCapturePrompt(ctx)
  if (sessions !== undefined) {


    void sessions.refreshIndex().catch(() => undefined)
  }
}
